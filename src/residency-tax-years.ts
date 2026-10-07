/**
 * d188 (0.9.x-d188-srt-residency) — per-tax-year UK residency contract `residency-tax-years` 1.0.0, and the two shared
 * pure functions both apps import so cgt-app and income-app can never classify a date differently:
 * `classifyDateResidency` (design §3.3 rule 4) and `incomeResidencyScope` (design §5.0).
 *
 * Producer: cgt-app (`GET /api/residency/years`, moving to person-core at PCORE Stage 2 with no consumer change).
 * Consumer: income-app, over the private gateway exchange with the actor-bound purpose `residency.read`.
 * Consumers accept exactly one `schema_version` and reject unknown keys (lockstep, like the broker-facts feed).
 *
 * Everything here is pure and FAILS CLOSED: a malformed, ambiguous or missing year is `needs_review`, an unknown
 * attestation reads `unknown`, an unknown company residence reads `unknown`. Nothing here decides eligibility for a
 * residence test, a split-year Case, temporary non-residence or s.1A(3): those are recorded determinations
 * (design §0, §4.3, §7) and the temporary-non-residence detection stays in cgt-app.
 *
 * Consumers MUST classify through {@link classifyDateResidencyDetail}, not the bare {@link classifyDateResidency}:
 * only the detail carries `tnrCandidate` (design §7), and the bare classifier would drop it. `incomeResidencyScope`
 * returns `out_of_scope` for a non-resident date even when its year is a `tnr_candidate`; that is correct only
 * because step 0 / RX1 refuse a `tnr_candidate` year before any scope answer is used. Do not call it as a gate.
 *
 * Dates are strict `YYYY-MM-DD` calendar dates everywhere (a timestamp is malformed, never truncated); a malformed
 * date classifies as `needs_review` and never throws.
 */
import { isUkTaxYearLabel, normalizeBrokerFactsTimestamp, ukTaxYearLabelOfDate } from './broker-facts-feed';

export const RESIDENCY_TAX_YEARS_SCHEMA_VERSION = '1.0.0' as const;
/** The actor-bound purpose for the read (same shape as `broker_facts.read`); also registered in `auth.ts`. */
export const RESIDENCY_READ_PURPOSE = 'residency.read' as const;
export const RESIDENCY_TAX_YEARS_PATH = '/api/residency/years' as const;

// ---------------------------------------------------------------------------
// Vocabularies (design §3.1, §3.2, §3.4, §5.0)
// ---------------------------------------------------------------------------

export const RESIDENCY_YEAR_STATUSES = ['resident', 'non_resident', 'split_year', 'needs_review'] as const;
export type ResidencyYearStatus = (typeof RESIDENCY_YEAR_STATUSES)[number];

export const RESIDENCY_REVIEW_REASONS = [
  'not_assessed',
  'boundary',
  'migrated_split_unconfirmed',
  'dependency_changed',
  'provisional_expired',
  'consult_accountant',
] as const;
export type ResidencyReviewReason = (typeof RESIDENCY_REVIEW_REASONS)[number];

/** `legacy` = each consumer's pre-d188 behaviour (design §5.4); otherwise the previous confirmed status. */
export const RESIDENCY_EFFECTIVE_STATUSES = ['legacy', 'resident', 'non_resident', 'split_year'] as const;
export type ResidencyEffectiveStatus = (typeof RESIDENCY_EFFECTIVE_STATUSES)[number];

export const RESIDENCY_ACCOUNTANT_CHECKS = ['not_requested', 'requested', 'confirmed_by_accountant'] as const;
export type ResidencyAccountantCheck = (typeof RESIDENCY_ACCOUNTANT_CHECKS)[number];

export const RESIDENCY_PRIOR_UK_RESIDENCE = ['never', 'always_uk', 'declared_years', 'unknown'] as const;
export type ResidencyPriorUkResidence = (typeof RESIDENCY_PRIOR_UK_RESIDENCE)[number];

export const S1A3_EVENT_KINDS = [
  'disposal',
  'capital_distribution_s122_1',
  'corporate_action_cash',
  'prospective_distribution',
] as const;
export type S1a3EventKind = (typeof S1A3_EVENT_KINDS)[number];

export const ISSUER_RESIDENCE_ANSWERS = ['not_uk_resident', 'uk_resident', 'unknown'] as const;
export type IssuerResidenceAnswer = (typeof ISSUER_RESIDENCE_ANSWERS)[number];

