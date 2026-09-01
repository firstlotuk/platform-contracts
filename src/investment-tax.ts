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
import type { ReviewItemSummary } from './review';

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
// `ReviewItemSummary` now lives in ./review (shared across cgt-app + income-app,
// 0.5.4 Stage 3D-1) and is imported above. Still exported from the package
// barrel, so existing `@firstlot/platform-contracts` imports are unchanged.
// ---------------------------------------------------------------------------

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
  status: ChildAppStatus<'cgt-app'>;
  facts: InvestmentTaxFactSummary;
  reviewItems: ReviewItemSummary<'cgt-app'>[];
  filingArtifacts?: InvestmentTaxFilingArtifacts;
  computationDossier: ComputationDossierSummary;
  lastComputedAt: string;
}

// ---------------------------------------------------------------------------
// d085 — bank-statement security capture (income-app → cgt-app)
//
// A bank statement carries interest, dividends AND security transactions.
// income-app extracts all three; the first two are its own ledger, the third
// belongs to cgt-app. These types are the forward payload for that third
// stream.
//
// What is asserted here is deliberately WEAKER than TransactionImportDTO:
// a bank statement states an instrument NAME, a settled amount and (usually) a
// quantity. It does NOT state a ticker/ISIN, nor the price/fee split. cgt-app
// pools by instrument identity and treats fees as separately allowable, so
// those fields are supplied by the USER during mapping — never inferred here.
// Forwarding is capture, not import.
// ---------------------------------------------------------------------------

/** One security transaction as a bank statement asserts it. Source facts only. */
export interface BankStatementSecurityRow {
  /** ISO date (YYYY-MM-DD) the statement gives for the transaction. */
  txnDate: string;
  /** 'buy' | 'sell' | 'other' as classified from the statement wording. */
  transactionType: 'buy' | 'sell' | 'other';
  /** Instrument NAME as printed (e.g. "PING AN"). Never a ticker. */
  instrumentName: string;
  /** Units, when the statement states them. */
  quantity?: number;
  /** Settled amount in the statement's currency. May already include fees. */
  amount: number;
  /** ISO 4217 currency of `amount`. */
  currencyCode: string;
  /** Extractor confidence for this row. */
  confidence: 'high' | 'medium' | 'low';
  /** Extractor's own field locator, for provenance back to the document. */
  sourceField: string;

  // --- Facts SOME statements state, and most do not -------------------------
  // The Citibank HK case this contract was first built from prints only a
  // settled total, which is why instrument identity and the price/fee split are
  // user acts. But a BOC monthly-stock-plan statement (月供股票) prints all of
  // them: `證券代號及名稱 : (00001) 長和`, `股價 72.1000`, `總交易費用 50.00`.
  //
  // Where the document states them, they are forwarded as ASSERTED facts so the
  // user CONFIRMS rather than retypes — twelve-plus times a year for a monthly
  // plan — and so the settlement reconciliation has the document's own evidence
  // to check against. They are never inferred: absent means the statement was
  // silent, and the user supplies the value.

  /** Price per unit as printed (BOC 股價). */
  pricePerUnit?: number;
  /** Dealing fees as printed (BOC 總交易費用). */
  fees?: number;
  /** Exchange instrument code as printed (BOC 證券代號, e.g. "00001"). */
  instrumentCode?: string;
  /**
   * The bank's own per-trade reference, where printed (Citibank prints a
   * 16-digit number in its securities ledger).
   *
   * This is the strongest identity a forwarded row can carry: cgt-app dedupes
   * on `broker_transaction_id` FIRST and only falls back to a content
   * fingerprint when it is absent. Carrying it means a re-forward, or the same
   * trade arriving another way, collapses on identity rather than on a hash of
   * values the user is about to change.
   */
  brokerReference?: string;
}

/** Provenance + rows forwarded by income-app for one source document. */
export interface BankStatementSecurityCaptureRequest {
  /** income-app `documents.id` this came from. Idempotency key with the actor. */
  sourceDocumentId: number;
  /** Statement filename, for display in the review queue. */
  sourceFilename: string;
  /** Canonical institution name when income-app resolved one, else null. */
  institutionName: string | null;
  /** UK tax year the source document was filed under, e.g. "2021-22". */
  taxYear: string;
  rows: BankStatementSecurityRow[];
}

export interface BankStatementSecurityCaptureResponse {
  /** Rows newly held for mapping. */
  captured: number;
  /** Rows already held from a previous forward of this document. */
  duplicates: number;
}
