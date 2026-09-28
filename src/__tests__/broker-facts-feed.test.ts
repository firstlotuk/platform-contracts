// d152 doc39 F4/F6 — broker-facts feed 1.2.0 shape tripwire.
//
// The feed is a lockstep contract: income-app accepts exactly one schemaVersion and rejects unknown keys, so
// any change here must move producer (cgt-app) and consumer (income-app) together. These tests pin the wire
// shape at compile time (ts-jest type-checks this file) and the version at run time.

import {
  BROKER_FACTS_FEED_SCHEMA_VERSION,
  isBrokerAccountCoverageFinal,
  FOREIGN_PROJECTION_REVIEW_REASONS,
  type BrokerFact,
  type BrokerFactsAccountCoverage,
  type BrokerFactsFeedResponse,
} from '../browser';

const settlementFact: BrokerFact = {
  sourceEventId: '1', source: 'ibkr_flex', contentFingerprint: 'sha256:x', eventType: 'DIVIDEND',
  txnDate: '2025-05-01', exDate: '2025-04-20', payDate: '2025-05-01', grossAmount: '1.39', netAmount: '0.97',
  withholdingAmount: '0.42', withholdingRate: '0.3', ownershipMode: 'settlement', reliefWithholdingAmount: '0',
  currencyCode: 'USD', amountBasis: 'gross', symbol: 'ABC', isin: null, issuerCountry: 'US', payerEntity: null,
  brokerAccountRef: 'U1234567', effective: true, supersededBy: null, reviewStatus: 'none', reviewReason: null,
  updatedAt: '2026-09-28T12:00:00.000000Z',
};

describe('broker-facts feed contract 1.2.0', () => {
  test('the wire version is 1.2.0', () => {
    expect(BROKER_FACTS_FEED_SCHEMA_VERSION).toBe('1.2.0');
  });

  test('a fact carries ownership mode and relief-eligible withholding; the envelope carries coverage', () => {
    const coverage: BrokerFactsAccountCoverage[] = [
      { brokerAccountRef: 'U1234567', coveredFrom: '2021-01-01', coveredThrough: '2026-04-05', accountOpenedOn: '2020-12-15', accountClosedOn: null },
      { brokerAccountRef: 'U7654321', coveredFrom: null, coveredThrough: null, accountOpenedOn: null, accountClosedOn: null },
      { brokerAccountRef: 'U2345678', coveredFrom: '2022-01-01', coveredThrough: '2024-02-29', accountOpenedOn: null, accountClosedOn: '2024-02-15' },
    ];
    const legacyFact: BrokerFact = { ...settlementFact, ownershipMode: 'legacy', reliefWithholdingAmount: null };
    const response: BrokerFactsFeedResponse = {
      schemaVersion: BROKER_FACTS_FEED_SCHEMA_VERSION,
      facts: [settlementFact, legacyFact],
      coverage,
      nextCursor: null,
      hasMore: false,
    };
    expect(Object.keys(response).sort()).toEqual(['coverage', 'facts', 'hasMore', 'nextCursor', 'schemaVersion']);
    expect(response.facts.map(fact => [fact.ownershipMode, fact.reliefWithholdingAmount])).toEqual([
      ['settlement', '0'],
      ['legacy', null],
    ]);
  });

  test('each coverage entry carries the broker-asserted close date (0.18.2)', () => {
    // @ts-expect-error — a coverage entry without accountClosedOn is not a 1.2.0 coverage entry.
    const missing: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredThrough: '2026-04-05' };
    expect(missing).not.toHaveProperty('accountClosedOn');
    const closed: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredFrom: '2022-01-01', coveredThrough: '2024-02-29', accountOpenedOn: null, accountClosedOn: '2024-02-15' };
    expect(Object.keys(closed).sort()).toEqual(['accountClosedOn', 'accountOpenedOn', 'brokerAccountRef', 'coveredFrom', 'coveredThrough']);
  });

  test('each coverage entry carries the run start and the broker-asserted open date (0.18.3)', () => {
    // @ts-expect-error — a 0.18.3 coverage entry without coveredFrom/accountOpenedOn is incomplete.
    const missing: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredThrough: '2026-04-05', accountClosedOn: null };
    expect(missing).not.toHaveProperty('coveredFrom');
  });

  describe('isBrokerAccountCoverageFinal — the year-final rule', () => {
    const year = { start: '2025-04-06', end: '2026-04-05' };
    const entry = (over: Partial<BrokerFactsAccountCoverage>): BrokerFactsAccountCoverage => ({
      brokerAccountRef: 'U1234567', coveredFrom: '2025-04-06', coveredThrough: '2026-04-05', accountOpenedOn: null, accountClosedOn: null, ...over,
    });

    test('a run spanning the whole year is final; one day short at either end is not', () => {
      expect(isBrokerAccountCoverageFinal(entry({}), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-04-07' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-04-04' }), year)).toBe(false);
    });

    test('a mid-year first window is not final without an open date, and final when the account opened then', () => {
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01', accountOpenedOn: '2025-10-01' }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01', accountOpenedOn: '2025-10-15' }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01', accountOpenedOn: '2025-09-30' }), year)).toBe(false);
    });

    test('a closed account need only be covered through its close date', () => {
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-31', accountClosedOn: '2025-12-31' }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-30', accountClosedOn: '2025-12-31' }), year)).toBe(false);
    });

    test('an account opened after the year end is irrelevant to it; unknown coverage is never final', () => {
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null, accountOpenedOn: '2026-04-06' }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null }), year)).toBe(false);
    });
  });

  test('coverage is required on the envelope', () => {
    // @ts-expect-error — a 1.2.0 envelope without coverage is not a feed response.
    const missing: BrokerFactsFeedResponse = { schemaVersion: '1.2.0', facts: [], nextCursor: null, hasMore: false };
    expect(missing).not.toHaveProperty('coverage');
  });

  test('the consumer can name every fail-closed state the 1.2.0 fields introduce', () => {
    for (const reason of ['relief_withholding_unknown', 'relief_withholding_invalid', 'statement_coverage_incomplete', 'mixed_ownership_modes', 'settlement_account_ref_missing']) {
      expect(FOREIGN_PROJECTION_REVIEW_REASONS).toContain(reason);
    }
  });
});
