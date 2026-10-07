// d188 — residency-tax-years 1.0.0, classifyDateResidency, incomeResidencyScope, residency.read.
// Design: specs/implementation/council/0.9.x-d188-srt-residency/00-proposed-design.md §3.1, §3.3, §3.4, §5.0, §5.2, §9.1.

import {
  RESIDENCY_READ_PURPOSE,
  RESIDENCY_TAX_YEARS_SCHEMA_VERSION,
  RESIDENCY_SPLIT_CASES,
  classifyDateResidency,
  classifyDateResidencyDetail,
  incomeResidencyScope,
  isResidencySplitShapeValid,
  issuerCompanyResidenceOn,
  parseResidencyTaxYears,
  readS1a3Attestation,
  residencyIncomeSource,
  splitDatesFromSplitDay,
  ukTaxYearBounds,
  type ResidencyIssuerResidence,
  type ResidencyTaxYear,
  type ResidencyTaxYearsResponse,
} from '../browser';
import {
  PERMISSION_ACTIONS,
  TOKEN_CLASSES,
  TOKEN_CLASS_PURPOSE_MATRIX,
  TOKEN_PURPOSES,
  findForbiddenViaClaim,
  isPurposeAllowedForClass,
} from '../auth';

const year = (over: Partial<ResidencyTaxYear> & { tax_year: string }): ResidencyTaxYear => ({
  status: 'resident',
  review_reason: null,
  effective_status: null,
  tnr_candidate: false,
  revision: 1,
  split_case: null,
  split_day: null,
  uk_part_start: null,
  uk_part_end: null,
  provisional: false,
  provisional_until: null,
  accountant_check: 'not_requested',
  ...over,
});

const split = (taxYear: string, splitCase: number, splitDay: string, over: Partial<ResidencyTaxYear> = {}) => {
  const d = splitDatesFromSplitDay(splitCase, splitDay, taxYear);
  if (d === null) throw new Error('fixture: invalid split');
  return year({
    tax_year: taxYear, status: 'split_year', split_case: splitCase as ResidencyTaxYear['split_case'],
    split_day: splitDay, uk_part_start: d.uk_part_start, uk_part_end: d.uk_part_end, ...over,
  });
};

describe('ukTaxYearBounds', () => {
  test('6 April to 5 April; malformed label is null', () => {
    expect(ukTaxYearBounds('2023-24')).toEqual({ start: '2023-04-06', end: '2024-04-05' });
    expect(ukTaxYearBounds('2099-00')).toEqual({ start: '2099-04-06', end: '2100-04-05' });
    expect(ukTaxYearBounds('2023-25')).toBeNull();
  });
});

