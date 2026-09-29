/**
 * d140 P2 / FIR-653 — minimized CGT capture-ledger → Income feed contract.
 *
 * 1.2.0 (d152 doc39 F4/F6, lockstep: producer cgt-app, consumer income-app). Consumers accept exactly one
 * version and reject unknown keys, so this bump is NOT additive: all three move together.
 * 1.3.0 (package 0.18.4): coverage entries carry `coveredFrom` and `accountOpenedOn` (required). A new required
 * key is a new wire version, so a producer/consumer skew fails as a version mismatch, not as a malformed page.
 */
export const BROKER_FACTS_FEED_SCHEMA_VERSION = '1.3.0' as const;
export const BROKER_FACTS_FEED_PURPOSE = 'broker_facts.read' as const;
export const BROKER_FACTS_FEED_PATH = '/api/internal/broker-facts' as const;
export const BROKER_FACTS_FEED_MAX_PAGE_SIZE = 500 as const;

/** Canonical UTC timestamp retaining PostgreSQL's microsecond precision. */
export function normalizeBrokerFactsTimestamp(raw: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(raw.trim());
  if (!match) return null;
  const [, date, time, rawFraction = '', rawZone] = match;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return null;
  const fraction = rawFraction.padEnd(6, '0');
  const zone = rawZone.toUpperCase() === 'Z' ? 'Z' : rawZone.length === 3 ? `${rawZone}:00` : rawZone.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const instant = new Date(`${date}T${time}.${fraction.slice(0, 3)}${zone}`);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString().replace(/\.\d{3}Z$/, `.${fraction}Z`);
}

export interface BrokerFactsCursor { updatedAt: string; id: string }
export type BrokerFactEventType = 'INTEREST' | 'DIVIDEND' | 'PAYMENT_IN_LIEU' | 'DISTRIBUTION' | 'UNCLASSIFIED';

/**
 * `settlement` = the fact is a settlement-owned unit result of a cut-over scope.
 * `legacy` = the fact is the pre-cutover capture row, served exactly as before 1.2.0.
 *
 * Cutover handoff (d152 doc39 F4, ratified) — so the two modes can never double-count:
 * 1. One scope (broker account) is exclusively one ownership mode at a time. No account ever has effective
 *    facts of both modes; a consumer that sees them quarantines the account-year (`mixed_ownership_modes`).
 * 2. At cutover the producer re-sends the scope's facts. Each settlement unit is sent as ONE `settlement` fact
 *    whose `sourceEventId` equals the legacy id of the unit's income owner (the accrual's captured event), so it
 *    supersedes that legacy fact by upsert on `sourceEventId`.
 * 3. The producer withdraws, by re-sending with `effective: false`, exactly these items:
 *    (i)   every non-owner row of a settlement unit (every row other than its income owner);
 *    (ii)  an accrual still awaiting payment (`pending_payment`, D4: not income until paid);
 *    (iii) an accrual the owner remedied as `not_paid` (D5).
 *    In a cut-over scope every fact is `settlement`; a withdrawn one carries `reliefWithholdingAmount: null` and
 *    contributes nothing.
 *
 * D5 owner remedies for an accrual whose covered pay date passed with no payment:
 * - `paid_as_accrued`: sent as an effective `settlement` fact at the accrual's gross and pay date, with
 *   `reliefWithholdingAmount: '0'` until cash shows the payment type (relief follows the cash type, never the
 *   owner's decision);
 * - `not_paid`: withdrawn, item (iii) above;
 * - still `payment_missing` (no remedy yet): the scope is not served at all (HTTP 409, see
 *   `BrokerFactsFeedResponse`).
 * 4. Every re-sent fact carries a newer `updatedAt`, so it passes the consumer's cursor. The same holds after
 *    any later authorization that changes the scope's owned result (a rebuilt epoch).
 *
 * A `settlement` unit fact carries the settlement-owned result, not the accrual row:
 * - `grossAmount`, `withholdingAmount` (the actual tax taken off), `netAmount` (gross less that tax) and
 *   `reliefWithholdingAmount` are exact decimal strings;
 * - `txnDate` and `payDate` are the date the result recognizes the payment (its proven payout); `exDate` is the
 *   accrual's; `withholdingRate` is `null`, because a ratio of exact amounts would only be derived;
 * - `contentFingerprint` identifies that result, so a changed amount or date always carries a new fingerprint;
 * - `brokerAccountRef` MUST be non-null: a settlement result always belongs to one account (its scope).
 */
