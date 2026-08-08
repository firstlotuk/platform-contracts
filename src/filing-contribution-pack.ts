// Ajv-free module (FIR-579 runtime-domain boundary): this file must stay importable from
// client components, Edge middleware, and server code alike. Ajv-backed schema validation
// (validateFilingContributionPack/assertFilingContributionPack) lives in the sibling
// ./filing-contribution-pack-validate module (exported only from ./index, never ./browser) and
// depends on these pure exports — never add an Ajv import here.
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

export function isCanonicalDecimalAtScale(value: string, scale: number): boolean {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) return false;
  if (scale === 0) return /^(?!-0$)-?(?:0|[1-9][0-9]*)$/.test(value);
  return new RegExp(`^(?!-0\\.0{${scale}}$)-?(?:0|[1-9][0-9]*)\\.[0-9]{${scale}}$`).test(value);
}

export {
  FILING_CONTRIBUTION_PACK_SCHEMA,
  FILING_CONTRIBUTION_PACK_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_SCHEMA_ID,
  FILING_CONTRIBUTION_PACK_SCHEMA_VERSION,
};
