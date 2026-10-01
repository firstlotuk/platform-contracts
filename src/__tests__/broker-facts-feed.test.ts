// d152 doc39 F4/F6, doc42 §2.5 — broker-facts feed 1.6.0 shape and semantics tripwire.
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
  INCOME_REVIEW_REASONS,
  isIncomeReviewReason,
  BROKER_FACT_CONFIRMATIONS,
  BROKER_FACT_UNCONFIRMED_REASONS,
  BROKER_FACTS_CONTIGUITY_POLICIES,
  BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP,
  BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND,
  brokerStatementWindowsContiguous,
  isBrokerAccountTaxYearUnconfirmed,
  isBrokerAccountYearFilingReady,
  isBrokerFactConfirmationConsistent,
  isBrokerFactsContiguityPolicy,
  isBrokerFactsUnconfirmedTaxYears,
  isBrokerFactUnconfirmedReason,
  type BrokerFact,
  type BrokerFactConfirmation,
  type BrokerFactsAccountCoverage,
  type BrokerFactsContiguityPolicy,
  type BrokerFactsFeedResponse,
  type UnconfirmedReason,
} from '../browser';

const settlementFact: BrokerFact = {
  sourceEventId: '1', source: 'ibkr_flex', contentFingerprint: 'sha256:x', eventType: 'DIVIDEND',
  txnDate: '2025-05-01', exDate: '2025-04-20', payDate: '2025-05-01', grossAmount: '1.39', netAmount: '0.97',
  withholdingAmount: '0.42', withholdingRate: '0.3', ownershipMode: 'settlement', reliefWithholdingAmount: '0',
  confirmation: 'confirmed', unconfirmedReason: null, currencyCode: 'USD', amountBasis: 'gross', symbol: 'ABC', isin: null, issuerCountry: 'US', payerEntity: null,
  brokerAccountRef: 'U1234567', effective: true, supersededBy: null, reviewStatus: 'none', reviewReason: null,
  updatedAt: '2026-09-28T12:00:00.000000Z',
};