describe('splitDatesFromSplitDay: split_day to stored dates per Case (design §4.3)', () => {
  const Y = '2023-24'; // 2023-04-06 .. 2024-04-05
  test('Cases 1-3: split_day is the first OVERSEAS day; uk_part_end = split_day - 1; the day before, itself, after', () => {
    for (const c of [1, 2, 3]) {
      expect(splitDatesFromSplitDay(c, '2023-10-01', Y)).toEqual({ uk_part_start: '2023-04-06', uk_part_end: '2023-09-30' });
      // the day before / after shift the end by exactly one day
      expect(splitDatesFromSplitDay(c, '2023-09-30', Y)?.uk_part_end).toBe('2023-09-29');
      expect(splitDatesFromSplitDay(c, '2023-10-02', Y)?.uk_part_end).toBe('2023-10-01');
    }
  });
  test('Cases 4, 5, 7, 8: split_day is the first UK day; uk_part_start = split_day, ends 5 April', () => {
    for (const c of [4, 5, 7, 8]) {
      expect(splitDatesFromSplitDay(c, '2023-10-01', Y)).toEqual({ uk_part_start: '2023-10-01', uk_part_end: '2024-04-05' });
      expect(splitDatesFromSplitDay(c, '2023-09-30', Y)?.uk_part_start).toBe('2023-09-30');
      expect(splitDatesFromSplitDay(c, '2023-10-02', Y)?.uk_part_start).toBe('2023-10-02');
    }
  });
  test('Case 6: split_day is the LAST overseas day; uk_part_start = split_day + 1', () => {
    expect(splitDatesFromSplitDay(6, '2023-10-01', Y)).toEqual({ uk_part_start: '2023-10-02', uk_part_end: '2024-04-05' });
    expect(splitDatesFromSplitDay(6, '2023-09-30', Y)?.uk_part_start).toBe('2023-10-01');
    expect(splitDatesFromSplitDay(6, '2023-10-02', Y)?.uk_part_start).toBe('2023-10-03');
  });
  test('month-end and leap-day arithmetic (2023-24 contains 29 Feb 2024)', () => {
    expect(splitDatesFromSplitDay(6, '2024-02-28', Y)?.uk_part_start).toBe('2024-02-29');
    expect(splitDatesFromSplitDay(6, '2024-02-29', Y)?.uk_part_start).toBe('2024-03-01');
    expect(splitDatesFromSplitDay(1, '2024-03-01', Y)?.uk_part_end).toBe('2024-02-29');
  });
  test('a single-day UK part is valid: arrival day 5 April; departure day 7 April', () => {
    expect(splitDatesFromSplitDay(4, '2024-04-05', Y)).toEqual({ uk_part_start: '2024-04-05', uk_part_end: '2024-04-05' });
    expect(splitDatesFromSplitDay(1, '2023-04-07', Y)).toEqual({ uk_part_start: '2023-04-06', uk_part_end: '2023-04-06' });
    expect(splitDatesFromSplitDay(6, '2024-04-04', Y)).toEqual({ uk_part_start: '2024-04-05', uk_part_end: '2024-04-05' });
  });
  test('the overseas part must be non-empty (no whole resident year with a Case label)', () => {
    expect(splitDatesFromSplitDay(4, '2023-04-06', Y)).toBeNull(); // arrival on 6 April: no overseas day
    expect(splitDatesFromSplitDay(5, '2023-04-06', Y)).toBeNull();
    expect(splitDatesFromSplitDay(1, '2024-04-06', Y)).toBeNull(); // outside the year
    expect(splitDatesFromSplitDay(1, '2024-04-05', Y)?.uk_part_end).toBe('2024-04-04'); // 5 April overseas day is fine
  });
  test('the UK part must be non-empty', () => {
    expect(splitDatesFromSplitDay(1, '2023-04-06', Y)).toBeNull(); // departure on day one: UK part empty
    expect(splitDatesFromSplitDay(6, '2024-04-05', Y)).toBeNull(); // last overseas day is the year end
  });
  test('split_day outside the year, malformed date, bad Case, bad year all null', () => {
    expect(splitDatesFromSplitDay(4, '2023-04-05', Y)).toBeNull();
    expect(splitDatesFromSplitDay(4, '2024-04-06', Y)).toBeNull();
    expect(splitDatesFromSplitDay(4, '2023-02-30', Y)).toBeNull();
    expect(splitDatesFromSplitDay(9, '2023-10-01', Y)).toBeNull();
    expect(splitDatesFromSplitDay(0, '2023-10-01', Y)).toBeNull();
    expect(splitDatesFromSplitDay(4, '2023-10-01', '2023-25')).toBeNull();
  });
  test('shape check: stored dates must be exactly the derived ones', () => {
    const ok = split(Y, 4, '2023-10-01');
    expect(isResidencySplitShapeValid(ok)).toBe(true);
    expect(isResidencySplitShapeValid({ ...ok, uk_part_start: '2023-10-02' })).toBe(false);
    expect(isResidencySplitShapeValid({ ...ok, uk_part_end: '2024-04-04' })).toBe(false);
    expect(isResidencySplitShapeValid({ ...ok, split_case: null })).toBe(false);
    expect(isResidencySplitShapeValid({ ...ok, split_case: 1 })).toBe(false); // dates are Case-specific
    expect(RESIDENCY_SPLIT_CASES).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('classifyDateResidency', () => {
  test('no residency data: every date is resident (design §3.3 rule 1)', () => {
    expect(classifyDateResidency('2022-09-01', [])).toBe('resident');
  });

  test('plain statuses by the tax year of the date; 5/6 April boundary', () => {
    const years = [
      year({ tax_year: '2021-22', status: 'non_resident' }),
      year({ tax_year: '2022-23', status: 'non_resident' }),
      year({ tax_year: '2023-24', status: 'resident' }),
    ];
    expect(classifyDateResidency('2022-04-05', years)).toBe('non_resident'); // last day of 2021-22
    expect(classifyDateResidency('2023-04-05', years)).toBe('non_resident'); // last day of 2022-23
    expect(classifyDateResidency('2023-04-06', years)).toBe('resident'); // first day of 2023-24
  });

  test('a missing year once there is data is needs_review / not_assessed', () => {
    const years = [year({ tax_year: '2023-24' })];
    expect(classifyDateResidency('2022-09-01', years)).toBe('needs_review');
    expect(classifyDateResidencyDetail('2022-09-01', years)).toMatchObject({
      dateClass: 'needs_review', taxYear: '2022-23', reviewReason: 'not_assessed', effectiveClass: null,
    });
  });

  test('invalid dates, duplicate rows and non-array input fail closed', () => {
    const y = year({ tax_year: '2023-24' });
    expect(classifyDateResidency('not-a-date', [y])).toBe('needs_review');
    expect(classifyDateResidency('2023-02-30', [y])).toBe('needs_review');
    expect(classifyDateResidency('2023-10-01', [y, { ...y, status: 'non_resident' }])).toBe('needs_review');
    expect(classifyDateResidency('2023-10-01', null as unknown as ResidencyTaxYear[])).toBe('needs_review');
  });

  test('an unknown status value fails closed', () => {
    expect(classifyDateResidency('2023-10-01', [year({ tax_year: '2023-24', status: 'weird' as never })])).toBe('needs_review');
  });

  describe('split years, per Case (day before / the day / day after)', () => {
    test('departure Cases 1-3: split_day is overseas; the day before is UK part', () => {
      for (const c of [1, 2, 3]) {
        const years = [split('2023-24', c, '2023-10-01')];
        expect(classifyDateResidency('2023-04-06', years)).toBe('split_uk_part');
        expect(classifyDateResidency('2023-09-30', years)).toBe('split_uk_part');
        expect(classifyDateResidency('2023-10-01', years)).toBe('split_overseas_part');
        expect(classifyDateResidency('2023-10-02', years)).toBe('split_overseas_part');
        expect(classifyDateResidency('2024-04-05', years)).toBe('split_overseas_part');
      }
    });
    test('arrival Cases 4, 5, 7, 8: split_day is the first UK day', () => {
      for (const c of [4, 5, 7, 8]) {
        const years = [split('2023-24', c, '2023-10-01')];
        expect(classifyDateResidency('2023-04-06', years)).toBe('split_overseas_part');
        expect(classifyDateResidency('2023-09-30', years)).toBe('split_overseas_part');
        expect(classifyDateResidency('2023-10-01', years)).toBe('split_uk_part');
        expect(classifyDateResidency('2023-10-02', years)).toBe('split_uk_part');
        expect(classifyDateResidency('2024-04-05', years)).toBe('split_uk_part');
      }
    });
    test('Case 6: split_day is the LAST overseas day; the next day is UK part', () => {
      const years = [split('2023-24', 6, '2023-10-01')];
      expect(classifyDateResidency('2023-09-30', years)).toBe('split_overseas_part');
      expect(classifyDateResidency('2023-10-01', years)).toBe('split_overseas_part');
      expect(classifyDateResidency('2023-10-02', years)).toBe('split_uk_part');
    });
    test('a single-day UK part: only that day is the UK part', () => {
      const years = [split('2023-24', 4, '2024-04-05')];
      expect(classifyDateResidency('2024-04-04', years)).toBe('split_overseas_part');
      expect(classifyDateResidency('2024-04-05', years)).toBe('split_uk_part');
    });
    test('an inconsistent split row (dates not derived from split_day, or missing fields) fails closed', () => {
      const ok = split('2023-24', 4, '2023-10-01');
      expect(classifyDateResidency('2023-12-01', [{ ...ok, uk_part_start: '2023-06-01' }])).toBe('needs_review');
      expect(classifyDateResidency('2023-12-01', [{ ...ok, split_day: null }])).toBe('needs_review');
      expect(classifyDateResidency('2023-12-01', [{ ...ok, split_case: null }])).toBe('needs_review');
    });
    test('a provisional split year still classifies by its dates', () => {
      const years = [split('2023-24', 5, '2023-10-01', { provisional: true, provisional_until: '2024-09-30' })];
      expect(classifyDateResidency('2023-10-01', years)).toBe('split_uk_part');
    });
  });

  describe('needs_review years', () => {
    const review = (over: Partial<ResidencyTaxYear>) =>
      year({ tax_year: '2023-24', status: 'needs_review', review_reason: 'boundary', effective_status: 'legacy', ...over });

    test('is needs_review whatever the kept status; the kept class is in the detail', () => {
      expect(classifyDateResidency('2023-10-01', [review({})])).toBe('needs_review');
      expect(classifyDateResidencyDetail('2023-10-01', [review({})])).toMatchObject({
        dateClass: 'needs_review', reviewReason: 'boundary', effectiveStatus: 'legacy', effectiveClass: 'legacy',
      });
      expect(classifyDateResidencyDetail('2023-10-01', [review({ effective_status: 'resident' })]).effectiveClass).toBe('resident');
      expect(classifyDateResidencyDetail('2023-10-01', [review({ effective_status: 'non_resident' })]).effectiveClass).toBe('non_resident');
    });
    test('a kept split year keeps its dates and splits the date class (dependency_changed)', () => {
      const s = split('2023-24', 4, '2023-10-01');
      const kept = review({
        review_reason: 'dependency_changed', effective_status: 'split_year', split_case: s.split_case,
        split_day: s.split_day, uk_part_start: s.uk_part_start, uk_part_end: s.uk_part_end,
      });
      expect(classifyDateResidencyDetail('2023-09-30', [kept]).effectiveClass).toBe('split_overseas_part');
      expect(classifyDateResidencyDetail('2023-10-01', [kept]).effectiveClass).toBe('split_uk_part');
      expect(classifyDateResidency('2023-10-01', [kept])).toBe('needs_review');
    });
    test('provisional_expired falls back to resident with NULL split fields (never split_year)', () => {
      const expired = review({ review_reason: 'provisional_expired', effective_status: 'resident' });
      expect(classifyDateResidencyDetail('2023-10-01', [expired])).toMatchObject({
        dateClass: 'needs_review', reviewReason: 'provisional_expired', effectiveClass: 'resident',
      });
    });
    test('a kept split_year whose dates do not hold is unresolved (null), not guessed', () => {
      expect(classifyDateResidencyDetail('2023-10-01', [review({ effective_status: 'split_year' })]).effectiveClass).toBeNull();
    });
    test('NULL or unknown effective_status fails closed to unresolved', () => {
      expect(classifyDateResidencyDetail('2023-10-01', [review({ effective_status: null })])).toMatchObject({
        dateClass: 'needs_review', effectiveStatus: null, effectiveClass: null,
      });
      expect(classifyDateResidencyDetail('2023-10-01', [review({ effective_status: 'nonsense' as never })]).effectiveClass).toBeNull();
    });
  });

  test('tnr_candidate is surfaced per year and defaults false when there is no usable row', () => {
    const years = [year({ tax_year: '2024-25', tnr_candidate: true })];
    expect(classifyDateResidencyDetail('2024-10-01', years).tnrCandidate).toBe(true);
    expect(classifyDateResidencyDetail('2023-10-01', years).tnrCandidate).toBe(false);
    // the flag does not change the date class: the consumer reads it (design §7)
    expect(classifyDateResidency('2024-10-01', years)).toBe('resident');
  });

  test("the owner's case: 2021-22 and 2022-23 non-resident, 2023-24 split or resident", () => {
    const years = [
      year({ tax_year: '2021-22', status: 'non_resident' }),
      year({ tax_year: '2022-23', status: 'non_resident' }),
      split('2023-24', 4, '2023-03-06'.replace('2023-03', '2023-10')),
    ];
    expect(classifyDateResidency('2022-08-18', years)).toBe('non_resident');
    expect(classifyDateResidency('2023-03-06', years)).toBe('non_resident'); // 2022-23 is whole-year non-resident
  });
});

describe('readS1a3Attestation: retired / withdrawn / unknown semantics (design §3.4 rule 2)', () => {
  test('live answers', () => {
    expect(readS1a3Attestation({ s1a3_chargeable: true, withdrawn: false, retired: false })).toBe('true');
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: false, retired: false })).toBe('false');
    expect(readS1a3Attestation({ s1a3_chargeable: null, withdrawn: false, retired: false })).toBe('unknown');
  });
  test('a withdrawn, non-retired row reads unknown even if it holds an answer', () => {
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: true, retired: false })).toBe('unknown');
    expect(readS1a3Attestation({ s1a3_chargeable: true, withdrawn: true, retired: false })).toBe('unknown');
  });
  test('a retired row is not-gating and is never read as unknown, withdrawn or not', () => {
    expect(readS1a3Attestation({ s1a3_chargeable: null, withdrawn: false, retired: true })).toBe('not_gating');
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: true, retired: true })).toBe('not_gating');
  });
  test('malformed flags fail closed to unknown', () => {
    expect(readS1a3Attestation({ s1a3_chargeable: 'false' as never, withdrawn: false, retired: false })).toBe('unknown');
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: undefined as never, retired: false })).toBe('unknown');
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: false, retired: undefined as never })).toBe('unknown');
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: false, retired: 'no' as never })).toBe('unknown');
    expect(readS1a3Attestation({ s1a3_chargeable: false, withdrawn: 'no' as never, retired: false })).toBe('unknown');
    expect(readS1a3Attestation({ s1a3_chargeable: true, withdrawn: false, retired: undefined as never })).toBe('unknown');
  });
});