export type BrokerFactOwnershipMode = 'legacy' | 'settlement';

export interface BrokerFact {
  sourceEventId: string;
  source: string;
  contentFingerprint: string;
  eventType: BrokerFactEventType;
  txnDate: string;
  exDate: string | null;
  payDate: string | null;
  grossAmount: string;
  netAmount: string | null;
  withholdingAmount: string | null;
  withholdingRate: string | null;
  /** d152 doc39 F4 / D1: see `BrokerFactOwnershipMode` (cutover handoff) and `reliefWithholdingAmount`. */
  ownershipMode: BrokerFactOwnershipMode;
  /**
   * Relief-eligible withholding, a decimal string in `currencyCode` (D1: withholding on a Payment In Lieu Of
   * Dividends is never relief-eligible). `withholdingAmount` stays the actual tax taken off, which the consumer
   * keeps and shows as tax taken off.
   * - MUST be `null` when `ownershipMode === 'legacy'`.
   * - When `ownershipMode === 'settlement'` and `effective` is true, `null` means unknown: the consumer fails
   *   closed and never falls back to `withholdingAmount`. A withdrawn fact (`effective: false`) carries `null`
   *   with no relief meaning at all: it contributes nothing.
   * - A `settlement` fact with a non-null value MUST satisfy `0 ≤ reliefWithholdingAmount ≤ withholdingAmount`
   *   (same currency), so `withholdingAmount` is then non-null too. Relief can never exceed the tax taken off.
   * - A `settlement` fact with `eventType: 'PAYMENT_IN_LIEU'` is dividend income (D1) and MUST carry '0'.
   */
  reliefWithholdingAmount: string | null;
  currencyCode: string;
  amountBasis: 'gross' | 'net' | 'unknown';
  symbol: string | null;
  isin: string | null;
  issuerCountry: string | null;
  payerEntity: string | null;
  /** Opaque broker account identifier; never a bank/card account number or raw source_account. */
  brokerAccountRef: string | null;
  effective: boolean;
  supersededBy: string | null;
  reviewStatus: 'none' | 'pending_review' | 'resolved';
  reviewReason: string | null;
  updatedAt: string;
}

/**
 * d152 doc39 F6 / D4: the broker-asserted statement coverage of one account. All dates are ISO calendar dates
 * (YYYY-MM-DD). Only broker-asserted statement windows count (FromDate/ToDate); row-inferred windows never do.
 *
 * The coverage run, exactly as the producer computes it: begin at the account's EARLIEST broker-asserted window
 * and extend it through every window that starts no later than the day after the run's current end. The run stops
 * at the first gap. `coveredFrom` is its start (the earliest window's FromDate) and `coveredThrough` its end.
 * Windows after the first gap do not count until the gap is filled.
 *
 * Year-final rule, for a period [start, end] (a UK tax year: 6 April to 5 April). The account is complete for
 * the period when
 *   `coveredFrom ≤ max(start, accountOpenedOn)` AND `coveredThrough ≥ min(end, accountClosedOn)`,
 * where a null `accountOpenedOn` means `coveredFrom ≤ start` and a null `accountClosedOn` means
 * `coveredThrough ≥ end`. An account opened after `end` is irrelevant to the period, unless it has facts in the
 * period: that contradiction is never final. A null or malformed date is never final.
 * `isBrokerAccountCoverageFinal` is that rule, shared by both sides.
 */