describe('broker-facts feed contract 1.6.0', () => {
  test('the wire version is 1.6.0; the PCT-based (one-weekday grace) year-final and closure of 1.5.0 still hold', () => {
    expect(BROKER_FACTS_FEED_SCHEMA_VERSION).toBe('1.6.0');
    // The semantics 1.5.0 named, unchanged: raw coverage to Sun 5 April 2026 is not final, through Tue 7 April it is.
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
      { brokerAccountRef: 'U1234567', coveredFrom: '2021-01-01', coveredThrough: '2026-04-05', accountOpenedOn: '2020-12-15', accountClosedOn: null, evidenceTaxYears: null, unconfirmedTaxYears: [], contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP },
      { brokerAccountRef: 'U7654321', coveredFrom: null, coveredThrough: null, accountOpenedOn: null, accountClosedOn: null, evidenceTaxYears: null, unconfirmedTaxYears: [], contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP },
      { brokerAccountRef: 'U2345678', coveredFrom: '2022-01-01', coveredThrough: '2024-02-29', accountOpenedOn: null, accountClosedOn: '2024-02-15', evidenceTaxYears: null, unconfirmedTaxYears: ['2023-24'], contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND },
    ];
    const legacyFact: BrokerFact = { ...settlementFact, ownershipMode: 'legacy', reliefWithholdingAmount: null, confirmation: null };
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
    const closed: BrokerFactsAccountCoverage = { brokerAccountRef: 'U1234567', coveredFrom: '2022-01-01', coveredThrough: '2024-02-29', accountOpenedOn: null, accountClosedOn: '2024-02-15', evidenceTaxYears: null, unconfirmedTaxYears: [], contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP };
    expect(Object.keys(closed).sort()).toEqual(['accountClosedOn', 'accountOpenedOn', 'brokerAccountRef', 'contiguityPolicy', 'coveredFrom', 'coveredThrough', 'evidenceTaxYears', 'unconfirmedTaxYears']);
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
      brokerAccountRef: 'U1234567', coveredFrom: '2025-04-06', coveredThrough: '2026-04-07', accountOpenedOn: null, accountClosedOn: null, evidenceTaxYears: null,
      unconfirmedTaxYears: [], contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP, ...over,
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
      // Closed Wed 2025-12-31, evidence only up to its own tax year (0.18.10: a closure needs known evidence).
      // Through Wed 12-31: PCT Tue 12-30, short. Through Thu 2026-01-01: PCT Wed 12-31.
      const closedEvidence = ['2024-25', '2025-26'];
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-31', accountClosedOn: '2025-12-31', evidenceTaxYears: closedEvidence }), year)).toBe(false);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2026-01-01', accountClosedOn: '2025-12-31', evidenceTaxYears: closedEvidence }), year)).toBe(true);
      expect(isBrokerAccountCoverageFinal(entry({ coveredThrough: '2025-12-30', accountClosedOn: '2025-12-31', evidenceTaxYears: closedEvidence }), year)).toBe(false);
    });

    test('0.18.10 (owner N2): the effective close date, after trailing activity, completes every later year once PCT reaches it', () => {
      // Broker-asserted closure Thu 2023-06-29; a final dividend on 2023-07-06 and the closing withdrawal on Wed 2023-07-12.
      // The producer sends the later of the two, 2023-07-12, and the account's only evidence year is 2023-24.
      const closed = entry({ coveredFrom: '2021-03-15', accountOpenedOn: '2021-03-15', accountClosedOn: '2023-07-12', evidenceTaxYears: ['2020-21', '2021-22', '2022-23', '2023-24'] });
      for (const startYear of [2023, 2024, 2025]) {
        const period = { start: `${startYear}-04-06`, end: `${startYear + 1}-04-05`, accountHasFactsInPeriod: startYear === 2023 };
        // Through Wed 07-12: PCT Tue 07-11, a day short of the closure. Through Thu 07-13: PCT Wed 07-12 reaches it.
        expect(isBrokerAccountCoverageFinal({ ...closed, coveredThrough: '2023-07-12' }, period)).toBe(false);
        expect(isBrokerAccountCoverageFinal({ ...closed, coveredThrough: '2023-07-13' }, period)).toBe(true);
      }
    });

    test('0.18.10: a closure contradicted by evidence in a later tax year completes nothing (the helper mirrors the producer)', () => {
      // Closed Fri 2024-02-16 (tax year 2023-24); statements through Mon 2024-02-19, so PCT is Fri 2024-02-16.
      const closed = entry({ coveredFrom: '2020-01-01', coveredThrough: '2024-02-19', accountClosedOn: '2024-02-16' });
      // A closure no evidence follows into a later tax year completes every later year, as before.
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: ['2022-23', '2023-24'] }, year)).toBe(true);
      expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears: [] }, year)).toBe(true);
      // Evidence in a tax year after the closure's proves activity after it, which a conforming producer folds into the
      // effective close date (N2). A closure it did not fold in is contradicted and cannot complete the year, whether that
      // evidence is in the year itself, in a year between, or later. Unknown (null) or malformed evidence counts as
      // evidence in every year.
      for (const evidenceTaxYears of [['2023-24', '2025-26'], ['2025-26'], ['2024-25'], ['2026-27'], null,
        ['2025-26', '2024-25'], ['2025-27']]) {
        expect(isBrokerAccountCoverageFinal({ ...closed, evidenceTaxYears }, year)).toBe(false);
      }
      // Evidence absent from the object (a caller passing only the four dates) is unknown too.
      const { evidenceTaxYears: _evidence, ...withoutEvidence } = closed;
      expect(isBrokerAccountCoverageFinal(withoutEvidence, year)).toBe(false);
      // The contradicted closure is ignored, exactly as a null closure: statements whose PCT reaches the year end still
      // make it final.
      expect(isBrokerAccountCoverageFinal({ ...closed, coveredThrough: '2026-04-07', evidenceTaxYears: ['2025-26'] }, year)).toBe(true);
    });

    test('0.18.10: evidence in a later tax year voids the closure for the closure\'s own year as well', () => {
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
    // @ts-expect-error — an envelope without coverage is not a feed response.
    const missing: BrokerFactsFeedResponse = { schemaVersion: '1.6.0', facts: [], nextCursor: null, hasMore: false };
    expect(missing).not.toHaveProperty('coverage');
  });

  test('the consumer can name every fail-closed state the 1.2.0 fields introduce', () => {
    for (const reason of ['relief_withholding_unknown', 'relief_withholding_invalid', 'statement_coverage_incomplete', 'mixed_ownership_modes', 'settlement_account_ref_missing']) {
      expect(FOREIGN_PROJECTION_REVIEW_REASONS).toContain(reason);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 1.6.0 (d152 doc42, owner-ratified 2026-09-30): the unconfirmed state and R6 contiguity policy cross the wire.
// ---------------------------------------------------------------------------------------------------------------------

type ExactKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The 1.5.0 wire, frozen: exactly the key sets a 1.5.0 reader (income-app with contracts 0.18.10) accepts. */
const WIRE_1_5_0 = {
  version: '1.5.0',
  fact: ['sourceEventId', 'source', 'contentFingerprint', 'eventType', 'txnDate', 'exDate', 'payDate', 'grossAmount',
    'netAmount', 'withholdingAmount', 'withholdingRate', 'ownershipMode', 'reliefWithholdingAmount', 'currencyCode',
    'amountBasis', 'symbol', 'isin', 'issuerCountry', 'payerEntity', 'brokerAccountRef', 'effective', 'supersededBy',
    'reviewStatus', 'reviewReason', 'updatedAt'],
  coverage: ['brokerAccountRef', 'coveredFrom', 'coveredThrough', 'accountOpenedOn', 'accountClosedOn', 'evidenceTaxYears'],
  envelope: ['schemaVersion', 'facts', 'coverage', 'nextCursor', 'hasMore'],
} as const;

/** The 1.6.0 wire. Each list is checked at compile time to be exactly the keys of its interface. */
const FACT_KEYS_1_6_0 = [...WIRE_1_5_0.fact, 'confirmation', 'unconfirmedReason'] as const;
const COVERAGE_KEYS_1_6_0 = [...WIRE_1_5_0.coverage, 'unconfirmedTaxYears', 'contiguityPolicy'] as const;
const ENVELOPE_KEYS_1_6_0 = WIRE_1_5_0.envelope;
const factKeysExact: ExactKeys<(typeof FACT_KEYS_1_6_0)[number], keyof BrokerFact> = true;
const coverageKeysExact: ExactKeys<(typeof COVERAGE_KEYS_1_6_0)[number], keyof BrokerFactsAccountCoverage> = true;
const envelopeKeysExact: ExactKeys<(typeof ENVELOPE_KEYS_1_6_0)[number], keyof BrokerFactsFeedResponse> = true;
const WIRE_1_6_0 = { version: BROKER_FACTS_FEED_SCHEMA_VERSION, fact: FACT_KEYS_1_6_0, coverage: COVERAGE_KEYS_1_6_0, envelope: ENVELOPE_KEYS_1_6_0 };

type WireKeys = { version: string; fact: readonly string[]; coverage: readonly string[]; envelope: readonly string[] };

/**
 * The consumer's reader rule, as income-app's `parseBrokerFactsFeed` applies it: exactly one `schemaVersion`, and
 * exactly that version's keys on the envelope, on every fact and on every coverage entry (no unknown key, none
 * missing). Field grammar is the reader's own; this checks only what a version bump changes.
 */
function strictReaderAccepts(wire: WireKeys, page: Record<string, unknown>): boolean {
  const exact = (value: unknown, keys: readonly string[]) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
  return page.schemaVersion === wire.version && exact(page, wire.envelope)
    && Array.isArray(page.facts) && page.facts.every((fact) => exact(fact, wire.fact))
    && Array.isArray(page.coverage) && page.coverage.every((entry) => exact(entry, wire.coverage));
}

/** `value` without `keys`, typed exactly as `Omit<T, K>`, so a compile-time check fails only for the named keys. */
function without<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(keys as readonly PropertyKey[]).includes(key))) as Omit<T, K>;
}

