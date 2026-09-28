/**
 * d140 P2 / FIR-653 — minimized CGT capture-ledger → Income feed contract.
 *
 * 1.2.0 (d152 doc39 F4/F6, lockstep: producer cgt-app, consumer income-app). Consumers accept exactly one
 * version and reject unknown keys, so this bump is NOT additive: all three move together.
 */
export const BROKER_FACTS_FEED_SCHEMA_VERSION = '1.2.0' as const;
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
 * 3. Every other legacy row of that unit is re-sent with `effective: false`. So is an accrual still awaiting
 *    payment (D4: not income until paid). In a cut-over scope every fact is `settlement`; a withdrawn one carries
 *    `reliefWithholdingAmount: null` and contributes nothing.
 * 4. Every re-sent fact carries a newer `updatedAt`, so it passes the consumer's cursor. The same holds after
 *    any later authorization that changes the scope's owned result (a rebuilt epoch).
 *
 * A `settlement` unit fact carries the settlement-owned result, not the accrual row:
 * - `grossAmount`, `withholdingAmount` (the actual tax taken off), `netAmount` (gross less that tax) and
 *   `reliefWithholdingAmount` are exact decimal strings;
 * - `txnDate` and `payDate` are the date the result recognizes the payment (its proven payout); `exDate` is the
 *   accrual's; `withholdingRate` is `null`, because a ratio of exact amounts would only be derived;
 * - `contentFingerprint` identifies that result, so a changed amount or date always carries a new fingerprint.
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
   * - When `ownershipMode === 'settlement'`, `null` means unknown: the consumer fails closed and never falls
   *   back to `withholdingAmount`.
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
 * d152 doc39 F6 / D4: the end of the contiguous, broker-asserted statement coverage of one account, as an ISO
 * date (YYYY-MM-DD). `null` means a gap or unknown. Row-inferred windows never count as coverage.
 */
export interface BrokerFactsAccountCoverage {
  brokerAccountRef: string;
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
}

/**
 * While a cut-over scope of the caller awaits the owner's confirmation of newer records, the producer serves no
 * page (HTTP 409): it cannot state that scope's owned result. The consumer keeps its last complete sync.
 */
export interface BrokerFactsFeedResponse {
  schemaVersion: typeof BROKER_FACTS_FEED_SCHEMA_VERSION;
  facts: BrokerFact[];
  /** One entry per broker account of the caller, on every page (including an empty page). */
  coverage: BrokerFactsAccountCoverage[];
  nextCursor: string | null;
  hasMore: boolean;
}
