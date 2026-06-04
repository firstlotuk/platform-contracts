/**
 * Filing hub ↔ child app boundary contracts.
 *
 * These types cross the hub/child-app boundary. They must be stable.
 * No ingestion-specific or broker-specific types belong here.
 *
 * Source of truth: SUITE_DETAILED_EXECUTION_PLAN.md §3.1, §3.2, §3.2a
 *                  INVESTMENT_TAX_APP_CONTRACT.md (per-app output shapes)
 */

// ---------------------------------------------------------------------------
// App IDs
// ---------------------------------------------------------------------------

export type ChildAppId =
  | 'cgt-app'
  | 'income-app'
  | 'property-app'
  | 'employment-app'
  | 'foreign-income-app';

export type ChildAppStatusValue =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_review'
  | 'blocked'                  // filing blocked, unresolvable without manual action
  | 'amendment_review_required'; // post-filed, material change detected

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
// Flat per-app status carrying warnings + blockers + lastUpdatedAt.
// `appId` is a `ChildAppId` (generalized in 0.5.4 Stage 3C when income-app
// joined cgt-app as a producer). Per-app fact summaries live alongside the
// status in the per-app output shape (e.g. InvestmentTaxAppOutput.facts,
// IncomeTaxAppOutput.facts).
// ---------------------------------------------------------------------------

export interface ChildAppStatus {
  appId: ChildAppId;
  status: ChildAppStatusValue;
  /** Human-readable warnings surfaced to the hub review screen. */
  warnings: string[];
  /** Filing blockers — unresolvable without manual action. */
  blockers: string[];
  /** ISO timestamp of the last status write by the child app. */
  lastUpdatedAt: string;
}

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
