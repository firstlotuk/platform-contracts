// d152 doc39 F4/F6 — broker-facts feed 1.2.0 shape tripwire.
//
// The feed is a lockstep contract: income-app accepts exactly one schemaVersion and rejects unknown keys, so
// any change here must move producer (cgt-app) and consumer (income-app) together. These tests pin the wire
// shape at compile time (ts-jest type-checks this file) and the version at run time.

import {
  BROKER_FACTS_FEED_SCHEMA_VERSION,
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
      { brokerAccountRef: 'U1234567', coveredThrough: '2026-04-05' },
      { brokerAccountRef: 'U7654321', coveredThrough: null },
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

  test('coverage is required on the envelope', () => {
    // @ts-expect-error — a 1.2.0 envelope without coverage is not a feed response.
    const missing: BrokerFactsFeedResponse = { schemaVersion: '1.2.0', facts: [], nextCursor: null, hasMore: false };
    expect(missing).not.toHaveProperty('coverage');
  });

  test('the consumer can name every fail-closed state the 1.2.0 fields introduce', () => {
    for (const reason of ['relief_withholding_unknown', 'relief_withholding_invalid', 'statement_coverage_incomplete']) {
      expect(FOREIGN_PROJECTION_REVIEW_REASONS).toContain(reason);
    }
  });
});
