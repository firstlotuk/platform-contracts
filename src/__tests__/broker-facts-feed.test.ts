// d152 doc39 F4/F6 — broker-facts feed 1.5.0 shape and semantics tripwire.
//
// The feed is a lockstep contract: income-app accepts exactly one schemaVersion and rejects unknown keys, so
// any change here must move producer (cgt-app) and consumer (income-app) together. These tests pin the wire
// shape at compile time (ts-jest type-checks this file) and the version at run time.

import {
  BROKER_FACTS_FEED_SCHEMA_VERSION,
  BROKER_FACTS_PAYMENT_GRACE_POLICY,
  brokerAccountHasEvidenceInTaxYear,
  isBrokerAccountCoverageFinal,
  isBrokerFactsEvidenceTaxYears,
  isUkTaxYearLabel,
  paymentsCoveredThrough,
  ukTaxYearLabelOfDate,
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

describe('broker-facts feed contract 1.5.0', () => {
  test('the wire version is 1.5.0: same shape as 1.4.0, PCT-based (one-weekday grace) year-final and closure', () => {
    expect(BROKER_FACTS_FEED_SCHEMA_VERSION).toBe('1.5.0');
    // The semantics the version names: raw coverage to Sun 5 April 2026 is not final, through Tue 7 April it is.
    const coverage = { coveredFrom: '2025-04-06', accountOpenedOn: null, accountClosedOn: null, evidenceTaxYears: null };
    const year = { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: true };
    expect(isBrokerAccountCoverageFinal({ ...coverage, coveredThrough: '2026-04-05' }, year)).toBe(false);
    expect(isBrokerAccountCoverageFinal({ ...coverage, coveredThrough: '2026-04-07' }, year)).toBe(true);
    expect(BROKER_FACTS_PAYMENT_GRACE_POLICY).toBe('one-weekday-reporting-grace.v1');
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
      // @ts-expect-error — a 1.4.0+ coverage entry without evidenceTaxYears is incomplete.
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

  describe('ukTaxYearLabelOfDate — the one date → UK tax-year label mapping (0.18.9)', () => {
    test('5 April closes a tax year and 6 April opens the next', () => {
      expect(ukTaxYearLabelOfDate('2025-04-05')).toBe('2024-25');
      expect(ukTaxYearLabelOfDate('2025-04-06')).toBe('2025-26');
      expect(ukTaxYearLabelOfDate('2026-04-05')).toBe('2025-26');
      expect(ukTaxYearLabelOfDate('2024-02-29')).toBe('2023-24');
      expect(ukTaxYearLabelOfDate('2023-12-31')).toBe('2023-24');
      expect(ukTaxYearLabelOfDate('2024-01-01')).toBe('2023-24');
    });

    test('century and zero-padding edges', () => {
      expect(ukTaxYearLabelOfDate('1999-12-31')).toBe('1999-00');
      expect(ukTaxYearLabelOfDate('2100-01-01')).toBe('2099-00');
      expect(ukTaxYearLabelOfDate('2100-04-06')).toBe('2100-01');
      expect(ukTaxYearLabelOfDate('0999-06-01')).toBe('0999-00');
      expect(ukTaxYearLabelOfDate('2000-02-29')).toBe('1999-00');
    });

    test('anything but a valid ISO calendar date is null', () => {
      for (const bad of ['', '2025-02-29', '2100-02-29', '2025-13-01', '2025-04-31', '2025-4-6', '2025-04-06T00:00:00Z',
        ' 2025-04-06', '2025-04-06 ', '20250406', 'not-a-date']) {
        expect(ukTaxYearLabelOfDate(bad)).toBeNull();
      }
      expect(ukTaxYearLabelOfDate(null as unknown as string)).toBeNull();
      expect(ukTaxYearLabelOfDate(20250406 as unknown as string)).toBeNull();
    });

    test('every label it returns is a well-formed tax-year label', () => {
      for (const date of ['2025-04-05', '2025-04-06', '1999-12-31', '2100-01-01', '0999-06-01']) {
        expect(isUkTaxYearLabel(ukTaxYearLabelOfDate(date))).toBe(true);
      }
    });
  });

  describe('paymentsCoveredThrough — the one-weekday payment reporting grace (0.18.7)', () => {
    test('the policy is versioned', () => {
      expect(BROKER_FACTS_PAYMENT_GRACE_POLICY).toBe('one-weekday-reporting-grace.v1');
    });

    test('every day of a week: the weekday before the last weekday on or before coveredThrough', () => {
      // Week of Mon 2026-03-30 .. Sun 2026-04-05.
      expect([
        '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05',
      ].map(paymentsCoveredThrough)).toEqual([
        '2026-03-27', // Mon -> previous Fri
        '2026-03-30', // Tue -> Mon
        '2026-03-31', // Wed -> Tue
        '2026-04-01', // Thu -> Wed
        '2026-04-02', // Fri -> Thu
        '2026-04-02', // Sat -> Thu
        '2026-04-02', // Sun -> Thu
      ]);
    });

    test('month and year boundaries', () => {
      expect(paymentsCoveredThrough('2026-06-01')).toBe('2026-05-29'); // Mon -> Fri of the previous month
      expect(paymentsCoveredThrough('2027-01-04')).toBe('2027-01-01'); // Mon -> Fri 1 Jan
      expect(paymentsCoveredThrough('2027-01-03')).toBe('2026-12-31'); // Sun -> last Fri 1 Jan -> Thu 31 Dec
      expect(paymentsCoveredThrough('2026-01-01')).toBe('2025-12-31'); // Thu -> Wed
    });

    test('leap years (and the 400-year rule)', () => {
      expect(paymentsCoveredThrough('2024-03-01')).toBe('2024-02-29'); // Fri -> Thu 29 Feb 2024
      expect(paymentsCoveredThrough('2024-03-04')).toBe('2024-03-01'); // Mon -> Fri
      expect(paymentsCoveredThrough('2028-02-29')).toBe('2028-02-28'); // Tue 29 Feb 2028 -> Mon
      expect(paymentsCoveredThrough('2000-02-29')).toBe('2000-02-28'); // Tue 29 Feb 2000 (divisible by 400)
      expect(paymentsCoveredThrough('2100-03-01')).toBe('2100-02-26'); // Mon; 2100 is not a leap year -> Fri 26 Feb
      expect(paymentsCoveredThrough('2100-02-29')).toBeNull();
    });

    test('null or invalid input is null', () => {
      for (const bad of [null, '', '2026-02-30', '2026-4-5', '2026-04-05T00:00:00Z', 'not-a-date', ' 2026-04-05']) {
        expect(paymentsCoveredThrough(bad)).toBeNull();
      }
    });
  });

  describe('isBrokerAccountCoverageFinal — the year-final rule', () => {
    const year = { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: true };
    const entry = (over: Partial<BrokerFactsAccountCoverage>): BrokerFactsAccountCoverage => ({
      // Through Tue 2026-04-07: PCT is Mon 2026-04-06, past the 5 April year end (a Sunday).
      brokerAccountRef: 'U1234567', coveredFrom: '2025-04-06', coveredThrough: '2026-04-07', accountOpenedOn: null, accountClosedOn: null, evidenceTaxYears: null, ...over,
    });

    test('a run spanning the whole year is final; one day short at either end is not', () => {
      expect(isBrokerAccountCoverageFinal(entry({}), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-04-07' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-04-04' }), year)).toBe(false);
    });

    test('0.18.7 grace: raw coverage to 5 April (a Sunday) is not final until PCT reaches it', () => {
      // 2026-04-05 is a Sunday: PCT(Sun 04-05) = Thu 04-02, PCT(Mon 04-06) = Fri 04-03, PCT(Tue 04-07) = Mon 04-06.
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-04-05' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-04-06' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-04-07' }), year)).toBe(true);
    });

    test('0.18.7 grace: a year ending on a weekday (Fri 5 April 2024) needs the following Monday', () => {
      const year2324 = { start: '2023-04-06', end: '2024-04-05', accountHasFactsInPeriod: true };
      const run = (coveredThrough: string) => entry({ coveredFrom: '2023-04-06', coveredThrough });
      expect(isBrokerAccountCoverageFinal(run('2024-04-05'), year2324)).toBe(false); // PCT Thu 04-04
      expect(isBrokerAccountCoverageFinal(run('2024-04-07'), year2324)).toBe(false); // Sun: PCT Thu 04-04
      expect(isBrokerAccountCoverageFinal(run('2024-04-08'), year2324)).toBe(true);  // Mon: PCT Fri 04-05
    });

    test('a mid-year first window is not final without an open date, and final when the account opened then', () => {
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01', accountOpenedOn: '2025-10-01' }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01', accountOpenedOn: '2025-10-15' }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: '2025-10-01', accountOpenedOn: '2025-09-30' }), year)).toBe(false);
    });

    test('a closed account is complete once PCT reaches its close date (0.18.7 grace applies to closure)', () => {
      // Closed Wed 2025-12-31, evidence only up to its own tax year (0.18.9: a closure needs known evidence).
      // Through Wed 12-31: PCT Tue 12-30, short. Through Thu 2026-01-01: PCT Wed 12-31.
      const closedEvidence = ['2024-25', '2025-26'];
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-31', accountClosedOn: '2025-12-31', evidenceTaxYears: closedEvidence }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-01-01', accountClosedOn: '2025-12-31', evidenceTaxYears: closedEvidence }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-30', accountClosedOn: '2025-12-31', evidenceTaxYears: closedEvidence }), year)).toBe(false);
    });

    test('0.18.9: a closure contradicted by evidence after it completes nothing (the helper mirrors the producer)', () => {
      // Closed Fri 2024-02-16 (tax year 2023-24); statements through Mon 2024-02-19, so PCT is Fri 2024-02-16.
      const closed = entry({ coveredFrom: '2020-01-01', coveredThrough: '2024-02-19', accountClosedOn: '2024-02-16' });
      // A closure no evidence follows completes every later year, as before.
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: ['2022-23', '2023-24'] }, year)).toBe(true);
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: [] }, year)).toBe(true);
      // Evidence in a tax year after the closure's proves an evidence date after it: the closure is contradicted and
      // cannot complete the year, whether that evidence is in the year itself (the item Fable named), in a year
      // between, or later. Unknown (null) or malformed evidence counts as evidence in every year.
      for (const evidenceTaxYears of [['2023-24', '2025-26'], ['2025-26'], ['2024-25'], ['2026-27'], null,
        ['2025-26', '2024-25'], ['2025-27']]) {
        expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears }, year)).toBe(false);
      }
      // Evidence absent from the object (a caller passing only the four dates) is unknown too.
      const { evidenceTaxYears: _evidence, ...withoutEvidence } = closed;
      expect(isBrokerAccountCoverageFinal(withoutEvidence, year)).toBe(false);
      // The contradicted closure is ignored, exactly as the null a conforming producer sends: statements whose PCT
      // reaches the year end still make it final.
      expect(isBrokerAccountCoverageFinal({ ...closed, coveredThrough: '2026-04-07', evidenceTaxYears: ['2025-26'] }, year)).toBe(true);
    });

    test('0.18.9: evidence after the closure voids it for the closure\'s own year as well', () => {
      // Closed Wed 2025-12-31 (2025-26); PCT (Wed 12-31) reaches it. Evidence in 2026-27 follows the closure.
      const closed = entry({ coveredThrough: '2026-01-01', accountClosedOn: '2025-12-31' });
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: ['2025-26'] }, year)).toBe(true);
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: ['2025-26', '2026-27'] }, year)).toBe(false);
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: null }, year)).toBe(false);
      // A closure in a LATER tax year than the period never shortens it, so its evidence cannot matter there.
      const later = entry({ coveredThrough: '2026-04-07', accountClosedOn: '2026-12-31' });
      expect(isBrokerAccountCoverageFinal({ ...later, evidenceTaxYears: ['2027-28'] }, year)).toBe(true);
    });

    test('an account opened after the year end is irrelevant to it only when it has no facts in the year', () => {
      // No producer evidence in the year and no caller evidence: the exemption holds.
      const openedLater = entry({ coveredFrom: null, coveredThrough: null, accountOpenedOn: '2026-04-06', evidenceTaxYears: [] });
      expect(isBrokerAccountCoverageFinal(openedLater, { ...year, accountHasFactsInPeriod: false })).toBe(true);
      // Facts in a year before the account opened: a contradiction, never final.
      expect(isBrokerAccountCoverageFinal(openedLater, { ...year, accountHasFactsInPeriod: true })).toBe(false);
      // Even a run that would otherwise cover the year cannot rescue the contradiction.
      expect(isBrokerAccountCoverageFinal(entry({ accountOpenedOn: '2026-04-06', coveredFrom: '2025-01-01', coveredThrough: '2026-12-31' }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredFrom: null, coveredThrough: null }), { ...year, accountHasFactsInPeriod: false })).toBe(false);
    });

    test('0.18.6 (Grok P1): the helper reads evidenceTaxYears itself; the caller can only add evidence', () => {
      const openedLater = entry({ coveredFrom: null, coveredThrough: null, accountOpenedOn: '2026-04-06' });
      const noCallerFacts = { ...year, accountHasFactsInPeriod: false };
      // Producer evidence in the year, unknown evidence, or evidence that breaks the grammar: never final.
      for (const evidenceTaxYears of [['2025-26'], ['2024-25', '2025-26'], null, ['2025-26', '2024-25'], ['2025-27']]) {
        expect(isBrokerAccountCoverageFinal({ ...openedLater, evidenceTaxYears }, noCallerFacts)).toBe(false);
      }
      // Evidence absent from the object (a caller passing only the four dates): never final.
      const { evidenceTaxYears: _evidence, ...withoutEvidence } = openedLater;
      expect(isBrokerAccountCoverageFinal(withoutEvidence, noCallerFacts)).toBe(false);
      // Evidence only in other years keeps the exemption; caller evidence still denies it.
      expect(isBrokerAccountCoverageFinal({ ...openedLater, evidenceTaxYears: ['2026-27'] }, noCallerFacts)).toBe(true);
      expect(isBrokerAccountCoverageFinal({ ...openedLater, evidenceTaxYears: ['2026-27'] }, { ...year, accountHasFactsInPeriod: true })).toBe(false);
      // A period that is not exactly one UK tax year cannot be matched to evidence: the exemption is denied.
      for (const period of [{ start: '2025-04-01', end: '2026-03-31' }, { start: '2025-04-06', end: '2025-12-31' }]) {
        expect(isBrokerAccountCoverageFinal({ ...openedLater, evidenceTaxYears: [] }, { ...period, accountHasFactsInPeriod: false })).toBe(false);
      }
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

    test('a coveredThrough with no PCT (invalid) is never final', () => {
      expect(paymentsCoveredThrough('2026-02-30')).toBeNull();
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-02-30' }), year)).toBe(false);
    });

    test('the facts flag is required at compile time', () => {
      // @ts-expect-error — without accountHasFactsInPeriod the exemption cannot be judged.
      expect(isBrokerAccountCoverageFinal(entry({}), { start: '2025-04-06', end: '2026-04-05' })).toBe(false);
    });
  });

  test('coverage is required on the envelope', () => {
    // @ts-expect-error — a 1.5.0 envelope without coverage is not a feed response.
    const missing: BrokerFactsFeedResponse = { schemaVersion: '1.5.0', facts: [], nextCursor: null, hasMore: false };
    expect(missing).not.toHaveProperty('coverage');
  });

  test('the consumer can name every fail-closed state the 1.2.0 fields introduce', () => {
    for (const reason of ['relief_withholding_unknown', 'relief_withholding_invalid', 'statement_coverage_incomplete', 'mixed_ownership_modes', 'settlement_account_ref_missing']) {
      expect(FOREIGN_PROJECTION_REVIEW_REASONS).toContain(reason);
    }
  });
});