describe('issuerCompanyResidenceOn: dated-range company residence (design §5.0)', () => {
  const row = (over: Partial<ResidencyIssuerResidence>): ResidencyIssuerResidence => ({
    id: '1', issuer_key: 'US46284V1017', valid_from: '2021-04-06', valid_to: '2023-03-05',
    answer: 'not_uk_resident', withdrawn: false, issuer_revision: 1, ...over,
  });
  test('one range answers dividends in 2021-22 and 2022-23 without a second question', () => {
    const rows = [row({})];
    expect(issuerCompanyResidenceOn('US46284V1017', '2021-09-01', rows)).toBe('not_uk_resident');
    expect(issuerCompanyResidenceOn('US46284V1017', '2022-09-01', rows)).toBe('not_uk_resident');
  });
  test('range ends are inclusive; outside the range, a gap, and another issuer are unknown', () => {
    const rows = [row({}), row({ id: '2', valid_from: '2023-06-01', valid_to: '2023-12-31', answer: 'uk_resident' })];
    expect(issuerCompanyResidenceOn('US46284V1017', '2021-04-06', rows)).toBe('not_uk_resident');
    expect(issuerCompanyResidenceOn('US46284V1017', '2023-03-05', rows)).toBe('not_uk_resident');
    expect(issuerCompanyResidenceOn('US46284V1017', '2023-03-06', rows)).toBe('unknown'); // gap
    expect(issuerCompanyResidenceOn('US46284V1017', '2023-06-01', rows)).toBe('uk_resident');
    expect(issuerCompanyResidenceOn('US46284V1017', '2020-01-01', rows)).toBe('unknown');
    expect(issuerCompanyResidenceOn('SGXC37098255', '2022-01-01', rows)).toBe('unknown');
  });
  test('a successor ISIN does not inherit the predecessor answer', () => {
    expect(issuerCompanyResidenceOn('SGXC11267561', '2022-01-01', [row({ issuer_key: 'SGXC37098255' })])).toBe('unknown');
  });
  test('withdrawn rows are ignored; an explicit unknown answer is unknown; conflicting live rows fail closed', () => {
    expect(issuerCompanyResidenceOn('US46284V1017', '2022-01-01', [row({ withdrawn: true })])).toBe('unknown');
    expect(issuerCompanyResidenceOn('US46284V1017', '2022-01-01', [row({ answer: 'unknown' })])).toBe('unknown');
    expect(issuerCompanyResidenceOn('US46284V1017', '2022-01-01', [row({}), row({ id: '2', answer: 'uk_resident' })])).toBe('unknown');
    expect(issuerCompanyResidenceOn('US46284V1017', 'bad', [row({})])).toBe('unknown');
  });
  test('a withdrawn row never blocks a fresh answer for the same dates', () => {
    const rows = [row({ withdrawn: true, answer: 'uk_resident' }), row({ id: '2', answer: 'not_uk_resident' })];
    expect(issuerCompanyResidenceOn('US46284V1017', '2022-01-01', rows)).toBe('not_uk_resident');
  });
});