/** Split-year Cases 1-3 are departure Cases, 4-8 arrival Cases (FA 2013 Sch 45 paras 44-51). */
export const RESIDENCY_SPLIT_CASES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type ResidencySplitCase = (typeof RESIDENCY_SPLIT_CASES)[number];

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

export interface ResidencyTaxYear {
  /** `'YYYY-YY'` (`isUkTaxYearLabel`). Unique in a response. */
  tax_year: string;
  status: ResidencyYearStatus;
  /** Non-null if and only if `status = needs_review`. */
  review_reason: ResidencyReviewReason | null;
  /**
   * Non-null when `status = needs_review` (the producer's CHECK). A reader that is nevertheless given `null` there
   * treats the year as unresolved (fail closed). Always `null` for any other status.
   */
  effective_status: ResidencyEffectiveStatus | null;
  /** Derived by cgt-app's temporary-non-residence detection (design §7), never user-writable. Consumers must read it. */
  tnr_candidate: boolean;
  /** Bumped on every change of the year, including a `tnr_candidate` change. Releases bind it. */
  revision: number;
  split_case: ResidencySplitCase | null;
  /** The statutory day exactly as FA 2013 Sch 45 para 53 words it for the Case (design §4.3). */
  split_day: string | null;
  /** Derived from `split_day` by {@link splitDatesFromSplitDay}, never independent. */
  uk_part_start: string | null;
  uk_part_end: string | null;
  provisional: boolean;
  /** The date the relied-on year or statutory period ends; non-null if and only if `provisional`. */
  provisional_until: string | null;
  accountant_check: ResidencyAccountantCheck;
}

export interface ResidencyHistory {
  prior_uk_residence: ResidencyPriorUkResidence;
  /** Sole-UK-resident years of a `declared_years` answer; empty for every other answer. Strictly ascending. */
  declared_years: string[];
  /** `true` only on an explicit user answer; `null` = not answered (never set by migration). */
  no_treaty_residence: true | null;
  declared_at: string | null;
}

export interface ResidencyS1a3Attestation {
  /** Identifies the event (kind, date, instrument or corporate-action reference). Holds no broker account id. */
  event_key: string;
  event_kind: S1a3EventKind;
  event_date: string;
  /** `true` / `false` / `null` (= unknown, the default). Read it ONLY through {@link readS1a3Attestation}. */
  s1a3_chargeable: boolean | null;
  /** Its own revision (doc43 D2): changes on every correction, withdrawal, retirement and un-retirement. */
  revision: number;
  /** `withdrawn_at` set. A withdrawn row that is not retired reads `unknown`. */
  withdrawn: boolean;
  /** `retired_reason` set (G-W state change). A retired row is not-gating and is never read as `unknown`. */
  retired: boolean;
}

export interface ResidencyIssuerResidence {
  id: string;
  /** The ISIN of the instrument that paid the dividend. A successor ISIN is its own issuer. */
  issuer_key: string;
  valid_from: string;
  valid_to: string;
  answer: IssuerResidenceAnswer;
  withdrawn: boolean;
  /** The per-issuer counter: the same value on every row of the issuer, bumped on every insert/withdraw/edit. */
  issuer_revision: number;
}

export interface ResidencyTaxYearsResponse {
  schema_version: typeof RESIDENCY_TAX_YEARS_SCHEMA_VERSION;
  /** Contract revision; bound into the consumer's projection run identity. */
  revision: number;
  /** Strictly ascending by `tax_year`. */
  years: ResidencyTaxYear[];
  history: ResidencyHistory;
  s1a3_attestations: ResidencyS1a3Attestation[];
  issuer_residence: ResidencyIssuerResidence[];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ukTaxYearLabelOfDate(value) !== null;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d + days); // Date.UTC would map years 0-99 to 19xx
  return t.toISOString().slice(0, 10);
}

/** ISO 3166-1 alpha-2 officially assigned codes. An unassigned pair (e.g. 'ZZ') is not an issuer country. */
const ISO_3166_ALPHA2 = new Set(
  ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO ' +
    'JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR ' +
    'MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO ' +
    'RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV ' +
    'TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '),
);