const coverage16: BrokerFactsAccountCoverage = {
  brokerAccountRef: 'U1234567', coveredFrom: '2025-04-06', coveredThrough: '2026-04-07', accountOpenedOn: null,
  accountClosedOn: null, evidenceTaxYears: null, unconfirmedTaxYears: [], contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP,
};
const page16: BrokerFactsFeedResponse = {
  schemaVersion: BROKER_FACTS_FEED_SCHEMA_VERSION, facts: [settlementFact], coverage: [coverage16], nextCursor: null, hasMore: false,
};
/** The same page as a 1.5.0 producer sends it. */
const page15 = {
  schemaVersion: '1.5.0',
  facts: [without(settlementFact, ['confirmation', 'unconfirmedReason'])],
  coverage: [without(coverage16, ['unconfirmedTaxYears', 'contiguityPolicy'])],
  nextCursor: null, hasMore: false,
};

describe('broker-facts wire 1.5.0 -> 1.6.0 compatibility', () => {
  test('1.6.0 is 1.5.0 plus exactly four required keys: nothing removed, renamed or re-typed on the envelope', () => {
    expect([factKeysExact, coverageKeysExact, envelopeKeysExact]).toEqual([true, true, true]);
    expect(FACT_KEYS_1_6_0.filter((key) => !(WIRE_1_5_0.fact as readonly string[]).includes(key))).toEqual(['confirmation', 'unconfirmedReason']);
    expect(COVERAGE_KEYS_1_6_0.filter((key) => !(WIRE_1_5_0.coverage as readonly string[]).includes(key))).toEqual(['unconfirmedTaxYears', 'contiguityPolicy']);
    expect(ENVELOPE_KEYS_1_6_0).toEqual(WIRE_1_5_0.envelope);
  });

  test('a 1.5.0 page is still accepted by a 1.5.0 reader, and a 1.6.0 reader refuses it', () => {
    expect(strictReaderAccepts(WIRE_1_5_0, page15)).toBe(true);
    expect(strictReaderAccepts(WIRE_1_6_0, page15)).toBe(false);
    // Refused for the missing keys alone, not only for the version.
    expect(strictReaderAccepts(WIRE_1_6_0, { ...page15, schemaVersion: '1.6.0' })).toBe(false);
  });

  test('a 1.6.0 reader requires the new keys; a 1.5.0 reader refuses a 1.6.0 page', () => {
    const page = page16 as unknown as Record<string, unknown>;
    expect(strictReaderAccepts(WIRE_1_6_0, page)).toBe(true);
    expect(strictReaderAccepts(WIRE_1_5_0, page)).toBe(false);
    expect(strictReaderAccepts(WIRE_1_5_0, { ...page, schemaVersion: '1.5.0' })).toBe(false); // unknown keys
    for (const key of ['confirmation', 'unconfirmedReason'] as const) {
      expect(strictReaderAccepts(WIRE_1_6_0, { ...page, facts: [without(settlementFact, [key])] })).toBe(false);
    }
    for (const key of ['unconfirmedTaxYears', 'contiguityPolicy'] as const) {
      expect(strictReaderAccepts(WIRE_1_6_0, { ...page, coverage: [without(coverage16, [key])] })).toBe(false);
    }
  });

  test('the new keys are required at compile time', () => {
    // Control: the typed omit of nothing is a complete fact and coverage entry.
    const complete: [BrokerFact, BrokerFactsAccountCoverage] = [without(settlementFact, []), without(coverage16, [])];
    expect(complete).toHaveLength(2);
    // @ts-expect-error — a 1.6.0 fact without confirmation/unconfirmedReason is incomplete.
    const fact: BrokerFact = without(settlementFact, ['confirmation', 'unconfirmedReason']);
    // @ts-expect-error — a 1.6.0 coverage entry without unconfirmedTaxYears is incomplete.
    const noHeld: BrokerFactsAccountCoverage = without(coverage16, ['unconfirmedTaxYears']);
    // @ts-expect-error — a 1.6.0 coverage entry without contiguityPolicy is incomplete.
    const noPolicy: BrokerFactsAccountCoverage = without(coverage16, ['contiguityPolicy']);
    // @ts-expect-error — the version is pinned: a 1.5.0 envelope is not a 1.6.0 feed response.
    const old: BrokerFactsFeedResponse = { ...page16, schemaVersion: '1.5.0' };
    expect([fact, noHeld, noPolicy, old].every(Boolean)).toBe(true);
  });

  test('the shared helpers judge a 1.5.0-shaped coverage object exactly as before (no-gap rule)', () => {
    const periods = [
      { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: true },
      { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: false },
      { start: '2024-04-06', end: '2025-04-05', accountHasFactsInPeriod: true },
    ];
    const shapes = [
      {}, { coveredThrough: '2026-04-05' }, { coveredThrough: '2026-04-06' }, { coveredFrom: '2025-10-01' },
      { coveredFrom: '2025-10-01', accountOpenedOn: '2025-10-01' }, { accountClosedOn: '2025-12-31', evidenceTaxYears: ['2025-26'] },
      { accountClosedOn: '2025-12-31', evidenceTaxYears: ['2026-27'] }, { coveredFrom: null, coveredThrough: null, accountOpenedOn: '2026-04-06', evidenceTaxYears: [] },
    ];
    for (const shape of shapes) {
      const v16 = { ...coverage16, ...shape } as BrokerFactsAccountCoverage;
      const v15 = without(v16, ['unconfirmedTaxYears', 'contiguityPolicy']) as unknown as Omit<BrokerFactsAccountCoverage, 'unconfirmedTaxYears' | 'contiguityPolicy'>;
      for (const period of periods) {
        const expected = isBrokerAccountCoverageFinal(v15, period);
        expect(isBrokerAccountCoverageFinal({ ...v16, contiguityPolicy: BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP }, period)).toBe(expected);
        // Unconfirmed items never change coverage finality.
        const held: BrokerFactsAccountCoverage = { ...v16, unconfirmedTaxYears: ['2024-25', '2025-26'] };
        expect(isBrokerAccountCoverageFinal(held, period)).toBe(expected);
      }
    }
  });
});

