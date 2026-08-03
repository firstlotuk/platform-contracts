import { createHash } from 'crypto';
import Ajv2020, { ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { canonicalize } from 'json-canonicalize';
import type {
  FilingContributionPackEnvelope,
  PackPayload,
} from './generated/filing-contribution-pack';
import {
  FILING_CONTRIBUTION_PACK_SCHEMA,
  FILING_CONTRIBUTION_PACK_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_SCHEMA_ID,
  FILING_CONTRIBUTION_PACK_SCHEMA_VERSION,
} from './generated/filing-contribution-pack-schema';

export type ContributionPackValidationErrorCode =
  | 'SCHEMA_INVALID'
  | 'SCHEMA_IDENTITY_MISMATCH'
  | 'CONTENT_HASH_MISMATCH'
  | 'ANNUAL_IDENTITY_MISMATCH'
  | 'PRODUCER_SCOPE_MISMATCH'
  | 'SOURCE_REVISION_MISMATCH'
  | 'DUPLICATE_SEMANTIC_ID'
  | 'DUPLICATE_RULESET_ID';

export interface ContributionPackValidationError {
  code: ContributionPackValidationErrorCode;
  path: string;
  message: string;
}

export type ContributionPackValidationResult =
  | { ok: true; value: FilingContributionPackEnvelope }
  | { ok: false; errors: ContributionPackValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<FilingContributionPackEnvelope>(FILING_CONTRIBUTION_PACK_SCHEMA);

function schemaError(error: ErrorObject): ContributionPackValidationError {
  return {
    code: 'SCHEMA_INVALID',
    path: error.instancePath || '/',
    message: error.message ?? error.keyword,
  };
}

export function canonicalizeContributionJson(value: unknown): string {
  assertIJson(value, new Set());
  return canonicalize(value);
}

function assertIJson(value: unknown, ancestors: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('RFC 8785 JSON numbers must be finite');
    return;
  }
  if (typeof value !== 'object') throw new TypeError(`Value contains non-JSON type: ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError('RFC 8785 JSON cannot contain circular references');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertIJson(item, ancestors);
  } else {
    for (const item of Object.values(value)) assertIJson(item, ancestors);
  }
  ancestors.delete(value);
}

export function sha256CanonicalJson(value: unknown): `sha256:${string}` {
  const bytes = canonicalizeContributionJson(value);
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

export function computeContributionPayloadHash(payload: PackPayload): `sha256:${string}` {
  return sha256CanonicalJson(payload);
}

export function isCanonicalDecimalAtScale(value: string, scale: number): boolean {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) return false;
  if (scale === 0) return /^(?!-0$)-?(?:0|[1-9][0-9]*)$/.test(value);
  return new RegExp(`^(?!-0\\.0{${scale}}$)-?(?:0|[1-9][0-9]*)\\.[0-9]{${scale}}$`).test(value);
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

export {
  FILING_CONTRIBUTION_PACK_SCHEMA,
  FILING_CONTRIBUTION_PACK_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_SCHEMA_ID,
  FILING_CONTRIBUTION_PACK_SCHEMA_VERSION,
};