/** `[6 April, 5 April]` of a tax-year label, or `null` for a malformed label. */
export function ukTaxYearBounds(taxYear: string): { start: string; end: string } | null {
  if (!isUkTaxYearLabel(taxYear)) return null;
  const startYear = Number(taxYear.slice(0, 4));
  const pad = (n: number) => String(n).padStart(4, '0');
  return { start: `${pad(startYear)}-04-06`, end: `${pad(startYear + 1)}-04-05` };
}

const isDepartureCase = (c: number) => c >= 1 && c <= 3;

/**
 * The stored UK-part dates from the recorded `split_day` (design §4.3 "Stored dates from `split_day`"):
 * - Cases 1-3: `split_day` is the first day of the OVERSEAS part (para 53(2)-(4)): UK part 6 April .. `split_day` - 1.
 * - Cases 4, 5, 7, 8: `split_day` is the first day of the UK part (para 53(5), (6), (8), (9)): `split_day` .. 5 April.
 * - Case 6: `split_day` is the LAST day of the overseas part (para 53(7)): `split_day` + 1 .. 5 April.
 *
 * `null` when `split_day` is outside the year or when either part would be empty (a single-day UK part is valid; an
 * overseas part with no day would be a whole resident year with a Case label).
 */
export function splitDatesFromSplitDay(
  splitCase: number,
  splitDay: string,
  taxYear: string,
): { uk_part_start: string; uk_part_end: string } | null {
  const bounds = ukTaxYearBounds(taxYear);
  if (bounds === null || !isIsoDate(splitDay) || !(RESIDENCY_SPLIT_CASES as readonly number[]).includes(splitCase)) {
    return null;
  }
  if (splitDay < bounds.start || splitDay > bounds.end) return null;
  let start: string;
  let end: string;
  if (isDepartureCase(splitCase)) {
    start = bounds.start;
    end = addDays(splitDay, -1);
  } else if (splitCase === 6) {
    start = addDays(splitDay, 1);
    end = bounds.end;
  } else {
    start = splitDay;
    end = bounds.end;
  }
  if (start > end) return null; // UK part empty
  // Departure: overseas part is (end, year end]; arrival: overseas part is [year start, start).
  if (isDepartureCase(splitCase) ? end >= bounds.end : start <= bounds.start) return null;
  return { uk_part_start: start, uk_part_end: end };
}

type SplitFields = Pick<ResidencyTaxYear, 'tax_year' | 'split_case' | 'split_day' | 'uk_part_start' | 'uk_part_end'>;

/** True only when the year's four split fields are present and the stored dates are exactly the derived ones. */
export function isResidencySplitShapeValid(year: SplitFields): boolean {
  if (year.split_case === null || year.split_day === null || year.uk_part_start === null || year.uk_part_end === null) {
    return false;
  }
  const derived = splitDatesFromSplitDay(year.split_case, year.split_day, year.tax_year);
  return derived !== null && derived.uk_part_start === year.uk_part_start && derived.uk_part_end === year.uk_part_end;
}

// ---------------------------------------------------------------------------
// classifyDateResidency
// ---------------------------------------------------------------------------

export type DateResidencyClass =
  | 'resident'
  | 'non_resident'
  | 'split_uk_part'
  | 'split_overseas_part'
  | 'needs_review';

export type ConfirmedDateResidencyClass = Exclude<DateResidencyClass, 'needs_review'>;

export interface DateResidencyDetail {
  dateClass: DateResidencyClass;
  /** The tax year of the date, `null` for an invalid date. */
  taxYear: string | null;
  /** The year's flag (design §7); `false` when there is no usable year row. Every consumer must read it. */
  tnrCandidate: boolean;
  reviewReason: ResidencyReviewReason | null;
  /** The year row's `effective_status` when `dateClass = needs_review` and a row exists, else `null`. */
  effectiveStatus: ResidencyEffectiveStatus | null;
  /**
   * For `needs_review` only: what the kept status would place this date in. `'legacy'` = pre-d188 consumer
   * behaviour (design §5.4). `null` = unresolved: no row, NULL/unknown `effective_status`, or a kept split year whose
   * dates do not hold (design §3.1: nothing is excluded, CGT holds, filing refuses).
   */
  effectiveClass: ConfirmedDateResidencyClass | 'legacy' | null;
}

const UNRESOLVED: Omit<DateResidencyDetail, 'taxYear'> = {
  dateClass: 'needs_review',
  tnrCandidate: false,
  reviewReason: null,
  effectiveStatus: null,
  effectiveClass: null,
};

