/**
 * Income Tax App (income-app) — child-app output contract.
 *
 * Canonical home for the income-app → firstlot-suite boundary. Added in
 * 0.5.4 Stage 3C: income-app was promoted from a proven standalone app to a
 * suite child-app *producer*. Before this stage the shape lived as a local
 * duplicate in `income-app/src/types`; it now lives here as the single source
 * of truth, mirroring `InvestmentTaxAppOutput` (cgt-app).
 *
 * Scope boundary (Stage 3C): this contract defines the fact fields income-app
 * MAY emit. It does NOT assert suite *filing ownership* of any figure. Real
 * emission from income-app's tax computation, suite consumption, and the
 * precedence rules for income that more than one app can report
 * (savings / dividends / foreign / SA106 — see the overlap note below) are
 * deferred to Stage 3D. The income-app producer remains an honest stub
 * (`status: 'not_started'`, empty facts) until 3D.
 */

import type { ChildAppStatus } from './filing';
import type { ReviewItemSummary } from './review';

// ---------------------------------------------------------------------------
// Income-tax fact summary
//
// Scalar rollups of income-app's per-source income models. Always derived,
// never asked directly. Each summary block is optional — absent means
// income-app has no data for that section yet (honest "not connected").
//
// OVERLAP NOTE (resolution deferred to Stage 3D): `savingsSummary` (UK/foreign
// interest + dividends) and `foreignIncomeSummary` describe income that
// cgt-app can ALSO report via `InvestmentTaxFactSummary.investmentIncomeSummary`
// / `sa106Summary`. Two producers can therefore populate overlapping figures.
// This contract does not decide precedence — the suite must NOT treat either
// app as the filing-authoritative source for savings / dividends / foreign /
// SA106 until Stage 3D establishes the ownership/precedence rule.
// ---------------------------------------------------------------------------

export interface IncomeTaxFactSummary {
  employmentSummary?: {
    required: boolean;
    ukEmployerCount: number;
    totalGrossPay: number;
    totalTaxDeducted: number;
    /**
     * Optional (Stage 3D-1): the SA-output compute path has no truthful
     * per-employer P60-confirmation signal, so this is omitted rather than
     * emitted as a fabricated 0. Populate when income-app exposes confirmation
     * state on employer rows.
     */
    p60ConfirmedCount?: number;
    dataQuality: 'clean' | 'needs_review';
  };
  selfEmploymentSummary?: {
    required: boolean;
    netProfit: number;
    /**
     * Optional (Stage 3D-1): overlap relief is computed by a separate
     * self-employment service that is not threaded through the SA-output path,
     * so it is omitted here rather than emitted as a misleading 0.
     */
    overlapReliefApplied?: number;
    dataQuality: 'clean' | 'needs_review';
  };
  /** Overlaps cgt-app's investment-income rollup — see OVERLAP NOTE; precedence is a Stage 3D decision. */
  savingsSummary?: {
    ukInterest: number;
    ukDividends: number;
    foreignInterest: number;
    foreignDividends: number;
    dataQuality: 'clean' | 'needs_review';
  };
  /** Overlaps cgt-app's SA106/foreign rollup — see OVERLAP NOTE; precedence is a Stage 3D decision. */
  foreignIncomeSummary?: {
    required: boolean;
    /**
     * Optional (Stage 3D-1): a POC-era HK-specific field. The compute path
     * tracks foreign income per country generically, not an HK employment
     * rollup, so this is omitted rather than mis-populated. `required` +
     * `foreignTaxCreditPresent` carry the truthful foreign signal today.
     */
    hkdEmploymentGbp?: number;
    foreignTaxCreditPresent: boolean;
    dataQuality: 'clean' | 'needs_review';
  };
  unresolvedReviewItemCount: number;
  filingBlockerCount: number;
}

// ---------------------------------------------------------------------------
// Filing artifacts
//
// Stub for the form-oriented fact export (SA100/SA102/SA103/SA106). income-app
// already computes these box-by-box internally (`/api/sa-output`); wiring that
// computation into this contract is Stage 3D, not 3C.
// ---------------------------------------------------------------------------

export interface IncomeTaxFilingArtifacts {
  sa100?: Record<string, unknown>;
  sa102?: Record<string, unknown>;
  sa103?: Record<string, unknown>;
  sa106?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Full child-app output (income-app → firstlot-suite)
//
// Returned by income-app's GET /api/child-app/status and (in Stage 3D) embedded
// in GET /api/filing/case as apps.income. `status` is the shared `ChildAppStatus`
// (its `appId` is a `ChildAppId`, generalized in Stage 3C).
// ---------------------------------------------------------------------------

export interface IncomeTaxAppOutput {
  appId: 'income-app';
  filingCaseId: string;
  taxYear: string;
  status: ChildAppStatus<'income-app'>;
  facts: IncomeTaxFactSummary;
  /**
   * Structured review items income-app surfaces to the hub (Stage 3D-1):
   * unconfirmed figures (`review_required`) and advisory warnings
   * (`review_advised`). Bound to `'income-app'` as the source.
   */
  reviewItems: ReviewItemSummary<'income-app'>[];
  filingArtifacts?: IncomeTaxFilingArtifacts;
  lastComputedAt: string;
}
