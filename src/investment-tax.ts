/**
 * Investment Tax App (cgt-app) — child-app output contract.
 *
 * Source of truth: specs/apps/INVESTMENT_TAX_APP_CONTRACT.md
 *
 * These types define the stable interface between cgt-app (child app) and
 * firstlot-suite (filing hub). The filing hub renders app cards, form
 * requirements, and review state using this shape only — it does not read
 * internal cgt-app structures.
 */

import type { ChildAppStatus } from './filing';

// ---------------------------------------------------------------------------
// Investment-tax fact summary
//
// Scalar rollups of the per-source investment-income / disposal models.
// Always derived, never asked directly. Field-level semantics live in
// INVESTMENT_TAX_APP_CONTRACT.md §"Investment Income Field Semantics".
// ---------------------------------------------------------------------------

export interface InvestmentTaxFactSummary {
  sa108Summary?: {
    required: boolean;
    disposalCount: number;
    totalProceeds?: number;
    totalGains?: number;
    totalLosses?: number;
    dataQuality: 'clean' | 'needs_review';
  };
  /**
   * Investment income (dividends, interest, foreign income).
   * Populated when the investment-income module is built.
   */
  investmentIncomeSummary?: {
    /**
     * UK dividend-shaped distributions from ordinary shares, unit trusts,
     * OEICs, and stock dividends. Excludes REIT PIDs and foreign dividends.
     */
    ukDividends?: number;
    /**
     * Gross total of REIT Property Income Distributions. PIDs file as
     * property income on the main return (not as dividends), so they have
     * their own rollup field rather than being folded into ukDividends.
     */
    ukReitPidGross?: number;
    /**
     * 20% basic-rate tax withheld at source by the REIT on PID payments.
     * Surfaced as a credit against the user's liability.
     */
    ukReitPidTaxWithheld?: number;
    foreignDividends?: number;
    ukInterest?: number;
    foreignInterest?: number;
    /**
     * Single flat total of foreign withholding across both foreign
     * dividends and foreign interest. Per-source detail lives in the
     * underlying typed domain.
     */
    foreignTaxPaid?: number;
    dataQuality: 'clean' | 'needs_review';
  };
  /**
   * SA106 (Foreign) fact summary.
   * Populated when foreign income support is added.
   */
  sa106Summary?: {
    required: boolean;
    foreignIncomePresent: boolean;
    foreignTaxCreditPresent: boolean;
    dataQuality: 'clean' | 'needs_review';
  };
  unresolvedReviewItemCount: number;
  filingBlockerCount: number;
}

// ---------------------------------------------------------------------------
// Review items
//
// Structured review item portable across the filing hub, rule engine,
// and accountant workflow. Not just a UI banner.
// ---------------------------------------------------------------------------

export interface ReviewItemSummary {
  id: string;
  category:
    | 'corporate_action'
    | 'unmatched_disposal'
    | 'missing_transaction_context'
    | 'rebasing_consistency'
    | 'income_classification'
    | 'other';
  severity: 'warning' | 'review_advised' | 'review_required' | 'blocked';
  title: string;
  reason: string;
  symbol?: string;
  eventDate?: string;
  affectsForms?: string[];
  accountantReviewRecommended: boolean;
  targetUrl?: string;
  sourceApp: 'cgt-app';
}

// ---------------------------------------------------------------------------
// Filing artifacts
//
// Stub for the form-oriented fact export. Populated when SA108/SA106
// form-oriented fact export is built.
// ---------------------------------------------------------------------------

export interface InvestmentTaxFilingArtifacts {
  sa108?: Record<string, unknown>;
  sa106?: Record<string, unknown>;
  supportingFacts?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Computation dossier
//
// Availability summary for the audit packet / explanation generator.
// ---------------------------------------------------------------------------

export interface ComputationDossierSummary {
  available: boolean;
  version?: string;
  generatedAt?: string;
  includes:
    | 'summary_only'
    | 'disposal_reasoning'
    | 'review_items'
    | 'source_evidence'
    | 'full_packet';
}

// ---------------------------------------------------------------------------
// Full child-app output (cgt-app → firstlot-suite)
//
// Returned by GET /api/child-app/status and embedded in
// GET /api/filing/case as apps.cgt.
// ---------------------------------------------------------------------------

export interface InvestmentTaxAppOutput {
  appId: 'cgt-app';
  filingCaseId: string;
  taxYear: string;
  status: ChildAppStatus;
  facts: InvestmentTaxFactSummary;
  reviewItems: ReviewItemSummary[];
  filingArtifacts?: InvestmentTaxFilingArtifacts;
  computationDossier: ComputationDossierSummary;
  lastComputedAt: string;
}