function splitPartOf(year: ResidencyTaxYear, date: string): 'split_uk_part' | 'split_overseas_part' | null {
  if (!isResidencySplitShapeValid(year)) return null;
  // Both ends are inclusive: the UK part is [uk_part_start, uk_part_end]; the rest of the year is the overseas part.
  return date >= (year.uk_part_start as string) && date <= (year.uk_part_end as string)
    ? 'split_uk_part'
    : 'split_overseas_part';
}

/**
 * The date class with the supporting facts a consumer needs (the review reason, the kept effective status and the
 * temporary-non-residence flag). {@link classifyDateResidency} is this function's `dateClass`.
 *
 * No `years` at all means the user has no residency data: every date is `resident`, as before d188 (design §3.3 rule 1).
 * Once there is any year row, a date in a year without a row is `needs_review` (`not_assessed`). Every malformed,
 * duplicated or inconsistent input is `needs_review`: this function never guesses a status.
 */
export function classifyDateResidencyDetail(
  date: string,
  years: readonly ResidencyTaxYear[],
): DateResidencyDetail {
  const taxYear = ukTaxYearLabelOfDate(date);
  if (taxYear === null || !Array.isArray(years)) return { ...UNRESOLVED, taxYear };
  if (years.length === 0) {
    return { ...UNRESOLVED, dateClass: 'resident', taxYear };
  }
  const rows = years.filter(y => y !== null && typeof y === 'object' && y.tax_year === taxYear);
  if (rows.length === 0) return { ...UNRESOLVED, taxYear, reviewReason: 'not_assessed' };
  if (rows.length > 1) return { ...UNRESOLVED, taxYear };
  const year = rows[0];
  const tnrCandidate = year.tnr_candidate === true;
  const base = { taxYear, tnrCandidate, reviewReason: null, effectiveStatus: null, effectiveClass: null } as const;

  switch (year.status) {
    case 'resident':
      return { ...base, dateClass: 'resident' };
    case 'non_resident':
      return { ...base, dateClass: 'non_resident' };
    case 'split_year': {
      const part = splitPartOf(year, date);
      return part === null ? { ...base, dateClass: 'needs_review' } : { ...base, dateClass: part };
    }
    case 'needs_review': {
      const reviewReason = (RESIDENCY_REVIEW_REASONS as readonly string[]).includes(year.review_reason as string)
        ? (year.review_reason as ResidencyReviewReason)
        : null;
      const effectiveStatus = (RESIDENCY_EFFECTIVE_STATUSES as readonly string[]).includes(year.effective_status as string)
        ? (year.effective_status as ResidencyEffectiveStatus)
        : null;
      let effectiveClass: DateResidencyDetail['effectiveClass'] = null;
      if (effectiveStatus === 'legacy') effectiveClass = 'legacy';
      else if (effectiveStatus === 'resident') effectiveClass = 'resident';
      else if (effectiveStatus === 'non_resident') effectiveClass = 'non_resident';
      else if (effectiveStatus === 'split_year') effectiveClass = splitPartOf(year, date);
      return { ...base, dateClass: 'needs_review', reviewReason, effectiveStatus, effectiveClass };
    }
    default:
      return { ...base, dateClass: 'needs_review' };
  }
}

/** The one date classifier both apps use (design §3.3 rule 4). Fail closed to `needs_review`. */
export function classifyDateResidency(date: string, years: readonly ResidencyTaxYear[]): DateResidencyClass {
  return classifyDateResidencyDetail(date, years).dateClass;
}

// ---------------------------------------------------------------------------
// Attestations and issuer answers: how a row is read
// ---------------------------------------------------------------------------

export type S1a3Reading = 'true' | 'false' | 'unknown' | 'not_gating';

/**
 * How a consumer reads one s.1A(3) attestation (design §3.4 rule 2): `retired` means not-gating (neither the item nor
 * the year holds on it, and it is never read as `unknown`); a withdrawn row that is not retired reads `unknown`; an
 * absent or non-boolean answer or flag reads `unknown`. Only an explicit `true` / `false` on a live row is an answer.
 */
