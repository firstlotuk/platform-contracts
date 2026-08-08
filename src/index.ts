// SERVER-side contract entry point (full barrel).
//
// Re-exports everything from the universal entry (./browser) plus the Ajv-backed
// filing-contribution-pack validator from ./filing-contribution-pack-validate.
//
// The runtime-domain boundary (FIR-579/FIR-584) is enforced STRUCTURALLY: the validator (and
// therefore Ajv) is reachable only through THIS entry, never through ./browser. Client- and
// Edge-reachable code must import '@firstlot/platform-contracts/browser', which has no path to
// Ajv, so it can never pull the validator into a client bundle. Consumers should additionally
// forbid the bare server barrel in 'use client'/edge files via ESLint no-restricted-imports
// (recommended defense-in-depth), so an accidental barrel import in a client file fails CI.
//
// This barrel is safe to import from Node server code and Node build tooling (it is not
// `server-only`-guarded — that shim throws in any non-react-server target, including plain Node).
export * from './browser';
export {
  sha256CanonicalJson,
  computeContributionPayloadHash,
} from './filing-contribution-pack-node';
export {
  validateFilingContributionPack,
  assertFilingContributionPack,
} from './filing-contribution-pack-validate';
