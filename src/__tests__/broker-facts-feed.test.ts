// d152 doc39 F4/F6 — broker-facts feed 1.4.0 shape tripwire.
//
// The feed is a lockstep contract: income-app accepts exactly one schemaVersion and rejects unknown keys, so
// any change here must move producer (cgt-app) and consumer (income-app) together. These tests pin the wire
// shape at compile time (ts-jest type-checks this file) and the version at run time.

import {
  BROKER_FACTS_FEED_SCHEMA_VERSION,
  brokerAccountHasEvidenceInTaxYear,
  isBrokerAccountCoverageFinal,
  isBrokerFactsEvidenceTaxYears,
  isUkTaxYearLabel,
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

describe('broker-facts feed contract 1.4.0', () => {
  test('the wire version is 1.4.0: evidenceTaxYears is a new required coverage key', () => {
    expect(BROKER_FACTS_FEED_SCHEMA_VERSION).toBe('1.4.0');
  });

  describe('evidenceTaxYears — the producer\'s authoritative "facts in period"', () => {
    test('labels are UK tax years YYYY-YY; the list is null or strictly ascending', () => {
      for (const good of ['2023-24', '1999-00', '2099-00']) expect(isUkTaxYearLabel(good)).toBe(true);
      for (const bad of ['2023-25', '2023/24', '23-24', '2023-2024', '', 2023, null]) expect(isUkTaxYearLabel(bad)).toBe(false);
      expect(isBrokerFactsEvidenceTaxYears(null)).toBe(true);
      expect(isBrokerFactsEvidenceTaxYears([])).toBe(true);
      expect(isBrokerFactsEvidenceTaxYears(['2021-22', '2023-24'])).toBe(true);
      for (const bad of [['2023-24', '2021-22'], ['2023-24', '2023-24'], ['2023-25'], '2023-24', [2023], undefined]) {
        expect(isBrokerFactsEvidenceTaxYears(bad)).toBe(false);
      }
    });

    test('facts in period = taxYear in evidenceTaxYears, or unknown (null) = every year; malformed = evidence', () => {
      expect(brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: ['2023-24'] }, '2023-24')).toBe(true);
      expect(brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: ['2023-24'] }, '2024-25')).toBe(false);
      expect(brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: [] }, '2024-25')).toBe(false);
      expect(brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: null }, '1990-91')).toBe(true);
      expect(brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: ['2024-25', '2023-24'] }, '2019-20')).toBe(true);
      expect(brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: ['2023-24'] }, '2024-26')).toBe(true);
    });

    test('evidenceTaxYears is required on a coverage entry', () => {
      // @ts-expect-error — a 1.4.0 coverage entry without evidenceTaxYears is incomplete.
      const missing: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredFrom: null, coveredThrough: null, accountOpenedOn: null, accountClosedOn: null };
      expect(missing).not.toHaveProperty('evidenceTaxYears');
    });
  });

  test('a fact carries ownership mode and relief-eligible withholding; the envelope carries coverage', () => {
    const coverage: BrokerFactsAccountCoverage[] = [
      { brokerAccountRef: 'U1234567', coveredFrom: '2021-01-01', coveredThrough: '2026-04-05', accountOpenedOn: '2020-12-15', accountClosedOn: null, evidenceTaxYears: null },
      { brokerAccountRef: 'U7654321', coveredFrom: null, coveredThrough: null, accountOpenedOn: null, accountClosedOn: null, evidenceTaxYears: null },
      { brokerAccountRef: 'U2345678', coveredFrom: '2022-01-01', coveredThrough: '2024-02-29', accountOpenedOn: null, accountClosedOn: '2024-02-15', evidenceTaxYears: null },
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
    const closed: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredFrom: '2022-01-01', coveredThrough: '2024-02-29', accountOpenedOn: null, accountClosedOn: '2024-02-15', evidenceTaxYears: null };
    expect(Object.keys(closed).sort()).toEqual(['accountClosedOn', 'accountOpenedOn', 'brokerAccountRef', 'coveredFrom', 'coveredThrough', 'evidenceTaxYears']);
  });

  test('each coverage entry carries the run start and the broker-asserted open date (0.18.3)', () => {
    // @ts-expect-error — a 0.18.3 coverage entry without coveredFrom/accountOpenedOn is incomplete.
    const missing: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredThrough: '2026-04-05', accountClosedOn: null, evidenceTaxYears: null };
    expect(missing).not.toHaveProperty('coveredFrom');
  });

  describe('isBrokerAccountCoverageFinal — the year-final rule', () => {
    const year = { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: true };
    const entry = (over: Partial<BrokerFactsAccountCoverage>): BrokerFactsAccountCoverage => ({
      brokerAccountRef: 'U1234567', coveredFrom: '2025-04-06', coveredThrough: '2026-04-05', accountOpenedOn: null, accountClosedOn: null, evidenceTaxYears: null, ...over,
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
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-31', accountClosedOn: '2025-12-31', evidenceTaxYears: null }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-30', accountClosedOn: '2025-12-31', evidenceTaxYears: null }), year)).toBe(false);
    });

    test('an account opened after the year end is irrelevant to it only when it has no facts in the year', () => {
      const openedLater = entry({ coveredFrom: null, coveredThrough: null, accountOpenedOn: '2026-04-06' });
      expect(isBrokerAccountCoverageFinal(openedLater, { ...year, accountHasFactsInPeriod: false })).toBe(true);
      // Facts in a year before the account opened: a contradiction, never final.
      expect(isBrokerAccountCoverageFinal(openedLater, { ...year, accountHasFactsInPeriod: true })).toBe(false);
      // Even a run that would otherwise cover the year cannot rescue the contradiction.
      expect(isBrokerAccountCoverageFinal(entry({ accountOpenedOn: '2026-04-06', coveredFrom: '2025-01-01', coveredThrough: '2026-12-31' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null }), { ...year, accountHasFactsInPeriod: false })).toBe(false);
    });

    test('any date that is not a valid ISO calendar date is never final', () => {
      for (const bad of ['', '2025-02-30', '2025-4-6', '2025-04-06T00:00:00Z', '20250406', ' 2025-04-06']) {
        for (const field of ['coveredFrom', 'coveredThrough', 'accountOpenedOn', 'accountClosedOn'] as const) {
          expect(isBrokerAccountCoverageFinal(entry({ [field]: bad }), year)).toBe(false);
        }
        expect(isBrokerAccountCoverageFinal(entry({}), { ...year, start: bad })).toBe(false);
        expect(isBrokerAccountCoverageFinal(entry({}), { ...year, end: bad })).toBe(false);
      }
      // An empty close date used to make the end rule vacuous ('' < end): now it is simply not final.
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-06-30', accountClosedOn: '', evidenceTaxYears: null }), year)).toBe(false);
      // An opened-after-the-year exemption on a malformed open date does not apply either.
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null, accountOpenedOn: '9999-99-99' }), { ...year, accountHasFactsInPeriod: false })).toBe(false);
      // A reversed period is never final.
      expect(isBrokerAccountCoverageFinal(entry({}), { ...year, start: '2026-04-05', end: '2025-04-06' })).toBe(false);
    });

    test('the facts flag is required at compile time', () => {
      // @ts-expect-error — without accountHasFactsInPeriod the exemption cannot be judged.
      expect(isBrokerAccountCoverageFinal(entry({}), { start: '2025-04-06', end: '2026-04-05' })).toBe(false);
    });
  });

  test('coverage is required on the envelope', () => {
    // @ts-expect-error — a 1.4.0 envelope without coverage is not a feed response.
    const missing: BrokerFactsFeedResponse = { schemaVersion: '1.4.0', facts: [], nextCursor: null, hasMore: false };
    expect(missing).not.toHaveProperty('coverage');
  });

  test('the consumer can name every fail-closed state the 1.2.0 fields introduce', () => {
    for (const reason of ['relief_withholding_unknown', 'relief_withholding_invalid', 'statement_coverage_incomplete', 'mixed_ownership_modes', 'settlement_account_ref_missing']) {
      expect(FOREIGN_PROJECTION_REVIEW_REASONS).toContain(reason);
    }
  });
});
