// SERVER-only contract entry point (full barrel).
//
// Re-exports everything from the universal entry (./browser) plus the Ajv-backed
// filing-contribution-pack validator, which is `import 'server-only'`-guarded in
// ./filing-contribution-pack-validate. Importing this module (or the validator) from a
// client component or Edge runtime module (middleware, 'use client' files) fails the
// build — that guard is what makes the runtime-domain boundary enforced, not conventional.
//
// Client- and Edge-reachable code must import '@firstlot/platform-contracts/browser' instead.
export * from './browser';
export {
  validateFilingContributionPack,
  assertFilingContributionPack,
} from './filing-contribution-pack-validate';
