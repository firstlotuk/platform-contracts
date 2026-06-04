// Filing hub ↔ child app boundary
export type {
  ChildAppId,
  ChildAppStatusValue,
  FilingContext,
  ChildAppStatus,
  SuiteAppAccess,
} from './filing';

// Shared structured review item (cgt-app + income-app)
export type { ReviewItemSummary } from './review';

// Investment Tax App (cgt-app) output contract
export type {
  InvestmentTaxFactSummary,
  InvestmentTaxFilingArtifacts,
  ComputationDossierSummary,
  InvestmentTaxAppOutput,
} from './investment-tax';

// Income Tax App (income-app) output contract
export type {
  IncomeTaxFactSummary,
  IncomeTaxFilingArtifacts,
  IncomeTaxAppOutput,
} from './income-tax';

// Deprecated alias — see ./summaries
export type { CgtFactSummary } from './summaries';

// Accountant engagement boundary — AccountantTask + Opinion (Tier 1 + Tier 2 domain types)
export type {
  AccountantTaskId,
  OpinionId,
  AccountantId,
  SnapshotId,
  FactId,
  AccountantTaskType,
  AccountantTaskState,
  OpinionStrength,
  SnapshotRef,
  AssignedAccountant,
  AccountantTaskRow,
  OpinionRow,
  OpinionFreshness,
} from './accountant';