describe('confirmation and unconfirmedReason (doc42 §2.1–§2.2)', () => {
  test('the closed reason enum is exactly doc42 §2.2', () => {
    const reasons: readonly UnconfirmedReason[] = BROKER_FACT_UNCONFIRMED_REASONS;
    expect(reasons).toEqual([
      'awaiting_coverage', 'pay_date_crosses_tax_year', 'restatement_beyond_tolerance', 'restatement_crosses_tax_year',
      'possible_duplicate_action', 'scrip_distribution', 'payment_missing', 'classification_pending',
    ]);
    const confirmations: readonly BrokerFactConfirmation[] = BROKER_FACT_CONFIRMATIONS;
    expect(confirmations).toEqual(['confirmed', 'unconfirmed']);
    for (const reason of reasons) expect(isBrokerFactUnconfirmedReason(reason)).toBe(true);
    for (const bad of ['blocked', 'Awaiting_Coverage', 'awaiting_coverage ', '', null, undefined, 1, ['payment_missing']]) {
      expect(isBrokerFactUnconfirmedReason(bad)).toBe(false);
    }
  });

  test('legacy facts carry null in both fields; nothing else is legal for them', () => {
    const legacy = { ownershipMode: 'legacy' as const };
    expect(isBrokerFactConfirmationConsistent({ ...legacy, confirmation: null, unconfirmedReason: null })).toBe(true);
    expect(isBrokerFactConfirmationConsistent({ ...legacy, confirmation: 'confirmed', unconfirmedReason: null })).toBe(false);
    expect(isBrokerFactConfirmationConsistent({ ...legacy, confirmation: 'unconfirmed', unconfirmedReason: 'payment_missing' })).toBe(false);
    expect(isBrokerFactConfirmationConsistent({ ...legacy, confirmation: null, unconfirmedReason: 'payment_missing' })).toBe(false);
  });

  test('settlement facts: confirmed with no reason, or unconfirmed with exactly one closed reason', () => {
    const settlement = { ownershipMode: 'settlement' as const };
    expect(isBrokerFactConfirmationConsistent({ ...settlement, confirmation: 'confirmed', unconfirmedReason: null })).toBe(true);
    for (const reason of BROKER_FACT_UNCONFIRMED_REASONS) {
      expect(isBrokerFactConfirmationConsistent({ ...settlement, confirmation: 'unconfirmed', unconfirmedReason: reason })).toBe(true);
      expect(isBrokerFactConfirmationConsistent({ ...settlement, confirmation: 'confirmed', unconfirmedReason: reason })).toBe(false);
    }
    expect(isBrokerFactConfirmationConsistent({ ...settlement, confirmation: 'unconfirmed', unconfirmedReason: null })).toBe(false);
    expect(isBrokerFactConfirmationConsistent({ ...settlement, confirmation: null, unconfirmedReason: null })).toBe(false);
    const loose = (value: Record<string, unknown>) => value as unknown as Pick<BrokerFact, 'ownershipMode' | 'confirmation' | 'unconfirmedReason'>;
    expect(isBrokerFactConfirmationConsistent(loose({ ...settlement, confirmation: 'unconfirmed', unconfirmedReason: 'blocked' }))).toBe(false);
    expect(isBrokerFactConfirmationConsistent(loose({ ...settlement, confirmation: 'pending', unconfirmedReason: null }))).toBe(false);
    expect(isBrokerFactConfirmationConsistent(loose({ ...settlement }))).toBe(false);
    expect(isBrokerFactConfirmationConsistent(loose({ ownershipMode: 'other', confirmation: 'confirmed', unconfirmedReason: null }))).toBe(false);
  });

  test('an unconfirmed default and a withdrawn zero default are both expressible facts', () => {
    const paymentMissing: BrokerFact = { ...settlementFact, confirmation: 'unconfirmed', unconfirmedReason: 'payment_missing' };
    const awaitingCoverage: BrokerFact = { ...settlementFact, effective: false, reliefWithholdingAmount: null, confirmation: 'unconfirmed', unconfirmedReason: 'awaiting_coverage' };
    expect([paymentMissing, awaitingCoverage].every(isBrokerFactConfirmationConsistent)).toBe(true);
  });

  test('the broker_income_unconfirmed review atom is registered (doc42 §2.5)', () => {
    expect(FOREIGN_PROJECTION_REVIEW_REASONS).toContain('broker_income_unconfirmed');
    expect(INCOME_REVIEW_REASONS).toContain('broker_income_unconfirmed');
    expect(isIncomeReviewReason('broker_income_unconfirmed')).toBe(true);
  });
});

