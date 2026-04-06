/**
 * Fact summary contracts — child apps -> hub / rule-engine-service.
 *
 * These let the hub and rules reason over domain facts without
 * reading child app databases directly.
 *
 * Source of truth: SUITE_DETAILED_EXECUTION_PLAN.md §3.6
 */

// ---------------------------------------------------------------------------
// 3.6 CgtFactSummary — cgt-app -> hub / rule-engine-service
// ---------------------------------------------------------------------------

export interface CgtFactSummary {
  /**
   * HMRC tax year in "YYYY-YY" format.
   * @example "2024-25"
   */
  taxYear: string;
  sa108Required: boolean;
  disposalCount: number;
  totalProceeds?: number;
  totalGains?: number;
  totalLosses?: number;
  dataQuality: 'clean' | 'needs_review';
}
