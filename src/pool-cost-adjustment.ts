/**
 * RX4 step 6 (doc 49 section D and D.1) - the `POOL_COST_ADJUSTMENT` CGT engine row kind.
 *
 * One dated, pool-level reduction of the section 104 pool's allowable expenditure: a small capital distribution
 * received in cash (for example cash for a fraction of a scrip share) is not a disposal and is "deducted from any
 * expenditure allowable" (TCGA 1992 s.122(2)(b); HMRC CG57835). If the amount exceeds the expenditure allowable,
 * s.122(2) does not apply (s.122(4)) and the engine refuses with {@link S122_4_REFUSAL_CODE}.
 *
 * Wire shape (additive on the `RawCgtTransaction` of CGT_ENGINE_INPUT_CONTRACT section 4; a computation with no such
 * row is byte-identical to one before this kind existed):
 * - `categoryName` = {@link POOL_COST_ADJUSTMENT_CATEGORY}
 * - `quantity` = 0 (the row is never a CGT-valued acquisition or disposal)
 * - `sterlingAdjustment` = the SIGNED sterling amount, strictly NEGATIVE (a reduction); the caller has already converted
 *   it at the rate it chose, and the engine applies no rate to it
 * - `txnDate` = the effective date; `poolKey`/`instrumentId`/`symbol` = the pool it applies to
 * - `ordering` = one of {@link POOL_COST_ADJUSTMENT_ORDERINGS}; absent = {@link POOL_COST_ADJUSTMENT_DEFAULT_ORDERING}
 *
 * Ordering within the effective date D (doc 49 section D / D.1):
 * - `after_acquisitions_before_disposals`: after D's acquisitions, before D's disposals.
 * - `at_close_of_date`: after every acquisition and disposal dated D for the pool (including s.105 same-day and the
 *   30-day identification of D's disposals), so the s.122(4) test and the reduction use the expenditure immediately
 *   before the close of D; only the section 104 portions of later disposals draw on the reduced pool.
 *
 * Engine support is versioned by the engine (the caller MUST refuse an answer from an engine that predates the kind,
 * as for `sterlingAdjustment`); this module only fixes the vocabulary and a fail-closed row check.
 */

export const POOL_COST_ADJUSTMENT_CATEGORY = 'POOL_COST_ADJUSTMENT' as const;

export const POOL_COST_ADJUSTMENT_ORDERINGS = ['after_acquisitions_before_disposals', 'at_close_of_date'] as const;
export type PoolCostAdjustmentOrdering = (typeof POOL_COST_ADJUSTMENT_ORDERINGS)[number];
export const POOL_COST_ADJUSTMENT_DEFAULT_ORDERING: PoolCostAdjustmentOrdering = 'after_acquisitions_before_disposals';

/** Typed engine refusal code: the adjustment exceeds the pool's allowable expenditure (TCGA 1992 s.122(4)). */
export const S122_4_REFUSAL_CODE = 's122_4' as const;

/** The subset of the engine `RawCgtTransaction` a pool cost adjustment row uses. */
export interface PoolCostAdjustmentRow {
  id: number;
  txnDate: string;
  currencyCode: string;
  symbol: string;
  instrumentId: number;
  poolKey?: string | null;
  categoryName: typeof POOL_COST_ADJUSTMENT_CATEGORY;
  quantity: 0;
  /** Signed sterling amount, strictly negative. */
  sterlingAdjustment: number;
  /** Source-currency audit figure (signed the same way); never read for the sterling figure. */
  sterlingAdjustmentNative?: number | null;
  sterlingAdjustmentCurrency?: string | null;
  sterlingAdjustmentRateIds?: number[] | null;
  ordering?: PoolCostAdjustmentOrdering | null;
}

export function isPoolCostAdjustmentOrdering(value: unknown): value is PoolCostAdjustmentOrdering {
  return typeof value === 'string' && (POOL_COST_ADJUSTMENT_ORDERINGS as readonly string[]).includes(value);
}

/** The ordering a row means: absent/null = the default; an unknown value is `null` (fail closed, never defaulted). */
export function resolvePoolCostAdjustmentOrdering(value: unknown): PoolCostAdjustmentOrdering | null {
  if (value === undefined || value === null) return POOL_COST_ADJUSTMENT_DEFAULT_ORDERING;
  return isPoolCostAdjustmentOrdering(value) ? value : null;
}

export type PoolCostAdjustmentRowIssue =
  | 'not_pool_cost_adjustment'
  | 'quantity_not_zero'
  | 'amount_not_negative_finite'
  | 'ordering_unknown'
  | 'date_malformed';

/** Fail-closed shape check for a producer; `[]` = well formed. Does not test s.122(4) (that needs the pool). */
export function checkPoolCostAdjustmentRow(row: {
  categoryName?: unknown;
  quantity?: unknown;
  sterlingAdjustment?: unknown;
  ordering?: unknown;
  txnDate?: unknown;
}): PoolCostAdjustmentRowIssue[] {
  if (row.categoryName !== POOL_COST_ADJUSTMENT_CATEGORY) return ['not_pool_cost_adjustment'];
  const issues: PoolCostAdjustmentRowIssue[] = [];
  if (row.quantity !== 0) issues.push('quantity_not_zero');
  if (typeof row.sterlingAdjustment !== 'number' || !Number.isFinite(row.sterlingAdjustment) || row.sterlingAdjustment >= 0) {
    issues.push('amount_not_negative_finite');
  }
  if (resolvePoolCostAdjustmentOrdering(row.ordering) === null) issues.push('ordering_unknown');
  if (typeof row.txnDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.txnDate)) issues.push('date_malformed');
  return issues;
}