export interface BrokerFactsAccountCoverage {
  brokerAccountRef: string;
  /** The end of the coverage run (it stops at the first gap); `null` = no broker-asserted window at all. */
  coveredThrough: string | null;
  /**
   * d152 doc39 D4 (closed accounts erratum): the broker-asserted close date of the account (IBKR
   * AccountInformation `dateClosed`), as an ISO date. An account whose close date is on or before its
   * `coveredThrough` is complete for every later date: no later statement can add to it.
   * - `null` means open or unknown, so the consumer fails closed exactly as before.
   * - The producer never infers a close date. It also sends `null` while an accrual of the account still awaits
   *   payment: a closure cannot complete an account with a payment outstanding (D4: a fully covered year can
   *   contain no pending accrual).
   */
  accountClosedOn: string | null;
  /**
   * 0.18.3: the start of the coverage run, i.e. the FromDate of the account's earliest broker-asserted window.
   * `null` exactly when `coveredThrough` is `null`, and never after `coveredThrough`.
   */
  coveredFrom: string | null;
  /**
   * 0.18.3: the broker-asserted open date of the account (IBKR AccountInformation `dateOpened`); `null` = unknown,
   * so the run must reach back to the period start. The producer never infers it. Never after `accountClosedOn`.
   */
  accountOpenedOn: string | null;
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The year-final rule of `BrokerFactsAccountCoverage` for one account and one period (`start`/`end` inclusive ISO
 * dates). `true` = nothing can still be missing from the account for that period.
 *
 * Fail-closed by construction:
 * - every date (coverage and period) must be a valid ISO calendar date; `null` is allowed only where the rule
 *   gives it a meaning. Anything else (an empty string, a timestamp, 2025-02-30) is never final.
 * - `accountHasFactsInPeriod` is required. The "opened after the period, so irrelevant" exemption holds only for
 *   an account with no facts in the period; facts in a period before the account opened are a contradiction,
 *   and a contradiction is never final. The flag lives here, not in one caller, so producer and consumer cannot
 *   disagree on it.
 *
 * Pure; valid ISO calendar dates compare correctly as strings.
 */
export function isBrokerAccountCoverageFinal(
  coverage: Pick<BrokerFactsAccountCoverage, 'coveredFrom' | 'coveredThrough' | 'accountOpenedOn' | 'accountClosedOn'>,
  period: { start: string; end: string; accountHasFactsInPeriod: boolean },
): boolean {
  const nullableDate = (value: unknown) => value === null || isIsoCalendarDate(value);
  if (!isIsoCalendarDate(period.start) || !isIsoCalendarDate(period.end) || period.start > period.end) return false;
  if (![coverage.coveredFrom, coverage.coveredThrough, coverage.accountOpenedOn, coverage.accountClosedOn].every(nullableDate)) return false;
  if (typeof period.accountHasFactsInPeriod !== 'boolean') return false;
  if (coverage.accountOpenedOn !== null && coverage.accountOpenedOn > period.end) return !period.accountHasFactsInPeriod;
  if (coverage.coveredFrom === null || coverage.coveredThrough === null) return false;
  const mustStartBy = coverage.accountOpenedOn !== null && coverage.accountOpenedOn > period.start ? coverage.accountOpenedOn : period.start;
  const mustReach = coverage.accountClosedOn !== null && coverage.accountClosedOn < period.end ? coverage.accountClosedOn : period.end;
  return coverage.coveredFrom <= mustStartBy && coverage.coveredThrough >= mustReach;
}

/**
 * The producer serves no page (HTTP 409) while a cut-over scope of the caller cannot state its owned result:
 * - it awaits the owner's confirmation of newer records; or
 * - it holds a `payment_missing` accrual with no D5 remedy yet.
 * The consumer keeps its last complete sync.
 */
export interface BrokerFactsFeedResponse {
  schemaVersion: typeof BROKER_FACTS_FEED_SCHEMA_VERSION;
  facts: BrokerFact[];
  /** One entry per broker account of the caller, on every page (including an empty page). */
  coverage: BrokerFactsAccountCoverage[];
  nextCursor: string | null;
  hasMore: boolean;
}