export function readS1a3Attestation(
  attestation: Pick<ResidencyS1a3Attestation, 's1a3_chargeable' | 'withdrawn' | 'retired'>,
): S1a3Reading {
  // An absent or non-boolean flag is malformed: fail closed to unknown before anything is read as an answer.
  if (typeof attestation.retired !== 'boolean' || typeof attestation.withdrawn !== 'boolean') return 'unknown';
  if (attestation.retired) return 'not_gating';
  if (attestation.withdrawn) return 'unknown';
  if (attestation.s1a3_chargeable === true) return 'true';
  if (attestation.s1a3_chargeable === false) return 'false';
  return 'unknown';
}

/**
 * The company-residence answer covering `date` for `issuerKey` (design §5.0). Withdrawn rows are ignored. No covering
 * range is `unknown` (the default for every date no range covers). Two non-withdrawn covering rows that disagree
 * (the producer forbids overlap, so this is a defect) are `unknown`: fail closed.
 */
export function issuerCompanyResidenceOn(
  issuerKey: string,
  date: string,
  issuerResidence: readonly ResidencyIssuerResidence[],
): IssuerResidenceAnswer {
  if (!isIsoDate(date)) return 'unknown';
  const answers = new Set<IssuerResidenceAnswer>();
  for (const row of issuerResidence) {
    if (row.issuer_key !== issuerKey || row.withdrawn !== false) continue;
    if (!isIsoDate(row.valid_from) || !isIsoDate(row.valid_to)) continue;
    if (date < row.valid_from || date > row.valid_to) continue;
    answers.add((ISSUER_RESIDENCE_ANSWERS as readonly string[]).includes(row.answer) ? row.answer : 'unknown');
  }
  return answers.size === 1 ? [...answers][0] : 'unknown';
}

// ---------------------------------------------------------------------------
// incomeResidencyScope (design §5.0)
// ---------------------------------------------------------------------------

export type ResidencyIncomeType = 'dividend' | 'interest' | 'other';
export type ResidencyIncomeSource = 'uk' | 'foreign' | 'unknown';
export type ResidencyIncomeScope = 'in_scope' | 'out_of_scope';
/**
 * `residency_source_unknown`: in scope, source not evidenced as foreign on a non-resident date.
 * `residency_under_review`: the year is `needs_review` and the answer is not a plain resident/legacy one: either the
 * fact is listed as outside UK scope under the kept status (a visible marker), or the year is unresolved.
 */
export type ResidencyIncomeReview = 'residency_source_unknown' | 'residency_under_review';

export interface ResidencyIncomeSourceEvidence {
  /** ISO 3166 alpha-2 issuer/payer country; `null`/absent = unknown. */
  issuerCountry?: string | null;
  /** For a dividend: the dated-range company-residence answer covering the date ({@link issuerCompanyResidenceOn}). */
  companyResidence?: IssuerResidenceAnswer | null;
  /** For interest: recorded payer-and-branch evidence that the interest is foreign-source (SAIM9095). */
  foreignPayerBranchEvidence?: boolean;
}

export interface ResidencyIncomeScopeResult {
  scope: ResidencyIncomeScope;
  source: ResidencyIncomeSource;
  review: ResidencyIncomeReview | null;
}

/** Positive evidence of source only; currency and issuer country alone are never enough for a dividend. */
export function residencyIncomeSource(
  incomeType: ResidencyIncomeType,
  evidence: ResidencyIncomeSourceEvidence,
): ResidencyIncomeSource {
  if (incomeType === 'dividend') {
    const country = typeof evidence.issuerCountry === 'string' ? evidence.issuerCountry.trim().toUpperCase() : '';
    if (!ISO_3166_ALPHA2.has(country)) return 'unknown'; // not an assigned ISO 3166-1 code: unknown source
    if (country === 'GB') return 'uk';
    // Non-GB issuer: the issuer country is not the company residence (ITTOIA 2005 s.383(1) / s.402(1)).
    if (evidence.companyResidence === 'not_uk_resident') return 'foreign';
    if (evidence.companyResidence === 'uk_resident') return 'uk';
    return 'unknown';
  }
  if (incomeType === 'interest') {
    // Payer country alone is not enough: a foreign company's UK branch can pay UK-source interest (SAIM9095).
    return evidence.foreignPayerBranchEvidence === true ? 'foreign' : 'unknown';
  }
  return 'unknown';
}