describe('residencyIncomeSource / incomeResidencyScope: every §5.0 cell', () => {
  const foreignDiv = { issuerCountry: 'US', companyResidence: 'not_uk_resident' } as const;
  const ukResidentForeignIssuer = { issuerCountry: 'US', companyResidence: 'uk_resident' } as const;
  const unknownCompany = { issuerCountry: 'US', companyResidence: 'unknown' } as const;
  const gbDiv = { issuerCountry: 'GB' } as const;

  test('dividend source: GB is UK; non-GB needs the company-residence answer; never from the country alone', () => {
    expect(residencyIncomeSource('dividend', gbDiv)).toBe('uk');
    expect(residencyIncomeSource('dividend', { issuerCountry: 'gb' })).toBe('uk');
    expect(residencyIncomeSource('dividend', foreignDiv)).toBe('foreign');
    expect(residencyIncomeSource('dividend', ukResidentForeignIssuer)).toBe('uk');
    expect(residencyIncomeSource('dividend', unknownCompany)).toBe('unknown');
    expect(residencyIncomeSource('dividend', { issuerCountry: 'US' })).toBe('unknown');
    expect(residencyIncomeSource('dividend', { issuerCountry: 'US', companyResidence: null })).toBe('unknown');
    expect(residencyIncomeSource('dividend', {})).toBe('unknown');
    expect(residencyIncomeSource('dividend', { issuerCountry: null, companyResidence: 'not_uk_resident' })).toBe('unknown');
    expect(residencyIncomeSource('dividend', { issuerCountry: 'USA', companyResidence: 'not_uk_resident' })).toBe('unknown');
  });
  test('interest: country alone is never enough; only recorded payer-and-branch evidence is foreign', () => {
    expect(residencyIncomeSource('interest', { issuerCountry: 'US' })).toBe('unknown');
    expect(residencyIncomeSource('interest', { issuerCountry: 'GB' })).toBe('unknown');
    expect(residencyIncomeSource('interest', { foreignPayerBranchEvidence: true })).toBe('foreign');
    expect(residencyIncomeSource('interest', { foreignPayerBranchEvidence: false })).toBe('unknown');
  });
  test('other income types and currency are never evidence', () => {
    expect(residencyIncomeSource('other', { issuerCountry: 'US', companyResidence: 'not_uk_resident', foreignPayerBranchEvidence: true })).toBe('unknown');
  });

  test('resident and split_uk_part: everything in scope, no review flag', () => {
    for (const dc of ['resident', 'split_uk_part'] as const) {
      expect(incomeResidencyScope(dc, 'dividend', foreignDiv)).toEqual({ scope: 'in_scope', source: 'foreign', review: null });
      expect(incomeResidencyScope(dc, 'dividend', gbDiv)).toEqual({ scope: 'in_scope', source: 'uk', review: null });
      expect(incomeResidencyScope(dc, 'dividend', unknownCompany)).toEqual({ scope: 'in_scope', source: 'unknown', review: null });
    }
  });
  test('non_resident and split_overseas_part: UK source in scope; foreign out of scope; unknown in scope + review', () => {
    for (const dc of ['non_resident', 'split_overseas_part'] as const) {
      expect(incomeResidencyScope(dc, 'dividend', gbDiv)).toEqual({ scope: 'in_scope', source: 'uk', review: null });
      expect(incomeResidencyScope(dc, 'dividend', ukResidentForeignIssuer)).toEqual({ scope: 'in_scope', source: 'uk', review: null });
      expect(incomeResidencyScope(dc, 'dividend', foreignDiv)).toEqual({ scope: 'out_of_scope', source: 'foreign', review: null });
      expect(incomeResidencyScope(dc, 'dividend', unknownCompany)).toEqual({ scope: 'in_scope', source: 'unknown', review: 'residency_source_unknown' });
      expect(incomeResidencyScope(dc, 'interest', { issuerCountry: 'US' })).toEqual({ scope: 'in_scope', source: 'unknown', review: 'residency_source_unknown' });
      expect(incomeResidencyScope(dc, 'interest', { foreignPayerBranchEvidence: true })).toEqual({ scope: 'out_of_scope', source: 'foreign', review: null });
      expect(incomeResidencyScope(dc, 'other', {})).toEqual({ scope: 'in_scope', source: 'unknown', review: 'residency_source_unknown' });
    }
  });
  test('needs_review, legacy: pre-d188 behaviour (no residency filter)', () => {
    expect(incomeResidencyScope('needs_review', 'dividend', foreignDiv, 'legacy')).toEqual({ scope: 'in_scope', source: 'foreign', review: null });
  });
  test('needs_review with a kept confirmed status: table applies; out-of-scope facts carry the visible marker', () => {
    expect(incomeResidencyScope('needs_review', 'dividend', foreignDiv, 'non_resident')).toEqual({ scope: 'out_of_scope', source: 'foreign', review: 'residency_under_review' });
    expect(incomeResidencyScope('needs_review', 'dividend', foreignDiv, 'split_overseas_part')).toEqual({ scope: 'out_of_scope', source: 'foreign', review: 'residency_under_review' });
    expect(incomeResidencyScope('needs_review', 'dividend', foreignDiv, 'resident')).toEqual({ scope: 'in_scope', source: 'foreign', review: null });
    expect(incomeResidencyScope('needs_review', 'dividend', unknownCompany, 'non_resident')).toEqual({ scope: 'in_scope', source: 'unknown', review: 'residency_source_unknown' });
  });
  test('needs_review unresolved (no effective class, NULL effective_status): nothing is excluded', () => {
    expect(incomeResidencyScope('needs_review', 'dividend', foreignDiv)).toEqual({ scope: 'in_scope', source: 'foreign', review: 'residency_under_review' });
    expect(incomeResidencyScope('needs_review', 'dividend', foreignDiv, null)).toEqual({ scope: 'in_scope', source: 'foreign', review: 'residency_under_review' });
  });
  test('an unknown date class fails closed: in scope with review', () => {
    expect(incomeResidencyScope('garbage' as never, 'dividend', foreignDiv)).toEqual({ scope: 'in_scope', source: 'foreign', review: 'residency_under_review' });
  });
  test('end to end with the classifier: the owner IRM dividend (US issuer, covered by a not_uk_resident range) in 2021-22', () => {
    const years = [year({ tax_year: '2021-22', status: 'non_resident' })];
    const rows: ResidencyIssuerResidence[] = [{
      id: '1', issuer_key: 'US46284V1017', valid_from: '2021-04-06', valid_to: '2022-04-05',
      answer: 'not_uk_resident', withdrawn: false, issuer_revision: 3,
    }];
    const d = classifyDateResidencyDetail('2021-12-15', years);
    const r = incomeResidencyScope(d.dateClass, 'dividend', {
      issuerCountry: 'US', companyResidence: issuerCompanyResidenceOn('US46284V1017', '2021-12-15', rows),
    }, d.effectiveClass);
    expect(r.scope).toBe('out_of_scope');
  });
});