describe('unconfirmedTaxYears and filing readiness (doc42 §2.3)', () => {
  test('grammar: strictly ascending UK tax-year labels, never null', () => {
    for (const good of [[], ['2021-22'], ['2021-22', '2023-24']]) expect(isBrokerFactsUnconfirmedTaxYears(good)).toBe(true);
    for (const bad of [null, undefined, '2023-24', [2023], ['2023-25'], ['2023-24', '2021-22'], ['2023-24', '2023-24']]) {
      expect(isBrokerFactsUnconfirmedTaxYears(bad)).toBe(false);
    }
  });

  test('a year is held when it is listed; a broken list or a malformed year counts as held (fail closed)', () => {
    expect(isBrokerAccountTaxYearUnconfirmed({ unconfirmedTaxYears: ['2021-22'] }, '2021-22')).toBe(true);
    expect(isBrokerAccountTaxYearUnconfirmed({ unconfirmedTaxYears: ['2021-22'] }, '2022-23')).toBe(false);
    expect(isBrokerAccountTaxYearUnconfirmed({ unconfirmedTaxYears: [] }, '2022-23')).toBe(false);
    expect(isBrokerAccountTaxYearUnconfirmed({ unconfirmedTaxYears: [] }, '2022-24')).toBe(true);
    for (const broken of [null, undefined, ['2023-24', '2021-22'], ['2021-23']]) {
      expect(isBrokerAccountTaxYearUnconfirmed({ unconfirmedTaxYears: broken as unknown as string[] }, '2019-20')).toBe(true);
    }
  });

  const year = { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: true, accountHasUnconfirmedItemsInPeriod: false };
  // Through Tue 2026-04-07: PCT Mon 2026-04-06 reaches the 5 April year end, so 2025-26 is coverage-final.
  const final = { ...coverage16 };

  test('a held year is coverage-final but NOT filing-ready; unconfirmed blocks filing, never coverage', () => {
    const held = { ...final, unconfirmedTaxYears: ['2025-26'] };
    expect(isBrokerAccountCoverageFinal(held, year)).toBe(true);
    expect(isBrokerAccountYearFilingReady(held, year)).toBe(false);
    // With nothing held, the same year is filing-ready.
    expect(isBrokerAccountYearFilingReady(final, year)).toBe(true);
    // A hold in another year does not touch this one.
    expect(isBrokerAccountYearFilingReady({ ...final, unconfirmedTaxYears: ['2021-22', '2026-27'] }, year)).toBe(true);
  });

  test('filing readiness needs coverage finality first', () => {
    expect(isBrokerAccountYearFilingReady({ ...final, coveredThrough: '2026-04-05' }, year)).toBe(false);
    expect(isBrokerAccountYearFilingReady({ ...final, contiguityPolicy: 'no-gap-contiguity.v0' as BrokerFactsContiguityPolicy }, year)).toBe(false);
  });

  test('the caller can only add holds', () => {
    expect(isBrokerAccountYearFilingReady(final, { ...year, accountHasUnconfirmedItemsInPeriod: true })).toBe(false);
    expect(isBrokerAccountYearFilingReady({ ...final, unconfirmedTaxYears: ['2025-26'] }, { ...year, accountHasUnconfirmedItemsInPeriod: false })).toBe(false);
    const loose = { ...year, accountHasUnconfirmedItemsInPeriod: 'no' as unknown as boolean };
    expect(isBrokerAccountYearFilingReady(final, loose)).toBe(false);
  });

  test('a broken or missing unconfirmedTaxYears holds every year, while coverage stays final', () => {
    for (const broken of [null, undefined, ['2025-26', '2021-22'], ['2025-27'], '2021-22']) {
      const entry = { ...final, unconfirmedTaxYears: broken as unknown as string[] };
      expect(isBrokerAccountCoverageFinal(entry, year)).toBe(true);
      expect(isBrokerAccountYearFilingReady(entry, year)).toBe(false);
    }
  });

  test('pay_date_crosses_tax_year holds both candidate years; the next year is unaffected', () => {
    // Accrual pay date Sat 5 April 2025 (2024-25), cash Mon 7 April 2025 (2025-26): both years held.
    const entry = { ...final, coveredFrom: '2023-04-06', coveredThrough: '2027-04-07', unconfirmedTaxYears: ['2024-25', '2025-26'] };
    const period = (startYear: number) => ({ ...year, start: `${startYear}-04-06`, end: `${startYear + 1}-04-05` });
    expect([2023, 2024, 2025, 2026].map((y) => isBrokerAccountCoverageFinal(entry, period(y)))).toEqual([true, true, true, true]);
    expect([2023, 2024, 2025, 2026].map((y) => isBrokerAccountYearFilingReady(entry, period(y)))).toEqual([true, false, false, true]);
  });

  test('a period spanning several tax years is held if any year it touches is held', () => {
    const entry = { ...final, coveredFrom: '2023-04-06', coveredThrough: '2027-04-07' };
    const span = { ...year, start: '2024-04-06', end: '2026-04-05' };
    expect(isBrokerAccountYearFilingReady({ ...entry, unconfirmedTaxYears: ['2024-25'] }, span)).toBe(false);
    expect(isBrokerAccountYearFilingReady({ ...entry, unconfirmedTaxYears: ['2025-26'] }, span)).toBe(false);
    expect(isBrokerAccountYearFilingReady({ ...entry, unconfirmedTaxYears: ['2023-24', '2026-27'] }, span)).toBe(true);
    // A part-year period touches the year it lies in.
    expect(isBrokerAccountYearFilingReady({ ...entry, unconfirmedTaxYears: ['2025-26'] }, { ...year, start: '2025-06-01', end: '2025-12-31' })).toBe(false);
  });

  test('the full 1.6.0 entry and the caller flag are required at compile time', () => {
    // @ts-expect-error — without accountHasUnconfirmedItemsInPeriod the caller's holds cannot be added.
    expect(isBrokerAccountYearFilingReady(final, { start: year.start, end: year.end, accountHasFactsInPeriod: true })).toBe(false);
    const v15 = without(final, ['unconfirmedTaxYears', 'contiguityPolicy']) as unknown as Omit<BrokerFactsAccountCoverage, 'unconfirmedTaxYears' | 'contiguityPolicy'>;
    // @ts-expect-error — a 1.5.0-shaped entry carries no unconfirmed signal, so it cannot be judged filing-ready.
    expect(isBrokerAccountYearFilingReady(v15, year)).toBe(false);
  });
});