function scopeForConfirmedClass(
  dateClass: ConfirmedDateResidencyClass,
  source: ResidencyIncomeSource,
): ResidencyIncomeScopeResult {
  if (dateClass === 'resident' || dateClass === 'split_uk_part') {
    return { scope: 'in_scope', source, review: null };
  }
  if (source === 'foreign') return { scope: 'out_of_scope', source, review: null };
  return { scope: 'in_scope', source, review: source === 'unknown' ? 'residency_source_unknown' : null };
}

/**
 * The one income rule for both apps (design §5.0): a date in a `non_resident` year or an overseas part is out of UK
 * scope ONLY with positive evidence of foreign source. UK-source and unknown-source income stays in scope (unknown
 * with review `residency_source_unknown`).
 *
 * `needs_review`: pass `effectiveClass` from {@link classifyDateResidencyDetail}.
 * - `'legacy'`: pre-d188 consumer behaviour, no residency filter: in scope (the step 0 refusal is the consumer's).
 * - a confirmed class: the table applies, and a fact placed out of scope carries the `residency_under_review` marker.
 * - missing/`null` (an unresolved year, a NULL `effective_status`): nothing is excluded, in scope with
 *   `residency_under_review`.
 * A bare `needs_review` with no `effectiveClass` is therefore the fail-closed unresolved case.
 */
export function incomeResidencyScope(
  dateClass: DateResidencyClass,
  incomeType: ResidencyIncomeType,
  sourceEvidence: ResidencyIncomeSourceEvidence,
  effectiveClass?: DateResidencyDetail['effectiveClass'],
): ResidencyIncomeScopeResult {
  const source = residencyIncomeSource(incomeType, sourceEvidence ?? {});
  switch (dateClass) {
    case 'resident':
    case 'split_uk_part':
    case 'non_resident':
    case 'split_overseas_part':
      return scopeForConfirmedClass(dateClass, source);
    case 'needs_review': {
      if (effectiveClass === 'legacy') return { scope: 'in_scope', source, review: null };
      if (
        effectiveClass === 'resident' || effectiveClass === 'non_resident' ||
        effectiveClass === 'split_uk_part' || effectiveClass === 'split_overseas_part'
      ) {
        const kept = scopeForConfirmedClass(effectiveClass, source);
        return kept.scope === 'out_of_scope' ? { ...kept, review: 'residency_under_review' } : kept;
      }
      return { scope: 'in_scope', source, review: 'residency_under_review' };
    }
    default:
      // An unknown date class is unresolved: nothing excluded.
      return { scope: 'in_scope', source, review: 'residency_under_review' };
  }
}

// ---------------------------------------------------------------------------
// Strict parser (consumers accept exactly one version, reject unknown keys, fail closed)
// ---------------------------------------------------------------------------

export type ParseResidencyTaxYearsResult =
  | { ok: true; value: ResidencyTaxYearsResponse }
  | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isRevision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isOneOf = <T extends string | number>(set: readonly T[], v: unknown): v is T => set.includes(v as T);

function exactKeys(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(obj, k));
}

