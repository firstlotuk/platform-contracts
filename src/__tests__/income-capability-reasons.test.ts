import { classifyIncomeErrorEnvelope, expandIncomeReviewRef } from '../income-review';

test.each(['UNSUPPORTED_TAX_YEAR', 'INCOME_PACK_NOT_EXPORTED', 'INCOME_EXPORT_NOT_READY'])(
  '%s is a typed capability refusal rather than an unknown error', code => {
    expect(classifyIncomeErrorEnvelope({ code, error: 'Safe Income explanation' }))
      .toMatchObject({ disposition: 'blocked', code, message: 'Safe Income explanation' });
  },
);

test('UK coupon reconciliation has a minimized actionable reason', () => {
  expect(expandIncomeReviewRef({ reviewId: `ir1${'a'.repeat(22)}`, kind: 'foreign_projection',
    reason: 'uk_security_interest_manual_reconciliation' })).toEqual([
    { reviewId: `ir1${'a'.repeat(22)}`, kind: 'foreign_projection', reason: 'uk_security_interest_manual_reconciliation' },
  ]);
});
