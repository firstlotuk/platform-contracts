// SERVER-only: Ajv-backed schema validation for the filing-contribution-pack contract.
//
// `import 'server-only'` makes this module fail to build the moment it is reachable from a
// client component or Edge runtime bundle (Next.js aliases the package to a throwing shim for
// those compilation targets), instead of silently shipping Ajv's `new Function()` schema
// codegen to the browser under a no-unsafe-eval CSP (FIR-579/FIR-584). Never re-export this
// module — or anything that imports it — from ./browser.
import 'server-only';
import Ajv2020, { ErrorObject, ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type {
  FilingContributionPackEnvelope,
} from './generated/filing-contribution-pack';
import { FILING_CONTRIBUTION_PACK_SCHEMA } from './generated/filing-contribution-pack-schema';
import {
  FILING_CONTRIBUTION_PACK_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_SCHEMA_ID,
  FILING_CONTRIBUTION_PACK_SCHEMA_VERSION,
  computeContributionPayloadHash,
  type ContributionPackValidationError,
  type ContributionPackValidationResult,
} from './filing-contribution-pack';

// Compiled lazily (not at module scope) because ajv.compile() JIT-generates the validator via
// `new Function(...)`, which requires the `unsafe-eval` CSP source. Kept lazy so the cost of
// compiling only lands on callers that actually validate — the `server-only` guard above is
// what stops this module from reaching a client/edge bundle in the first place.
let cachedValidateSchema: ValidateFunction<FilingContributionPackEnvelope> | undefined;

function getValidateSchema(): ValidateFunction<FilingContributionPackEnvelope> {
  if (!cachedValidateSchema) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    cachedValidateSchema = ajv.compile<FilingContributionPackEnvelope>(FILING_CONTRIBUTION_PACK_SCHEMA);
  }
  return cachedValidateSchema;
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

export function validateFilingContributionPack(input: unknown): ContributionPackValidationResult {
  const validateSchema = getValidateSchema();
  if (!validateSchema(input)) {
    return { ok: false, errors: (validateSchema.errors ?? []).map(schemaError) };
  }

  const errors: ContributionPackValidationError[] = [];
  const payload = input.packPayload;
  if (
    payload.contract.schemaId !== FILING_CONTRIBUTION_PACK_SCHEMA_ID ||
    payload.contract.schemaVersion !== FILING_CONTRIBUTION_PACK_SCHEMA_VERSION ||
    payload.contract.schemaHash !== FILING_CONTRIBUTION_PACK_SCHEMA_HASH
  ) {
    errors.push({
      code: 'SCHEMA_IDENTITY_MISMATCH',
      path: '/packPayload/contract',
      message: 'Pack contract identity does not match the installed immutable schema',
    });
  }

  if (input.contentHash !== computeContributionPayloadHash(payload)) {
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

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: input };
}

export function assertFilingContributionPack(input: unknown): FilingContributionPackEnvelope {
  const result = validateFilingContributionPack(input);
  if (!result.ok) {
    throw new TypeError(`Invalid filing contribution pack: ${result.errors.map((e) => `${e.path} ${e.code}`).join(', ')}`);
  }
  return result.value;
}