describe('R6 contiguity policy (doc42 §1 R6)', () => {
  const NO_GAP = BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP;
  const WEEKEND = BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND;
  const contiguous = (runEnd: string, nextStart: string) =>
    [brokerStatementWindowsContiguous(runEnd, nextStart, NO_GAP), brokerStatementWindowsContiguous(runEnd, nextStart, WEEKEND)];

  test('two versioned policies; the weekend policy is the ratified R6 rule identity', () => {
    expect(BROKER_FACTS_CONTIGUITY_POLICIES).toEqual(['no-gap-contiguity.v1', 'ibkr_weekend_window_contiguity_20260930.v1']);
    for (const policy of BROKER_FACTS_CONTIGUITY_POLICIES) expect(isBrokerFactsContiguityPolicy(policy)).toBe(true);
    for (const bad of ['ibkr_weekend_window_contiguity_20260930.v2', 'weekend', '', null, undefined, 1]) {
      expect(isBrokerFactsContiguityPolicy(bad)).toBe(false);
    }
  });

  test('overlapping and adjacent windows are contiguous under both policies', () => {
    expect(contiguous('2024-03-06', '2024-03-01')).toEqual([true, true]); // overlap
    expect(contiguous('2024-03-06', '2024-03-06')).toEqual([true, true]); // shares a day
    expect(contiguous('2024-03-06', '2024-03-07')).toEqual([true, true]); // adjacent (Wed -> Thu)
    expect(contiguous('2024-03-02', '2024-03-03')).toEqual([true, true]); // adjacent over a weekend day
  });

  test('a Saturday/Sunday-only gap is bridged only with the weekend policy asserted', () => {
    expect(contiguous('2024-03-01', '2024-03-04')).toEqual([false, true]); // Fri -> Mon: Sat+Sun
    expect(contiguous('2024-03-01', '2024-03-03')).toEqual([false, true]); // Fri -> Sun: Sat only
    expect(contiguous('2024-03-02', '2024-03-04')).toEqual([false, true]); // Sat -> Mon: Sun only
    expect(contiguous('2021-12-31', '2022-01-03')).toEqual([false, true]); // acct2's New Year gaps, across a year end
    expect(contiguous('2022-12-30', '2023-01-02')).toEqual([false, true]);
  });

  test('any weekday in the gap fails closed under both policies: holidays are never bridged', () => {
    expect(contiguous('2024-02-29', '2024-03-04')).toEqual([false, false]); // Thu -> Mon: Fri–Sun
    expect(contiguous('2024-03-01', '2024-03-05')).toEqual([false, false]); // Fri -> Tue: a Monday holiday
    expect(contiguous('2024-03-28', '2024-03-30')).toEqual([false, false]); // Good Friday 2024-03-29
    expect(contiguous('2024-03-29', '2024-04-02')).toEqual([false, false]); // Easter Monday 2024-04-01
    expect(contiguous('2024-03-04', '2024-03-06')).toEqual([false, false]); // Mon -> Wed: one weekday
    expect(contiguous('2024-03-02', '2024-03-05')).toEqual([false, false]); // Sat -> Tue: Sun+Mon
    expect(contiguous('2024-03-01', '2024-06-03')).toEqual([false, false]); // months apart
  });

  test('invalid dates or an unrecognised policy are never contiguous, even for adjacent windows', () => {
    for (const bad of ['', '2024-02-30', '20240301', '2024-03-01T00:00:00Z', null as unknown as string]) {
      expect(contiguous(bad, '2024-03-02')).toEqual([false, false]);
      expect(contiguous('2024-03-01', bad)).toEqual([false, false]);
    }
    for (const policy of ['ibkr_weekend_window_contiguity_20260930.v2', '', undefined]) {
      expect(brokerStatementWindowsContiguous('2024-03-01', '2024-03-02', policy as unknown as BrokerFactsContiguityPolicy)).toBe(false);
      expect(brokerStatementWindowsContiguous('2024-03-01', '2024-03-04', policy as unknown as BrokerFactsContiguityPolicy)).toBe(false);
    }
  });

  // The coverage run exactly as `BrokerFactsAccountCoverage` defines it, using the contract's gap rule.
  function coverageRun(windows: Array<[string, string]>, policy: BrokerFactsContiguityPolicy) {
    const sorted = [...windows].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    let [coveredFrom, coveredThrough] = sorted[0];
    for (const [start, end] of sorted.slice(1)) {
      if (!brokerStatementWindowsContiguous(coveredThrough, start, policy)) break;
      if (end > coveredThrough) coveredThrough = end;
    }
    return { coveredFrom, coveredThrough, contiguityPolicy: policy };
  }

  // acct2's three annual statements (doc42 §1 R6 "Effect on PCT, N1 and N2"), given out of order.
  const acct2Windows: Array<[string, string]> = [['2023-01-02', '2023-12-29'], ['2021-03-23', '2021-12-31'], ['2022-01-03', '2022-12-30']];

  test('doc42 acct2: the run and PCT move only when the producer asserts R6', () => {
    const strict = coverageRun(acct2Windows, NO_GAP);
    const weekend = coverageRun(acct2Windows, WEEKEND);
    expect(strict).toEqual({ coveredFrom: '2021-03-23', coveredThrough: '2021-12-31', contiguityPolicy: NO_GAP });
    expect(weekend).toEqual({ coveredFrom: '2021-03-23', coveredThrough: '2023-12-29', contiguityPolicy: WEEKEND });
    // PCT formula unchanged: 2021-12-30 -> 2023-12-28, as doc42 states. R6 never moves coveredFrom.
    expect([paymentsCoveredThrough(strict.coveredThrough), paymentsCoveredThrough(weekend.coveredThrough)]).toEqual(['2021-12-30', '2023-12-28']);
  });

  test('doc42 acct2: its N2 closure (2023-07-12) completes 2022-23 onwards only on the bridged run', () => {
    const account = { accountOpenedOn: '2021-03-23', accountClosedOn: '2023-07-12', evidenceTaxYears: ['2020-21', '2021-22', '2022-23', '2023-24'], unconfirmedTaxYears: [] };
    const period = (startYear: number) => ({ start: `${startYear}-04-06`, end: `${startYear + 1}-04-05`, accountHasFactsInPeriod: startYear <= 2023 });
    const strict = { ...account, ...coverageRun(acct2Windows, NO_GAP) };
    const weekend = { ...account, ...coverageRun(acct2Windows, WEEKEND) };
    expect([2021, 2022, 2023, 2024].map((y) => isBrokerAccountCoverageFinal(strict, period(y)))).toEqual([false, false, false, false]);
    expect([2021, 2022, 2023, 2024].map((y) => isBrokerAccountCoverageFinal(weekend, period(y)))).toEqual([true, true, true, true]);
    // 2020-21 (from 6 April 2020): the run starts 2021-03-23, the account's opening, so it is final under both.
    expect([strict, weekend].map((entry) => isBrokerAccountCoverageFinal(entry, period(2020)))).toEqual([true, true]);
  });

  test('the year-final helper refuses a policy it does not recognise and accepts both known ones', () => {
    const year = { start: '2025-04-06', end: '2026-04-05', accountHasFactsInPeriod: true };
    expect(isBrokerAccountCoverageFinal({ ...coverage16, contiguityPolicy: NO_GAP }, year)).toBe(true);
    expect(isBrokerAccountCoverageFinal({ ...coverage16, contiguityPolicy: WEEKEND }, year)).toBe(true);
    for (const policy of ['ibkr_weekend_window_contiguity_20260930.v2', '', null]) {
      expect(isBrokerAccountCoverageFinal({ ...coverage16, contiguityPolicy: policy as unknown as BrokerFactsContiguityPolicy }, year)).toBe(false);
    }
  });
});