describe('parseResidencyTaxYears: exact version pin, strictness, round trip', () => {
  const valid = (): ResidencyTaxYearsResponse => ({
    schema_version: RESIDENCY_TAX_YEARS_SCHEMA_VERSION,
    revision: 7,
    years: [
      year({ tax_year: '2021-22', status: 'non_resident' }),
      year({ tax_year: '2022-23', status: 'needs_review', review_reason: 'boundary', effective_status: 'legacy', tnr_candidate: true }),
      split('2023-24', 4, '2023-10-01', { provisional: true, provisional_until: '2024-09-30' }),
    ],
    history: { prior_uk_residence: 'never', declared_years: [], no_treaty_residence: null, declared_at: '2026-10-07T12:00:00Z' },
    s1a3_attestations: [
      { event_key: 'disposal:2022-10-05:ABC', event_kind: 'disposal', event_date: '2022-10-05', s1a3_chargeable: false, revision: 2, withdrawn: false, retired: false },
      { event_key: 'cash:2022-08-18:CA91', event_kind: 'corporate_action_cash', event_date: '2022-08-18', s1a3_chargeable: null, revision: 1, withdrawn: true, retired: false },
      { event_key: 'prospective:2022-11-01:X', event_kind: 'prospective_distribution', event_date: '2022-11-01', s1a3_chargeable: null, revision: 4, withdrawn: false, retired: true },
    ],
    issuer_residence: [
      { id: '1', issuer_key: 'US46284V1017', valid_from: '2021-04-06', valid_to: '2022-04-05', answer: 'not_uk_resident', withdrawn: false, issuer_revision: 3 },
      { id: '2', issuer_key: 'US46284V1017', valid_from: '2022-04-06', valid_to: '2023-03-05', answer: 'unknown', withdrawn: true, issuer_revision: 3 },
    ],
  });
  const mutate = (fn: (r: any) => void) => { const r: any = JSON.parse(JSON.stringify(valid())); fn(r); return r; };

  test('the version is 1.0.0 and the purpose is residency.read', () => {
    expect(RESIDENCY_TAX_YEARS_SCHEMA_VERSION).toBe('1.0.0');
    expect(RESIDENCY_READ_PURPOSE).toBe('residency.read');
  });
  test('round trip through JSON, tnr_candidate and every revision preserved', () => {
    const wire = JSON.parse(JSON.stringify(valid()));
    const parsed = parseResidencyTaxYears(wire);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual(valid());
      expect(parsed.value.years[1].tnr_candidate).toBe(true);
      expect(parsed.value.s1a3_attestations.map(a => a.revision)).toEqual([2, 1, 4]);
      expect(parsed.value.issuer_residence.every(r => r.issuer_revision === 3)).toBe(true);
    }
  });
  test('an empty residency (no data) is a valid response', () => {
    const r = mutate(x => { x.years = []; x.s1a3_attestations = []; x.issuer_residence = []; x.history = { prior_uk_residence: 'unknown', declared_years: [], no_treaty_residence: null, declared_at: null }; });
    expect(parseResidencyTaxYears(r).ok).toBe(true);
  });
  test('any other schema_version is refused (exact pin)', () => {
    for (const v of ['0.9.0', '1.0.1', '1.1.0', '2.0.0', 1, null, undefined]) {
      expect(parseResidencyTaxYears(mutate(x => { x.schema_version = v; })).ok).toBe(false);
    }
  });
  test('unknown or missing keys are refused at every level', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.extra = 1; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { delete x.revision; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[0].extra = 1; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { delete x.years[0].tnr_candidate; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.history.extra = 1; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].checklist = {}; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[0].extra = 1; })).ok).toBe(false);
    expect(parseResidencyTaxYears(null).ok).toBe(false);
    expect(parseResidencyTaxYears([]).ok).toBe(false);
  });
  test('year invariants: review_reason iff needs_review; effective_status only on needs_review', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.years[0].review_reason = 'boundary'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[1].review_reason = null; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[0].effective_status = 'resident'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[1].effective_status = 'bogus'; })).ok).toBe(false);
  });
  test('NULL effective_status on needs_review is tolerated on the wire (readers fail closed)', () => {
    const r = parseResidencyTaxYears(mutate(x => { x.years[1].effective_status = null; }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(classifyDateResidencyDetail('2022-10-01', r.value.years).effectiveClass).toBeNull();
  });
  test('split fields only where a split year is kept, and always consistent', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.years[0].split_case = 4; })).ok).toBe(false); // non-split with split fields
    expect(parseResidencyTaxYears(mutate(x => { x.years[2].uk_part_start = '2023-10-02'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[2].split_day = null; })).ok).toBe(false);
    // needs_review keeping a split year must carry the dates; one that falls back to resident must not
    const kept = mutate(x => {
      const s = x.years[2];
      x.years[1] = { ...x.years[1], effective_status: 'split_year', split_case: s.split_case, split_day: s.split_day, uk_part_start: s.uk_part_start, uk_part_end: s.uk_part_end };
      x.years[1].tax_year = '2023-24'; x.years.pop(); // keep ascending
      x.years[1].tax_year = '2023-24';
    });
    expect(parseResidencyTaxYears(kept).ok).toBe(true);
    expect(parseResidencyTaxYears(mutate(x => { x.years[1].effective_status = 'split_year'; })).ok).toBe(false);
  });
  test('provisional_until iff provisional', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.years[2].provisional_until = null; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[0].provisional_until = '2024-01-01'; })).ok).toBe(false);
  });
  test('years must be strictly ascending and unique; revisions non-negative integers', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.years.reverse(); })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[1].tax_year = '2021-22'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[0].revision = -1; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.revision = 1.5; })).ok).toBe(false);
  });
  test('history: declared_years only with declared_years; no_treaty_residence true|null; timestamp valid', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.history.declared_years = ['2019-20']; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.history.prior_uk_residence = 'declared_years'; x.history.declared_years = ['2019-20', '2018-19']; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.history.prior_uk_residence = 'declared_years'; x.history.declared_years = ['2018-19', '2019-20']; })).ok).toBe(true);
    expect(parseResidencyTaxYears(mutate(x => { x.history.no_treaty_residence = false; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.history.no_treaty_residence = true; })).ok).toBe(true);
    expect(parseResidencyTaxYears(mutate(x => { x.history.declared_at = 'yesterday'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.history.prior_uk_residence = 'sometimes'; })).ok).toBe(false);
  });
  test('attestations: vocab, unique event_key, boolean|null answer, both flags distinct', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].event_kind = 'sale'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].s1a3_chargeable = 'unknown'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[1].event_key = x.s1a3_attestations[0].event_key; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].retired = undefined; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].event_date = '2022-13-01'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].event_key = ''; })).ok).toBe(false);
  });
  test('d188 fix round: inconsistent shapes and malformed values fail closed', () => {
    // 1: expired provisional cannot keep a split year; a kept split on another reason still parses
    const kept = split('2023-24', 4, '2023-10-01', { status: 'needs_review', review_reason: 'provisional_expired', effective_status: 'split_year' });
    expect(parseResidencyTaxYears(mutate(x => { x.years[2] = kept; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[2] = { ...kept, review_reason: 'dependency_changed' }; })).ok).toBe(true);
    // 2: empty years only for the empty-default response
    const empty = () => mutate(x => { x.years = []; x.s1a3_attestations = []; x.issuer_residence = []; x.history = { prior_uk_residence: 'unknown', declared_years: [], no_treaty_residence: null, declared_at: null }; });
    expect(parseResidencyTaxYears(empty()).ok).toBe(true);
    expect(parseResidencyTaxYears(Object.assign(empty(), { history: { prior_uk_residence: 'never', declared_years: [], no_treaty_residence: null, declared_at: null } })).ok).toBe(false);
    expect(parseResidencyTaxYears(Object.assign(empty(), { history: { prior_uk_residence: 'unknown', declared_years: [], no_treaty_residence: null, declared_at: '2026-10-07T12:00:00Z' } })).ok).toBe(false);
    expect(parseResidencyTaxYears(Object.assign(empty(), { history: { prior_uk_residence: 'unknown', declared_years: [], no_treaty_residence: true, declared_at: null } })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years = []; })).ok).toBe(false);
    expect(parseResidencyTaxYears(Object.assign(empty(), { issuer_residence: valid().issuer_residence })).ok).toBe(false);
    // 3: a live attestation in a resident year / UK part is refused; a retired one is kept as evidence
    const att = (date: string, over: object = {}) => ({ event_key: 'k', event_kind: 'disposal', event_date: date, s1a3_chargeable: false, revision: 1, withdrawn: false, retired: false, ...over });
    expect(parseResidencyTaxYears(mutate(x => { x.years[0] = year({ tax_year: '2021-22' }); x.s1a3_attestations = [att('2021-10-05')]; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations = [att('2023-12-01')]; })).ok).toBe(false); // UK part of the 2023-24 Case 4 split
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations = [att('2023-07-01')]; })).ok).toBe(true); // overseas part
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations = [att('2021-10-05')]; })).ok).toBe(true); // non_resident year
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations = [att('2023-12-01', { retired: true })]; })).ok).toBe(true);
    // 5: declared_at must be a string or null
    expect(parseResidencyTaxYears(mutate(x => { x.history.declared_at = ['2026-10-07T12:00:00Z']; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.history.declared_at = 20261007; })).ok).toBe(false);
    // 6: dates are strict YYYY-MM-DD
    expect(parseResidencyTaxYears(mutate(x => { x.s1a3_attestations[0].event_date = '2022-10-05T14:30:00Z'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[2].split_day = '2023-10-01T00:00:00Z'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.years[2].provisional_until = '2024-09-30T00:00:00Z'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[0].valid_from = '2021-04-06T00:00:00Z'; })).ok).toBe(false);
  });
  test('issuer ranges: ISIN, ordered range, overlap of live ranges refused, withdrawn overlap allowed, one revision per issuer', () => {
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[0].issuer_key = 'us46284v1017'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[0].valid_to = '2020-01-01'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[1].withdrawn = false; x.issuer_residence[1].valid_from = '2022-04-05'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[1].valid_from = '2021-06-01'; })).ok).toBe(true); // withdrawn: audit only
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[1].issuer_revision = 4; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[1].id = '1'; })).ok).toBe(false);
    expect(parseResidencyTaxYears(mutate(x => { x.issuer_residence[1].issuer_key = 'SGXC37098255'; x.issuer_residence[1].issuer_revision = 9; })).ok).toBe(true);
  });
});