const YEAR_KEYS = [
  'tax_year', 'status', 'review_reason', 'effective_status', 'tnr_candidate', 'revision', 'split_case', 'split_day',
  'uk_part_start', 'uk_part_end', 'provisional', 'provisional_until', 'accountant_check',
] as const;
const HISTORY_KEYS = ['prior_uk_residence', 'declared_years', 'no_treaty_residence', 'declared_at'] as const;
const ATTESTATION_KEYS = [
  'event_key', 'event_kind', 'event_date', 's1a3_chargeable', 'revision', 'withdrawn', 'retired',
] as const;
const ISSUER_KEYS = [
  'id', 'issuer_key', 'valid_from', 'valid_to', 'answer', 'withdrawn', 'issuer_revision',
] as const;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function yearError(y: unknown): string | null {
  if (!isObject(y) || !exactKeys(y, YEAR_KEYS)) return 'year: not an object with exactly the contract keys';
  const year = y as unknown as ResidencyTaxYear;
  if (!isUkTaxYearLabel(year.tax_year)) return 'year: bad tax_year';
  const at = `year ${year.tax_year}`;
  if (!isOneOf(RESIDENCY_YEAR_STATUSES, year.status)) return `${at}: bad status`;
  if (!isRevision(year.revision)) return `${at}: bad revision`;
  if (typeof year.tnr_candidate !== 'boolean' || typeof year.provisional !== 'boolean') return `${at}: bad boolean`;
  if (!isOneOf(RESIDENCY_ACCOUNTANT_CHECKS, year.accountant_check)) return `${at}: bad accountant_check`;
  const review = year.status === 'needs_review';
  if (review !== (year.review_reason !== null) || (review && !isOneOf(RESIDENCY_REVIEW_REASONS, year.review_reason))) {
    return `${at}: review_reason must be set exactly when needs_review`;
  }
  if (review) {
    // NULL is tolerated on the wire (readers fail closed on it); any other value must be in the vocabulary.
    if (year.effective_status !== null && !isOneOf(RESIDENCY_EFFECTIVE_STATUSES, year.effective_status)) {
      return `${at}: bad effective_status`;
    }
    // Design §3.1: an expired provisional falls back to resident with NULL split fields (not a kept split year).
    // Only `resident` (or NULL, which readers fail closed on) is valid: Case 5 needs Part 1 residence (para 43(1)(a)).
    if (year.review_reason === 'provisional_expired' && year.effective_status !== null && year.effective_status !== 'resident') {
      return `${at}: provisional_expired falls back to resident`;
    }
  } else if (year.effective_status !== null) {
    return `${at}: effective_status only on needs_review`;
  }
  const hasSplit = year.status === 'split_year' || (review && year.effective_status === 'split_year');
  const splitNull = [year.split_case, year.split_day, year.uk_part_start, year.uk_part_end].every(v => v === null);
  if (hasSplit ? !isResidencySplitShapeValid(year) : !splitNull) {
    return `${at}: split fields must be present and consistent exactly for a split year`;
  }
  if (year.provisional ? !isIsoDate(year.provisional_until) : year.provisional_until !== null) {
    return `${at}: provisional_until must be set exactly when provisional`;
  }
  return null;
}

function historyError(h: unknown): string | null {
  if (!isObject(h) || !exactKeys(h, HISTORY_KEYS)) return 'history: not an object with exactly the contract keys';
  const history = h as unknown as ResidencyHistory;
  if (!isOneOf(RESIDENCY_PRIOR_UK_RESIDENCE, history.prior_uk_residence)) return 'history: bad prior_uk_residence';
  if (!Array.isArray(history.declared_years) || !history.declared_years.every(isUkTaxYearLabel) ||
    !history.declared_years.every((l, i, a) => i === 0 || a[i - 1] < l)) return 'history: bad declared_years';
  if (history.prior_uk_residence !== 'declared_years' && history.declared_years.length > 0) {
    return 'history: declared_years only with prior_uk_residence = declared_years';
  }
  if (history.no_treaty_residence !== true && history.no_treaty_residence !== null) return 'history: bad no_treaty_residence';
  if (history.declared_at !== null &&
    (typeof history.declared_at !== 'string' || normalizeBrokerFactsTimestamp(history.declared_at) === null)) {
    return 'history: bad declared_at';
  }
  return null;
}

function attestationError(a: unknown): string | null {
  if (!isObject(a) || !exactKeys(a, ATTESTATION_KEYS)) return 'attestation: not an object with exactly the contract keys';
  const att = a as unknown as ResidencyS1a3Attestation;
  if (typeof att.event_key !== 'string' || att.event_key.length === 0 || att.event_key.length > 256) return 'attestation: bad event_key';
  if (!isOneOf(S1A3_EVENT_KINDS, att.event_kind) || !isIsoDate(att.event_date)) return 'attestation: bad kind/date';
  if (att.s1a3_chargeable !== true && att.s1a3_chargeable !== false && att.s1a3_chargeable !== null) return 'attestation: bad s1a3_chargeable';
  if (!isRevision(att.revision) || typeof att.withdrawn !== 'boolean' || typeof att.retired !== 'boolean') return 'attestation: bad revision/flags';
  return null;
}

function issuerError(r: unknown): string | null {
  if (!isObject(r) || !exactKeys(r, ISSUER_KEYS)) return 'issuer_residence: not an object with exactly the contract keys';
  const row = r as unknown as ResidencyIssuerResidence;
  if (typeof row.id !== 'string' || row.id.length === 0) return 'issuer_residence: bad id';
  if (typeof row.issuer_key !== 'string' || !ISIN.test(row.issuer_key)) return 'issuer_residence: bad issuer_key';
  if (!isIsoDate(row.valid_from) || !isIsoDate(row.valid_to) || row.valid_from > row.valid_to) return 'issuer_residence: bad range';
  if (!isOneOf(ISSUER_RESIDENCE_ANSWERS, row.answer)) return 'issuer_residence: bad answer';
  if (typeof row.withdrawn !== 'boolean' || !isRevision(row.issuer_revision)) return 'issuer_residence: bad withdrawn/issuer_revision';
  return null;
}

