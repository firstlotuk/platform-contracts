// SERVER-side: Ajv-backed schema validation for the filing-contribution-pack contract.
//
// This module pulls in Ajv, whose `new Function()` schema codegen violates a no-unsafe-eval
// CSP if it reaches a browser bundle (FIR-579/FIR-584). The runtime-domain boundary is
// enforced STRUCTURALLY, not by a runtime throw:
//   - This module is re-exported ONLY from the full server entry (`./index`), never from
//     `./browser`. Client- and Edge-reachable code imports `@firstlot/platform-contracts/browser`,
//     which has no path to Ajv, so the validator can never be pulled into a client bundle.
//   - Consumers SHOULD additionally forbid the bare server barrel in `'use client'`/edge files
//     via an ESLint `no-restricted-imports` rule (recommended build-time gate) so an accidental
//     `@firstlot/platform-contracts` import in a client file fails CI rather than shipping Ajv.
// NOTE: do NOT reintroduce `import 'server-only'` here. `server-only` throws in ANY target
// lacking the bundler `react-server` condition — including plain Node (tsc, codegen scripts,
// tests). Since this module IS legitimate server/Node code (Ajv is a Node library) and is
// imported from Node build tooling (e.g. rule-packs codegen), the throw breaks valid consumers.
import Ajv2020, { ErrorObject, ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type {
  FilingContributionPackEnvelope,
  FilingContributionPackEnvelopeV1,
  FilingContributionPackEnvelopeV2,
} from './generated/filing-contribution-pack';
import {
  FILING_CONTRIBUTION_PACK_V1_SCHEMA,
  FILING_CONTRIBUTION_PACK_V1_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_V1_SCHEMA_ID,
  FILING_CONTRIBUTION_PACK_V1_SCHEMA_VERSION,
  FILING_CONTRIBUTION_PACK_V2_SCHEMA,
  FILING_CONTRIBUTION_PACK_V2_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_V2_SCHEMA_ID,
  FILING_CONTRIBUTION_PACK_V2_SCHEMA_VERSION,
} from './generated/filing-contribution-pack-schema';
import {
  type ContributionPackValidationError,
  type ContributionPackValidationResult,
} from './filing-contribution-pack';
import { computeContributionPayloadHash } from './filing-contribution-pack-node';

// Compiled lazily (not at module scope) because ajv.compile() JIT-generates the validator via
// `new Function(...)`, which requires the `unsafe-eval` CSP source. Kept lazy so the cost of
// compiling only lands on callers that actually validate. This module never reaches a
// client/edge bundle because it is exported only from ./index, never from ./browser (see header).
let cachedAjv: Ajv2020 | undefined;
let cachedValidateSchemaV1: ValidateFunction<FilingContributionPackEnvelopeV1> | undefined;
let cachedValidateSchemaV2: ValidateFunction<FilingContributionPackEnvelopeV2> | undefined;

function getAjv(): Ajv2020 {
  if (!cachedAjv) {
    cachedAjv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(cachedAjv);
  }
  return cachedAjv;
}

function getValidateSchema(version: 'v1' | 'v2'): ValidateFunction<FilingContributionPackEnvelope> {
  if (version === 'v1') {
    cachedValidateSchemaV1 ??= getAjv().compile<FilingContributionPackEnvelopeV1>(FILING_CONTRIBUTION_PACK_V1_SCHEMA);
    return cachedValidateSchemaV1;
  }
  cachedValidateSchemaV2 ??= getAjv().compile<FilingContributionPackEnvelopeV2>(FILING_CONTRIBUTION_PACK_V2_SCHEMA);
  return cachedValidateSchemaV2;
}

function schemaError(error: ErrorObject): ContributionPackValidationError {
  return {
    code: 'SCHEMA_INVALID',
    path: error.instancePath || '/',
    message: error.message ?? error.keyword,
  };
}

function duplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function schemaVersionFor(input: unknown): 'v1' | 'v2' | null {
  const payload = isRecord(input) && isRecord(input.packPayload) ? input.packPayload : null;
  const contract = payload && isRecord(payload.contract) ? payload.contract : null;
  if (!contract) return null;

  if (
    contract.schemaId === FILING_CONTRIBUTION_PACK_V1_SCHEMA_ID &&
    contract.schemaVersion === FILING_CONTRIBUTION_PACK_V1_SCHEMA_VERSION &&
    contract.schemaHash === FILING_CONTRIBUTION_PACK_V1_SCHEMA_HASH
  ) {
    return 'v1';
  }
  if (
    contract.schemaId === FILING_CONTRIBUTION_PACK_V2_SCHEMA_ID &&
    contract.schemaVersion === FILING_CONTRIBUTION_PACK_V2_SCHEMA_VERSION &&
    contract.schemaHash === FILING_CONTRIBUTION_PACK_V2_SCHEMA_HASH
  ) {
    return 'v2';
  }
  return null;
}

function identityMismatch(): ContributionPackValidationResult {
  return {
    ok: false,
    errors: [{
      code: 'SCHEMA_IDENTITY_MISMATCH',
      path: '/packPayload/contract',
      message: 'Pack contract identity does not match an installed immutable schema',
    }],
  };
}

export function validateFilingContributionPack(input: unknown): ContributionPackValidationResult {
  const version = schemaVersionFor(input);
  if (!version) return identityMismatch();

  const validateSchema = getValidateSchema(version);
  if (!validateSchema(input)) {
    return { ok: false, errors: (validateSchema.errors ?? []).map(schemaError) };
  }

  const pack = input as FilingContributionPackEnvelope;
  const errors: ContributionPackValidationError[] = [];
  const payload = pack.packPayload;

  if (pack.contentHash !== computeContributionPayloadHash(payload)) {
    errors.push({
      code: 'CONTENT_HASH_MISMATCH',
      path: '/contentHash',
      message: 'contentHash does not match RFC 8785 canonical packPayload bytes',
    });
  }

  if (
    !payload.formDefinitionSetId.startsWith(`uk-sa/${payload.taxYear}@`) ||
    !payload.permittedScopeId.startsWith(`uk-sa/${payload.taxYear}/`)
  ) {
    errors.push({
      code: 'ANNUAL_IDENTITY_MISMATCH',
      path: '/packPayload',
      message: 'taxYear must match the annual definition and permitted-scope identities',
    });
  }

  const expectedScopeProducer = payload.producer === 'income-app' ? 'income' : 'cgt';
  if (!payload.permittedScopeId.startsWith(`uk-sa/${payload.taxYear}/${expectedScopeProducer}@`)) {
    errors.push({
      code: 'PRODUCER_SCOPE_MISMATCH',
      path: '/packPayload/permittedScopeId',
      message: 'Producer must match the closed annual permitted scope',
    });
  }

  const duplicateSemanticId = duplicate(payload.values.map((value) => value.semanticId));
  if (duplicateSemanticId) {
    errors.push({
      code: 'DUPLICATE_SEMANTIC_ID',
      path: '/packPayload/values',
      message: `Duplicate contribution semantic: ${duplicateSemanticId}`,
    });
  }

  const duplicateRulesetId = duplicate(payload.producerProvenance.rulesets.map((ruleset) => ruleset.id));
  if (duplicateRulesetId) {
    errors.push({
      code: 'DUPLICATE_RULESET_ID',
      path: '/packPayload/producerProvenance/rulesets',
      message: `Duplicate ruleset identity: ${duplicateRulesetId}`,
    });
  }

  if (payload.values.some((value) => value.provenance.sourceRevisionHash !== payload.producerProvenance.sourceRevisionHash)) {
    errors.push({
      code: 'SOURCE_REVISION_MISMATCH',
      path: '/packPayload/values',
      message: 'Every contributed value must retain the payload source-revision hash',
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: pack };
}

export function assertFilingContributionPack(input: unknown): FilingContributionPackEnvelope {
  const result = validateFilingContributionPack(input);
  if (!result.ok) {
    throw new TypeError(`Invalid filing contribution pack: ${result.errors.map((e) => `${e.path} ${e.code}`).join(', ')}`);
  }
  return result.value;
}