describe('residency.read purpose (design §5.2; AUTHORIZATION_MODEL §4, INGRESS_AND_BFF_TOPOLOGY §4.2a)', () => {
  test('is a token purpose allowed on service_handshake ONLY', () => {
    expect((TOKEN_PURPOSES as readonly string[]).includes('residency.read')).toBe(true);
    expect(isPurposeAllowedForClass('service_handshake', 'residency.read')).toBe(true);
    for (const cls of TOKEN_CLASSES) {
      if (cls === 'service_handshake') continue;
      expect((TOKEN_CLASS_PURPOSE_MATRIX[cls] as readonly string[]).includes('residency.read')).toBe(false);
      expect(isPurposeAllowedForClass(cls, 'residency.read')).toBe(false);
    }
  });
  test('no other purpose is widened to reach it, and it is distinct from broker_facts.read', () => {
    expect(isPurposeAllowedForClass('service_principal', 'residency.read')).toBe(false);
    expect(isPurposeAllowedForClass('browser_session', 'residency.read')).toBe(false);
    expect(isPurposeAllowedForClass('service_handshake', 'broker_facts.read')).toBe(true);
    expect(RESIDENCY_READ_PURPOSE).not.toBe('broker_facts.read');
  });
  test('the owner-bound PDP action is registered (extend, do not fork the vocabulary)', () => {
    expect((PERMISSION_ACTIONS as readonly string[]).includes('cgt.residency.read')).toBe(true);
  });
  test('the exchange provenance claim is permitted only in the closed service vocabulary', () => {
    expect(findForbiddenViaClaim({ via: 'svc-income-app' }, RESIDENCY_READ_PURPOSE)).toBeNull();
    expect(findForbiddenViaClaim({ via: 'evil' }, RESIDENCY_READ_PURPOSE)).toBe('via');
    expect(findForbiddenViaClaim({ via: 'svc-income-app' }, 'residency.write')).toBe('via');
  });
});

