// Filing hub ↔ child app boundary
export type {
  ChildAppId,
  ChildAppStatusValue,
  FilingContext,
  BaseChildAppStatus,
  CgtChildAppStatus,
  ChildAppStatus,
  CgtAppSummary,
  AppSummary,
  SuiteAppAccess,
  FilingAppCard,
} from './filing';

// Fact summaries (child apps -> hub / rule-engine-service)
export type { CgtFactSummary } from './summaries';
