// Node-only helpers for contribution-pack content hashes.
//
// Keep this separate from ./filing-contribution-pack so the ./browser entry remains free of
// Node built-ins. Client and Edge consumers must use @firstlot/platform-contracts/browser;
// server-side producers that need SHA-256 hashes use @firstlot/platform-contracts/node.
import { createHash } from 'crypto';
import type { PackPayload } from './generated/filing-contribution-pack';
import { canonicalizeContributionJson } from './filing-contribution-pack';

export { canonicalizeContributionJson } from './filing-contribution-pack';

export function sha256CanonicalJson(value: unknown): `sha256:${string}` {
  const bytes = canonicalizeContributionJson(value);
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

export function computeContributionPayloadHash(payload: PackPayload): `sha256:${string}` {
  return sha256CanonicalJson(payload);
}