describe('d188 fix round: ISO country, strict dates, never throws', () => {
  test('an unassigned issuer country is an unknown source, never out_of_scope', () => {
    expect(residencyIncomeSource('dividend', { issuerCountry: 'ZZ', companyResidence: 'not_uk_resident' })).toBe('unknown');
    expect(residencyIncomeSource('dividend', { issuerCountry: 'us', companyResidence: 'not_uk_resident' })).toBe('foreign');
    expect(residencyIncomeSource('dividend', { issuerCountry: 'GB' })).toBe('uk');
    const r = incomeResidencyScope('non_resident', 'dividend', { issuerCountry: 'ZZ', companyResidence: 'not_uk_resident' });
    expect(r).toEqual({ scope: 'in_scope', source: 'unknown', review: 'residency_source_unknown' });
  });
  test('timestamp / malformed dates classify needs_review on the boundary day and never throw', () => {
    const years = [split('2024-25', 1, '2024-10-06')]; // UK part 2024-04-06 .. 2024-10-05
    expect(classifyDateResidency('2024-10-05', years)).toBe('split_uk_part');
    expect(classifyDateResidency('2024-10-05T14:30:00Z', years)).toBe('needs_review');
    expect(classifyDateResidency('2024-10-05 ', years)).toBe('needs_review');
    expect(classifyDateResidency('2024-02-30', years)).toBe('needs_review');
    expect(classifyDateResidency(undefined as never, years)).toBe('needs_review');
    expect(splitDatesFromSplitDay(1, '2024-10-06T00:00:00Z', '2024-25')).toBeNull();
    const bad = year({ tax_year: '2024-25', status: 'split_year', split_case: 1, split_day: '2024-10-06T00:00:00Z', uk_part_start: '2024-04-06', uk_part_end: '2024-10-05' });
    expect(() => classifyDateResidency('2024-10-05', [bad])).not.toThrow();
    expect(classifyDateResidency('2024-10-05', [bad])).toBe('needs_review');
    expect(issuerCompanyResidenceOn('US46284V1017', '2024-10-05T00:00:00Z', [])).toBe('unknown');
  });
});