/**
 * Validate an untrusted response against exactly `residency-tax-years` 1.0.0. Any deviation (other version, missing or
 * unknown key, bad vocabulary, inconsistent split dates, duplicate year or event, overlapping live issuer ranges, an
 * issuer whose rows disagree on `issuer_revision`) rejects the WHOLE response, so a consumer holds rather than guesses.
 */
export function parseResidencyTaxYears(input: unknown): ParseResidencyTaxYearsResult {
  const bad = (reason: string): ParseResidencyTaxYearsResult => ({ ok: false, reason });
  if (!isObject(input)) return bad('not an object');
  if (!exactKeys(input, ['schema_version', 'revision', 'years', 'history', 's1a3_attestations', 'issuer_residence'])) {
    return bad('unknown or missing top-level key');
  }
  if (input.schema_version !== RESIDENCY_TAX_YEARS_SCHEMA_VERSION) return bad('schema_version mismatch');
  if (!isRevision(input.revision)) return bad('bad revision');
  if (!Array.isArray(input.years) || !Array.isArray(input.s1a3_attestations) || !Array.isArray(input.issuer_residence)) {
    return bad('years, s1a3_attestations and issuer_residence must be arrays');
  }
  for (const y of input.years) {
    const err = yearError(y);
    if (err) return bad(err);
  }
  const labels = (input.years as ResidencyTaxYear[]).map(y => y.tax_year);
  if (!labels.every((l, i) => i === 0 || labels[i - 1] < l)) return bad('years must be strictly ascending and unique');
  const historyErr = historyError(input.history);
  if (historyErr) return bad(historyErr);
  const years = input.years as ResidencyTaxYear[];
  if (years.length === 0) {
    // `[]` means resident only for the empty-default response (design §3.3 rule 1); any recorded data contradicts it.
    const h = input.history as ResidencyHistory;
    if (h.prior_uk_residence !== 'unknown' || h.declared_at !== null || h.no_treaty_residence !== null ||
      input.s1a3_attestations.length > 0 || input.issuer_residence.length > 0) {
      return bad('years is empty but history, attestations or issuer residence hold data');
    }
  }
  for (const a of input.s1a3_attestations) {
    const err = attestationError(a);
    if (err) return bad(err);
  }
  // A live s.1A(3) row belongs to a non-resident year or the overseas part of a split year (design §3.4). A withdrawn
  // or retired row is kept as evidence and may predate a reclassification, so only live rows are checked.
  for (const a of input.s1a3_attestations as ResidencyS1a3Attestation[]) {
    if (a.withdrawn || a.retired) continue;
    const dateClass = classifyDateResidency(a.event_date, years);
    if (dateClass === 'resident' || dateClass === 'split_uk_part') {
      return bad('attestation: event_date is in a resident year or the UK part of a split year');
    }
  }
  const keys = (input.s1a3_attestations as ResidencyS1a3Attestation[]).map(a => a.event_key);
  if (new Set(keys).size !== keys.length) return bad('duplicate event_key');
  for (const r of input.issuer_residence) {
    const err = issuerError(r);
    if (err) return bad(err);
  }
  const rows = input.issuer_residence as ResidencyIssuerResidence[];
  if (new Set(rows.map(r => r.id)).size !== rows.length) return bad('duplicate issuer_residence id');
  const revisionByIssuer = new Map<string, number>();
  for (const r of rows) {
    const seen = revisionByIssuer.get(r.issuer_key);
    if (seen !== undefined && seen !== r.issuer_revision) return bad('issuer rows disagree on issuer_revision');
    revisionByIssuer.set(r.issuer_key, r.issuer_revision);
  }
  const live = rows.filter(r => !r.withdrawn);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.issuer_key === b.issuer_key && a.valid_from <= b.valid_to && b.valid_from <= a.valid_to) {
        return bad('overlapping live issuer ranges');
      }
    }
  }
  return { ok: true, value: input as unknown as ResidencyTaxYearsResponse };
}
