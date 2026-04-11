// Filing hub ↔ child app boundary
export type {
  ChildAppId,
  ChildAppStatusValue,
  FilingContext,
  ChildAppStatus,
  SuiteAppAccess,
} from './filing';

// Investment Tax App (cgt-app) output contract
export type {
  InvestmentTaxFactSummary,
  ReviewItemSummary,
  InvestmentTaxFilingArtifacts,
  ComputationDossierSummary,
  InvestmentTaxAppOutput,
} from './investment-tax';

// Deprecated alias — see ./summaries
export type { CgtFactSummary } from './summaries';
