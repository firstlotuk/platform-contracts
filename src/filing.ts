/**
 * Filing hub ↔ child app boundary contracts.
 *
 * These types cross the hub/child-app boundary. They must be stable.
 * No ingestion-specific or broker-specific types belong here.
 *
 * Source of truth: SUITE_DETAILED_EXECUTION_PLAN.md §3.1, §3.2, §3.2a
 */

// ---------------------------------------------------------------------------
// App IDs
// ---------------------------------------------------------------------------

export type ChildAppId =
  | 'cgt-app'
  | 'property-app'
  | 'employment-app'
  | 'foreign-income-app';

export type ChildAppStatusValue =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_review';

// ---------------------------------------------------------------------------
// 3.1 FilingContext — hub -> child app
// ---------------------------------------------------------------------------

export interface FilingContext {
  /** Stable identifier for the taxpayer (maps to user ID in hub). */
  taxpayerId: string;
  /** Unique identifier for this filing case (one per tax year per taxpayer). */
  filingCaseId: string;
  /**
   * HMRC tax year in "YYYY-YY" format.
   * @example "2024-25"
   */
  taxYear: string;
  /** HMRC form codes required for this filing case. e.g. ["SA100", "SA108"] */
  activeForms: string[];
  /** Always "filing-hub" — prevents child apps inventing their own context sources. */
  originApp: 'filing-hub';
  /** URL the child app should return to when the user completes or exits. */
  returnUrl: string;
}

// ---------------------------------------------------------------------------
// 3.2 ChildAppStatus — child app -> hub
//
// Discriminated union on appId. Each child app gets a concrete status type
// with a typed summary. Add new app status types to the ChildAppStatus union
// as each child app is built.
// ---------------------------------------------------------------------------

export interface BaseChildAppStatus {
  filingCaseId: string;
  taxYear: string;
  status: ChildAppStatusValue;
  /** Human-readable warnings surfaced to the hub review screen. */
  warnings: string[];
}

export interface CgtChildAppStatus extends BaseChildAppStatus {
  appId: 'cgt-app';
  summary: CgtAppSummary;
}

/**
 * Discriminated union over appId.
 * Currently only cgt-app is defined. Add new app status types here
 * as property-app, employment-app, and foreign-income-app are built.
 *
 * Narrow by appId to get typed access to summary:
 *   if (status.appId === 'cgt-app') status.summary.sa108Required
 */
export type ChildAppStatus =
  | CgtChildAppStatus;
  // | PropertyChildAppStatus   — add when property-app is built
  // | EmploymentChildAppStatus — add when employment-app is built
  // | ForeignIncomeChildAppStatus

// ---------------------------------------------------------------------------
// Per-app summary types
// ---------------------------------------------------------------------------

/**
 * CGT-specific summary. Typed so the hub can render SA108 facts
 * without reading cgt-app's database directly.
 */
export interface CgtAppSummary {
  kind: 'cgt-app';
  /**
   * Tax year this summary covers. Must match ChildAppStatus.taxYear.
   * Required so the hub can handle multi-year and multi-case views unambiguously.
   */
  taxYear: string;
  sa108Required: boolean;
  disposalCount?: number;
  totalProceeds?: number;
  totalGains?: number;
  totalLosses?: number;
  dataQuality?: 'clean' | 'needs_review';
}

/** Union of all app summaries. Discriminate on .kind. */
export type AppSummary = CgtAppSummary;
// | PropertyAppSummary | EmploymentAppSummary | ForeignIncomeAppSummary

// ---------------------------------------------------------------------------
// 3.2a SuiteAppAccess
// ---------------------------------------------------------------------------

export interface SuiteAppAccess {
  /** Apps this user/account is licensed or permitted to access. */
  availableApps: ChildAppId[];
  /** Apps required for the active filing case (determined by the hub, not access control). */
  requiredApps: ChildAppId[];
  /** Apps the user has opened at least once for this filing case. */
  enteredApps: ChildAppId[];
}

// ---------------------------------------------------------------------------
// Filing hub status card model (hub UI rendering contract)
// ---------------------------------------------------------------------------

export interface FilingAppCard {
  appId: ChildAppId;
  label: string;
  required: boolean;
  available: boolean;
  status: ChildAppStatusValue;
  warnings: string[];
  summary?: AppSummary;
  launchUrl: string;
}
