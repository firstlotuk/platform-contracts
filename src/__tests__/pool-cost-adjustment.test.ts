import {
  POOL_COST_ADJUSTMENT_CATEGORY,
  POOL_COST_ADJUSTMENT_DEFAULT_ORDERING,
  POOL_COST_ADJUSTMENT_ORDERINGS,
  S122_4_REFUSAL_CODE,
  checkPoolCostAdjustmentRow,
  isPoolCostAdjustmentOrdering,
  resolvePoolCostAdjustmentOrdering,
} from '../browser';

const ok = { categoryName: 'POOL_COST_ADJUSTMENT', quantity: 0, sterlingAdjustment: -100, txnDate: '2024-05-02' };

describe('pool-cost-adjustment (doc 49 D / D.1)', () => {
  it('pins the vocabulary', () => {
    expect(POOL_COST_ADJUSTMENT_CATEGORY).toBe('POOL_COST_ADJUSTMENT');
    expect([...POOL_COST_ADJUSTMENT_ORDERINGS]).toEqual(['after_acquisitions_before_disposals', 'at_close_of_date']);
    expect(POOL_COST_ADJUSTMENT_DEFAULT_ORDERING).toBe('after_acquisitions_before_disposals');
    expect(S122_4_REFUSAL_CODE).toBe('s122_4');
  });
  it('resolves ordering fail-closed', () => {
    expect(resolvePoolCostAdjustmentOrdering(undefined)).toBe('after_acquisitions_before_disposals');
    expect(resolvePoolCostAdjustmentOrdering(null)).toBe('after_acquisitions_before_disposals');
    expect(resolvePoolCostAdjustmentOrdering('at_close_of_date')).toBe('at_close_of_date');
    expect(resolvePoolCostAdjustmentOrdering('AT_CLOSE_OF_DATE')).toBeNull();
    expect(isPoolCostAdjustmentOrdering('')).toBe(false);
  });
  it('accepts a well-formed row with either ordering', () => {
    expect(checkPoolCostAdjustmentRow(ok)).toEqual([]);
    expect(checkPoolCostAdjustmentRow({ ...ok, ordering: 'at_close_of_date' })).toEqual([]);
  });
  it('rejects bad shapes', () => {
    expect(checkPoolCostAdjustmentRow({ ...ok, categoryName: 'BUY' })).toEqual(['not_pool_cost_adjustment']);
    expect(checkPoolCostAdjustmentRow({ ...ok, quantity: 1 })).toEqual(['quantity_not_zero']);
    for (const v of [0, 5, NaN, Infinity, '-1', null]) {
      expect(checkPoolCostAdjustmentRow({ ...ok, sterlingAdjustment: v })).toEqual(['amount_not_negative_finite']);
    }
    expect(checkPoolCostAdjustmentRow({ ...ok, ordering: 'x' })).toEqual(['ordering_unknown']);
    expect(checkPoolCostAdjustmentRow({ ...ok, txnDate: '2024-05-02T00:00:00Z' })).toEqual(['date_malformed']);
  });
});
