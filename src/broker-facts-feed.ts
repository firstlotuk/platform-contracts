/**
 * d140 P2 / FIR-653 — minimized CGT capture-ledger → Income feed contract.
 *
 * 1.2.0 (d152 doc39 F4/F6, lockstep: producer cgt-app, consumer income-app). Consumers accept exactly one
 * version and reject unknown keys, so this bump is NOT additive: all three move together.
 * 1.3.0 (package 0.18.4): coverage entries carry `coveredFrom` and `accountOpenedOn` (required). A new required
 * key is a new wire version, so a producer/consumer skew fails as a version mismatch, not as a malformed page.
 * 1.4.0 (package 0.18.5): coverage entries carry `evidenceTaxYears` (required), the producer's authoritative
 * "facts in period" evidence, so producer and consumer can no longer judge the same year differently.
 * 1.5.0 (package 0.18.8): same shape, new semantics. Year-final and closure are judged by PCT, the one-weekday
 * payment reporting grace (`paymentsCoveredThrough`, policy `one-weekday-reporting-grace.v1`), not raw
 * `coveredThrough`. A semantic change is a new wire version too, so a mixed deploy (a 1.4.0 side reading or writing
 * the other's pages) fails as a version mismatch instead of silently judging years by a different rule.
 * Package 0.18.9 (wire unchanged, 1.5.0): `ukTaxYearLabelOfDate` is the one date → UK tax-year label mapping both
 * sides import instead of keeping copies.
 * Package 0.18.10 (wire unchanged, 1.5.0): the producer rules for `accountClosedOn` and `accountOpenedOn` follow owner
 * decisions N2 and N1 (2026-09-29): the close date sent is the effective one (the later of the broker's and the last
 * activity), and only activity before the opening contradicts it. `isBrokerAccountCoverageFinal` mirrors the closure
 * rule (a closure contradicted by evidence in a later tax year completes nothing), as defence in depth. The wire stays
 * 1.5.0: the shape and the year-final rule over the wire values are unchanged, and a conforming producer of either
 * package version never sends the contradiction the mirror catches, so both sides judge every year the same way in
 * every deploy mix.
 * 1.6.0 (package 0.19.0; d152 doc42, owner-ratified 2026-09-30): the unconfirmed state crosses the wire (doc42 §2.5).
 * - Facts gain `confirmation` and `unconfirmedReason` (the closed `UnconfirmedReason`, doc42 §2.2).
 * - Coverage entries gain `unconfirmedTaxYears` (the year-level filing signal, doc42 §2.3) and `contiguityPolicy` (the
 *   rule the account's coverage run follows: no gap bridged, or R6's weekend-only bridging).
 * - The 409 for an unremedied `payment_missing` accrual is dropped: that accrual is now served as the
 *   `payment_missing` unconfirmed default.
 * New required keys and new semantics, so this is a new wire version under the same lockstep rule as 1.2.0–1.5.0. A
 * 1.5.0 side refuses 1.6.0 pages and a 1.6.0 side refuses 1.5.0 pages, both as a version mismatch. The 1.5.0 meaning
 * of every existing field is unchanged. A 1.5.0-shaped coverage object (no `contiguityPolicy`) given to the shared
 * helpers is judged exactly as before, under the no-gap rule 1.5.0 always meant.
 */
export const BROKER_FACTS_FEED_SCHEMA_VERSION = '1.6.0' as const;
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
 *    (i)   every non-owner row of a settlement unit (every row other than its income owner). A unit with no income
 *          owner withdraws every row: a no-posting unit, and (1.6.0) the zero default of an `awaiting_coverage`
 *          group, whose withdrawn facts are labelled `'unconfirmed'` (see `BrokerFactConfirmation`);
 *    (ii)  an accrual still awaiting payment (`pending_payment`, D4: not income until paid);
 *    (iii) an accrual the owner remedied as `not_paid` (D5).
 *    In a cut-over scope every fact is `settlement`; a withdrawn one carries `reliefWithholdingAmount: null` and
 *    contributes nothing.
 *
 * D5 owner remedies for an accrual whose covered pay date passed with no payment:
 * - `paid_as_accrued`: sent as an effective `settlement` fact at the accrual's gross and pay date, with
 *   `withholdingAmount` = the accrual's tax and `reliefWithholdingAmount: '0'` until cash shows the payment type
 *   (relief follows the cash type, never the owner's decision);
 * - `not_paid`: withdrawn, item (iii) above;
 * - still `payment_missing` (no remedy yet), 1.6.0: sent exactly as `paid_as_accrued` would send it, its ratified
 *   default (doc42 §2.2), but labelled `confirmation: 'unconfirmed'`, `unconfirmedReason: 'payment_missing'`, with the
 *   pay date's tax year in the account's `unconfirmedTaxYears`. The owner's remedy then confirms it (`paid_as_accrued`)
 *   or withdraws it (`not_paid`). Up to 1.5.0 such a scope was not served at all (HTTP 409).
 * 4. Every re-sent fact carries a newer `updatedAt`, so it passes the consumer's cursor. The same holds after
 *    any later authorization that changes the scope's owned result (a rebuilt epoch), and after any change of a
 *    fact's `confirmation` or `unconfirmedReason` (an owner confirmation, or a rule that now proves the group).
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

/**
 * 1.6.0 (d152 doc42 §2): whether the owned result a `settlement` fact carries is confirmed, or is an `unconfirmed`
 * group's ratified default.
 * - `'unconfirmed'`: the fact carries, or is withdrawn by, the default of an `unconfirmed` group (doc42 §2.1). A
 *   non-zero default is an effective fact and enters totals, labelled. A zero default (`awaiting_coverage`) withdraws
 *   the accrual (`effective: false`), and that withdrawn fact is labelled too, so the consumer can show and count the
 *   item even though it contributes nothing.
 * - `'confirmed'`: every other `settlement` fact. That covers a result proven by rule or resolved by a human
 *   (including an owner's confirmation of a default), a withdrawn non-owner row, and an accrual awaiting payment (D4
 *   pending is not an unconfirmed state; coverage keeps its year non-final).
 * - `null`: exactly the `legacy` facts, which have no settlement result to confirm.
 */
export const BROKER_FACT_CONFIRMATIONS = ['confirmed', 'unconfirmed'] as const;
export type BrokerFactConfirmation = (typeof BROKER_FACT_CONFIRMATIONS)[number];

/**
 * 1.6.0 (d152 doc42 §2.2, contract04 2026-09-30 amendment G): the closed reasons a group may be `unconfirmed` for,
 * each with a ratified default and held tax years. A shape outside this list stays blocked; `unconfirmed` is never a
 * catch-all. A new reason is a new wire version.
 * - `awaiting_coverage`: R1 conditions 1–5 and 7 hold, but coverage (condition 6) does not yet reach the pay date.
 *   Default zero; holds the pay date's year.
 * - `pay_date_crosses_tax_year`: R4 conditions 1–3 hold, but the moved pay date crosses a tax year. Default: income at
 *   the cash date; holds both the accrual's pay-date year and the cash-date year.
 * - `restatement_beyond_tolerance` / `restatement_crosses_tax_year`: an R5 withholding history beyond one minor unit,
 *   or with a non-zero change reported in a later tax year. Default withholding `W_final`; holds the pay date's year
 *   (plus the batch's, for `_crosses_`).
 * - `possible_duplicate_action`: two credits on identical terms under two actions. Default: separate events; holds
 *   the cash-date year.
 * - `scrip_distribution`: default income at the `Re` rate, with the new units' cost to match; holds the income year
 *   and every CGT year with a disposal from the pool.
 * - `payment_missing`: an un-reversed accrual whose covered pay date passed with no cash. Default D5
 *   `paid_as_accrued`; holds the pay date's year.
 * - `classification_pending`: the treatment step's flag (Q7) on "(Return of Capital)" cash, never set by the
 *   resolver. Default: dividend income at the cash amount; holds the cash-date year.
 *
 * A fact names one reason. Where the treatment step's `classification_pending` applies to a fact whose group is also
 * unconfirmed for a resolver reason (doc42 P8), the fact names one of them. The held years of both are in
 * `unconfirmedTaxYears` either way, so the filing gate never depends on which one the fact names.
 */
export const BROKER_FACT_UNCONFIRMED_REASONS = [
  'awaiting_coverage',
  'pay_date_crosses_tax_year',
  'restatement_beyond_tolerance',
  'restatement_crosses_tax_year',
  'possible_duplicate_action',
  'scrip_distribution',
  'payment_missing',
  'classification_pending',
] as const;
export type UnconfirmedReason = (typeof BROKER_FACT_UNCONFIRMED_REASONS)[number];

export function isBrokerFactUnconfirmedReason(value: unknown): value is UnconfirmedReason {
  return typeof value === 'string' && (BROKER_FACT_UNCONFIRMED_REASONS as readonly string[]).includes(value);
}

/**
 * 1.6.0: the wire grammar of a fact's `confirmation` and `unconfirmedReason`, as the consumer's reader checks it:
 * - a `legacy` fact carries `null` in both;
 * - a `settlement` fact carries `'confirmed'` with a `null` reason, or `'unconfirmed'` with a closed
 *   `UnconfirmedReason`.
 * Anything else (an unknown value, a reason on a confirmed fact, a missing reason, a non-null value on a legacy fact,
 * or an unknown ownership mode) breaks the grammar.
 */
export function isBrokerFactConfirmationConsistent(
  fact: Pick<BrokerFact, 'ownershipMode' | 'confirmation' | 'unconfirmedReason'>,
): boolean {
  if (fact.ownershipMode === 'legacy') return fact.confirmation === null && fact.unconfirmedReason === null;
  if (fact.ownershipMode !== 'settlement') return false;
  if (fact.confirmation === 'confirmed') return fact.unconfirmedReason === null;
  return fact.confirmation === 'unconfirmed' && isBrokerFactUnconfirmedReason(fact.unconfirmedReason);
}

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
  /**
   * 1.6.0: see `BrokerFactConfirmation`. `null` exactly when `ownershipMode === 'legacy'`. Grammar:
   * `isBrokerFactConfirmationConsistent`.
   */
  confirmation: BrokerFactConfirmation | null;
  /**
   * 1.6.0: the closed reason of an `'unconfirmed'` fact (see `UnconfirmedReason`); `null` otherwise. The UK tax year of
   * an unconfirmed fact's recognition date (`payDate`, else `txnDate`) is always in its account's `unconfirmedTaxYears`.
   */
  unconfirmedReason: UnconfirmedReason | null;
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
 * and extend it through every window that is contiguous with the run's current end under the account's
 * `contiguityPolicy` (`brokerStatementWindowsContiguous`). Under the default no-gap policy that means a window that
 * starts no later than the day after the run's end. Under R6 (1.6.0) a gap of Saturdays and Sundays only is bridged
 * too. The run stops at the first gap its policy does not bridge. `coveredFrom` is its start (the earliest window's
 * FromDate) and `coveredThrough` its end. Windows after that gap do not count until the gap is filled.
 *
 * One-weekday payment reporting grace (0.18.7, owner decision 2026-09-29; contract04 D4 amendment): IBKR reports
 * dividend cash up to one weekday after its pay date, and Flex selects cash rows by report date. So payments count
 * as covered only through PCT, the payments-covered-through date = `paymentsCoveredThrough(coveredThrough)`: the
 * weekday (Mon–Fri) before the last weekday on or before `coveredThrough`. Raw `coveredThrough` is unchanged. There
 * is no holiday calendar: a holiday, or a report later than one weekday, still fails closed.
 *
 * Year-final rule, for a period [start, end] (a UK tax year: 6 April to 5 April). The account is complete for
 * the period when
 *   `coveredFrom ≤ max(start, accountOpenedOn)` AND `PCT ≥ min(end, accountClosedOn)`,
 * where a null `accountOpenedOn` means `coveredFrom ≤ start` and a null `accountClosedOn` means `PCT ≥ end`; a null
 * PCT is never complete. An account opened after `end` is irrelevant to the period, unless it has facts in the
 * period: that contradiction is never final. A null or malformed date is never final.
 * A closure contradicted by the account's evidence (0.18.10: evidence in a UK tax year after the closure's, or unknown
 * evidence) counts as `null`: a conforming producer never sends one, see `accountClosedOn`.
 * `isBrokerAccountCoverageFinal` is that rule, shared by both sides.
 *
 * "Facts in period" (normative, 1.4.0): the account has facts in a period whose UK tax year is `Y` exactly when
 * `Y ∈ evidenceTaxYears`, or `evidenceTaxYears` is `null`, or `evidenceTaxYears` breaks the wire grammar (not
 * sorted, distinct `'YYYY-YY'` labels), or `Y` is not a valid UK tax-year label. `brokerAccountHasEvidenceInTaxYear`
 * is that definition. It is the producer's evidence, carried on the wire; a consumer may OR in evidence of its own,
 * which can only make a year less final, never more.
 *
 * Coverage finality and filing readiness are separate (1.6.0, doc42 §2.3):
 * - Coverage finality (`isBrokerAccountCoverageFinal`) asks whether any broker record of the period can still be
 *   missing. Unconfirmed items do not affect it, and they block neither coverage nor cutover.
 * - Filing readiness (`isBrokerAccountYearFilingReady`) asks whether the year's broker income may be declared. It
 *   needs coverage finality AND no year of the period held by an unconfirmed item (`unconfirmedTaxYears`). A held
 *   year is computed with the defaults and shown labelled, but it is never filing-ready.
 */
export interface BrokerFactsAccountCoverage {
  brokerAccountRef: string;
  /** The end of the coverage run (it stops at the first gap); `null` = no broker-asserted window at all. */
  coveredThrough: string | null;
  /**
   * d152 doc39 D4 (closed accounts erratum), owner decision N2 (2026-09-29): the account's EFFECTIVE close date, as an
   * ISO date: the later of the broker-asserted close date (IBKR AccountInformation `dateClosed`) and the account's
   * last activity date (its latest evidence date, the evidence behind `evidenceTaxYears`). IBKR posts trailing
   * activity to a closed account (a final dividend, FX sweeps, the closing withdrawal); that activity moves the
   * closure later, it never cancels it. An account whose close date is on or before its payments-covered-through date
   * (PCT, the one-weekday payment reporting grace) is complete for every later date: no later statement can add to it.
   * - `null` means open or unknown, so the consumer fails closed exactly as before.
   * - The producer never infers a closure from activity: with no broker-asserted close date (or two that disagree) it
   *   sends `null`. It also sends `null` while an accrual of the account still awaits payment: a closure cannot
   *   complete an account with a payment outstanding (D4: a fully covered year can contain no pending accrual).
   * - So no evidence date of the account follows a non-null close date, and `evidenceTaxYears` holds no tax year after
   *   the close date's. `isBrokerAccountCoverageFinal` enforces that itself at tax-year granularity (0.18.10), so a
   *   contradicted closure from a second producer or a regression completes nothing.
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
   * Owner decision N1 (2026-09-29): only ACTIVITY dated before the opening (an evidence date behind
   * `evidenceTaxYears`) contradicts it, and then the producer sends `null`. A statement window that starts before the
   * opening does not: it covers days on which the account did not exist yet.
   */
  accountOpenedOn: string | null;
  /**
   * 1.4.0: the sorted, distinct UK tax-year labels `'YYYY-YY'` (6 April to 5 April; e.g. `'2023-24'`) in which the
   * account has ANY captured broker evidence: income events in any state (their txn, ex and pay dates), cash
   * movements, transactions and transfers, and the pay dates of accruals still awaiting payment.
   * `null` = unknown: the account counts as having evidence in EVERY year (fail closed).
   */
  evidenceTaxYears: string[] | null;
  /**
   * 1.6.0 (doc42 §2.3): the sorted, distinct UK tax-year labels `'YYYY-YY'` held by the account's unconfirmed items,
   * the union of every unconfirmed item's held years (see `UnconfirmedReason`). That includes an item whose default is
   * zero, and every year a reason holds beyond its fact's own date (both years of `pay_date_crosses_tax_year`, the
   * disposal years of `scrip_distribution`). A held year is not filing-ready. `[]` = no year is held. Never `null`: the
   * producer always knows its own unconfirmed items. A value that breaks the grammar (`isBrokerFactsUnconfirmedTaxYears`)
   * holds every year (fail closed). A consumer may add holds of its own from the facts it reads, which can only make a
   * year less ready, never more.
   */
  unconfirmedTaxYears: string[];
  /**
   * 1.6.0 (doc42 R6): the contiguity rule this account's coverage run (`coveredFrom`..`coveredThrough`) follows. See
   * `BrokerFactsContiguityPolicy`. The producer asserts the R6 weekend policy for an account only after establishing
   * R6's evidence for it: (b) no weekend `reportDate` in `CashTransactions` or `ChangeInDividendAccruals`; (c1) every
   * statement of the run carries `Trades`, `OpenPositions` and `Transfers`, each with rows or as an explicit empty
   * section; (c2) no weekend-session `assetCategory` (`CRYPTO`) in any section; (c3) only `STK`, `OPT`, `BOND` and
   * `CASH`. Otherwise, and by default, it sends the no-gap policy. The contract does not see or re-check
   * that evidence. It carries the policy identity and defines the one gap rule each policy means. A consumer reads
   * `coveredThrough` as a run under this policy, and the shared helpers treat an unrecognised policy as proving
   * nothing.
   */
  contiguityPolicy: BrokerFactsContiguityPolicy;
}

/**
 * 1.6.0 (d152 doc42 R6, contract04 2026-09-30 amendment F): the contiguity rules a coverage run may follow.
 * - `BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP`: a window is contiguous with the run only when it starts no later than the
 *   day after the run's end. Every gap fails closed. This is the rule of every wire version before 1.6.0 and the
 *   fail-closed default.
 * - `BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND` (R6, `ibkr_weekend_window_contiguity_20260930.v1`, the ratified rule
 *   identity): the no-gap rule, and also a gap whose every day is a Saturday or a Sunday (at most two days). Public
 *   holidays are never bridged: there is no holiday calendar. The producer asserts it per account on R6's evidence (see
 *   `BrokerFactsAccountCoverage.contiguityPolicy`).
 * The PCT formula (`paymentsCoveredThrough`) is unchanged under either policy; R6 moves `coveredThrough`, never an
 * amount, and never `coveredFrom`. Both identities are versioned and belong in the producer's evaluation identity,
 * beside `BROKER_FACTS_PAYMENT_GRACE_POLICY`.
 */
export const BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP = 'no-gap-contiguity.v1' as const;
export const BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND = 'ibkr_weekend_window_contiguity_20260930.v1' as const;
export const BROKER_FACTS_CONTIGUITY_POLICIES = [
  BROKER_FACTS_CONTIGUITY_POLICY_NO_GAP,
  BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND,
] as const;
export type BrokerFactsContiguityPolicy = (typeof BROKER_FACTS_CONTIGUITY_POLICIES)[number];

export function isBrokerFactsContiguityPolicy(value: unknown): value is BrokerFactsContiguityPolicy {
  return typeof value === 'string' && (BROKER_FACTS_CONTIGUITY_POLICIES as readonly string[]).includes(value);
}

/** A UK tax-year label `'YYYY-YY'` whose second part is the year after the first ('2023-24', '2099-00'). */
export function isUkTaxYearLabel(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match !== null && (Number(match[1]) + 1) % 100 === Number(match[2]);
}

/** Strictly ascending (sorted, distinct) UK tax-year labels. */
function isAscendingTaxYearLabels(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.every(isUkTaxYearLabel)) return false;
  return value.every((label, index) => index === 0 || (value[index - 1] as string) < label);
}

/** The wire grammar of `evidenceTaxYears`: `null`, or strictly ascending (sorted, distinct) tax-year labels. */
export function isBrokerFactsEvidenceTaxYears(value: unknown): value is string[] | null {
  return value === null || isAscendingTaxYearLabels(value);
}

/** 1.6.0: the wire grammar of `unconfirmedTaxYears`: strictly ascending (sorted, distinct) tax-year labels, never `null`. */
export function isBrokerFactsUnconfirmedTaxYears(value: unknown): value is string[] {
  return isAscendingTaxYearLabels(value);
}

/**
 * 1.6.0: whether the account's unconfirmed items hold `taxYear`, i.e. `taxYear ∈ unconfirmedTaxYears`. Fail closed: a
 * list that breaks the wire grammar (`null`, absent, unsorted, or a bad label), or a malformed `taxYear`, counts as
 * held.
 */
export function isBrokerAccountTaxYearUnconfirmed(
  coverage: Pick<BrokerFactsAccountCoverage, 'unconfirmedTaxYears'>,
  taxYear: string,
): boolean {
  if (!isUkTaxYearLabel(taxYear) || !isBrokerFactsUnconfirmedTaxYears(coverage.unconfirmedTaxYears)) return true;
  return coverage.unconfirmedTaxYears.includes(taxYear);
}

/**
 * "Facts in period", as the contract defines it: `taxYear ∈ evidenceTaxYears`, or `evidenceTaxYears` is `null`.
 * Fail-closed: evidence that breaks the wire grammar, or a malformed `taxYear`, counts as evidence.
 */
export function brokerAccountHasEvidenceInTaxYear(
  coverage: Pick<BrokerFactsAccountCoverage, 'evidenceTaxYears'>,
  taxYear: string,
): boolean {
  if (!isUkTaxYearLabel(taxYear) || !isBrokerFactsEvidenceTaxYears(coverage.evidenceTaxYears)) return true;
  return coverage.evidenceTaxYears === null || coverage.evidenceTaxYears.includes(taxYear);
}

/** The version of the one-weekday payment reporting grace in `paymentsCoveredThrough` (bound into evaluation identities). */
export const BROKER_FACTS_PAYMENT_GRACE_POLICY = 'one-weekday-reporting-grace.v1' as const;

// Proleptic Gregorian day numbers (days since 1970-01-01), integer arithmetic only: no Date, no time zone.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * PCT, the payments-covered-through date of the one-weekday payment reporting grace: the weekday (Mon–Fri) BEFORE
 * the last weekday on or before `coveredThrough`. Tue → Mon, Wed → Tue, Thu → Wed, Fri/Sat/Sun → Thu, Mon → the
 * previous Fri. Pure date arithmetic (never the wall clock); no holiday calendar. `null` or an invalid date → `null`.
 */
export function paymentsCoveredThrough(coveredThrough: string | null): string | null {
  const days = dayNumberOf(coveredThrough);
  if (days === null) return null;
  const weekday = weekdayOfDayNumber(days);
  const lastWeekday = weekday === 5 ? days - 1 : weekday === 6 ? days - 2 : days;
  const lastWeekdayIndex = weekday >= 5 ? 4 : weekday;
  return civilFromDays(lastWeekdayIndex === 0 ? lastWeekday - 3 : lastWeekday - 1);
}

/** The day number of a valid ISO calendar date, else `null`. */
function dayNumberOf(value: unknown): number | null {
  if (!isIsoCalendarDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return daysFromCivil(year, month, day);
}

/** Monday = 0 … Sunday = 6 (day 0, 1970-01-01, was a Thursday). */
function weekdayOfDayNumber(days: number): number {
  return ((days + 3) % 7 + 7) % 7;
}

/**
 * 1.6.0 (doc42 R6): whether a broker-asserted window starting `nextStart` is contiguous with a coverage run ending
 * `runEnd`, under `contiguityPolicy`. This is the one gap rule of the coverage run (see `BrokerFactsAccountCoverage`).
 * The producer's run merge calls it for each next window in start order and stops at the first `false`.
 * - Both policies: `nextStart ≤ runEnd + 1 day` (an overlapping or adjacent window) is contiguous.
 * - `BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND` only: a gap whose every day (strictly between `runEnd` and `nextStart`)
 *   is a Saturday or a Sunday is contiguous too: Sat, Sun, or Sat+Sun. A gap with any weekday in it, a public holiday
 *   included, is not.
 * The policy is the producer's assertion; R6's evidence is the producer's to establish. This helper applies the
 * bridging only when the policy is asserted. Fail closed: an invalid date or an unrecognised policy is never
 * contiguous. Pure date arithmetic, with no wall clock and no time zone.
 */
export function brokerStatementWindowsContiguous(runEnd: string, nextStart: string,
  contiguityPolicy: BrokerFactsContiguityPolicy): boolean {
  const end = dayNumberOf(runEnd);
  const start = dayNumberOf(nextStart);
  if (end === null || start === null || !isBrokerFactsContiguityPolicy(contiguityPolicy)) return false;
  if (start <= end + 1) return true;
  // A weekend-only gap is at most two days long.
  if (contiguityPolicy !== BROKER_FACTS_CONTIGUITY_POLICY_WEEKEND || start - end - 1 > 2) return false;
  for (let day = end + 1; day < start; day += 1) {
    if (weekdayOfDayNumber(day) < 5) return false;
  }
  return true;
}

/**
 * 0.18.9: THE date → UK tax-year label mapping, shared by producer and consumer so neither keeps a copy. The label
 * `'YYYY-YY'` of the UK tax year (6 April to 5 April) containing `date`: 5 April closes a year, 6 April opens the
 * next ('2025-04-05' → '2024-25', '2025-04-06' → '2025-26'). `null` for anything but a valid ISO calendar date
 * (`YYYY-MM-DD`). Pure string arithmetic, never the wall clock or a time zone. Every non-null result satisfies
 * `isUkTaxYearLabel`.
 */
export function ukTaxYearLabelOfDate(date: string): string | null {
  if (!isIsoCalendarDate(date)) return null;
  const year = Number(date.slice(0, 4));
  const start = date.slice(5) >= '04-06' ? year : year - 1;
  if (start < 0) return null;
  return `${String(start).padStart(4, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The UK tax-year label of a period that is exactly one UK tax year (YYYY-04-06 to YYYY+1-04-05), else `null`. */
function ukTaxYearOfPeriod(period: { start: string; end: string }): string | null {
  const taxYear = ukTaxYearLabelOfDate(period.start);
  // 6 April opens the year and 5 April of the same labelled year (the next calendar year) closes it.
  if (taxYear === null || !period.start.endsWith('-04-06') || !period.end.endsWith('-04-05')
    || ukTaxYearLabelOfDate(period.end) !== taxYear) return null;
  return taxYear;
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
 * - The "opened after the period, so irrelevant" exemption holds only for an account with no facts in the period;
 *   facts in a period before the account opened are a contradiction, and a contradiction is never final.
 * - 0.18.6: "facts in the period" is decided HERE, from the coverage's own `evidenceTaxYears`
 *   (`brokerAccountHasEvidenceInTaxYear` for the period's UK tax year), OR the caller's `accountHasFactsInPeriod`.
 *   The caller can only ADD evidence. The exemption is denied when the evidence is absent, `null` or malformed, or
 *   when the period is not exactly one UK tax year (6 April to 5 April).
 * - 0.18.10: the closure rule is mirrored HERE too, not trusted to the producer: a closure the coverage's own evidence
 *   contradicts (`closureContradictedByEvidence`) is treated as `null`, so it cannot complete any period.
 * - 1.6.0: `coveredThrough` is read as a run under the entry's `contiguityPolicy`. A policy the contract does not
 *   recognise proves nothing, so the entry is never final. An absent policy (a 1.5.0-shaped object) is the no-gap rule
 *   1.5.0 always meant, so such an object is judged exactly as before. The rule itself is unchanged under either
 *   policy: R6 bridging has already moved `coveredThrough`, and PCT is applied to it as before.
 * - 1.6.0: unconfirmed items (`unconfirmedTaxYears`) do NOT make a period non-final: coverage finality is not filing
 *   readiness (see `isBrokerAccountYearFilingReady`).
 *
 * Pure; valid ISO calendar dates compare correctly as strings.
 */
export function isBrokerAccountCoverageFinal(
  coverage: Pick<BrokerFactsAccountCoverage, 'coveredFrom' | 'coveredThrough' | 'accountOpenedOn' | 'accountClosedOn'>
    & { evidenceTaxYears?: BrokerFactsAccountCoverage['evidenceTaxYears'];
      contiguityPolicy?: BrokerFactsAccountCoverage['contiguityPolicy'] },
  period: { start: string; end: string; accountHasFactsInPeriod: boolean },
): boolean {
  const nullableDate = (value: unknown) => value === null || isIsoCalendarDate(value);
  if (!isIsoCalendarDate(period.start) || !isIsoCalendarDate(period.end) || period.start > period.end) return false;
  if (![coverage.coveredFrom, coverage.coveredThrough, coverage.accountOpenedOn, coverage.accountClosedOn].every(nullableDate)) return false;
  if (coverage.contiguityPolicy !== undefined && !isBrokerFactsContiguityPolicy(coverage.contiguityPolicy)) return false;
  if (typeof period.accountHasFactsInPeriod !== 'boolean') return false;
  if (coverage.accountOpenedOn !== null && coverage.accountOpenedOn > period.end) {
    const taxYear = ukTaxYearOfPeriod(period);
    const producerEvidence = taxYear === null || coverage.evidenceTaxYears === undefined
      || brokerAccountHasEvidenceInTaxYear({ evidenceTaxYears: coverage.evidenceTaxYears }, taxYear);
    return !(producerEvidence || period.accountHasFactsInPeriod);
  }
  if (coverage.coveredFrom === null || coverage.coveredThrough === null) return false;
  const required = lifecycleBoundedPeriod(coverage.accountOpenedOn, coverage.accountClosedOn, coverage.evidenceTaxYears, period);
  // One-weekday payment reporting grace: the end (and a closure) must be reached by PCT, not raw coveredThrough.
  const pct = paymentsCoveredThrough(coverage.coveredThrough);
  return coverage.coveredFrom <= required.start && pct !== null && pct >= required.end;
}

/**
 * 1.6.0 (d152 doc42 §2.3, I7): whether one account's broker income for a period may be declared, i.e. whether the
 * period is filing-ready for that account. It is filing-ready when both hold:
 * - the period's coverage is final (`isBrokerAccountCoverageFinal`, every rule of it unchanged);
 * - no UK tax year the period touches is held by an unconfirmed item. A year is held when it is in the entry's own
 *   `unconfirmedTaxYears` (the rule of `isBrokerAccountTaxYearUnconfirmed`, applied to each year the period touches;
 *   a list that breaks the grammar holds every year), OR when the caller says so with
 *   `accountHasUnconfirmedItemsInPeriod`.
 * The caller can only ADD holds (for example, from an `'unconfirmed'` fact dated in the period), never remove one.
 *
 * An unconfirmed year is therefore coverage-final but NOT filing-ready: its figures are computed with the ratified
 * defaults and shown labelled, while filing waits for confirmation. Cutover and coverage are not affected. Requires
 * the full 1.6.0 entry (all but `brokerAccountRef`); a 1.5.0-shaped object does not type-check here, and at run time
 * an absent or malformed `unconfirmedTaxYears` holds every year.
 */
export function isBrokerAccountYearFilingReady(
  coverage: Omit<BrokerFactsAccountCoverage, 'brokerAccountRef'>,
  period: { start: string; end: string; accountHasFactsInPeriod: boolean; accountHasUnconfirmedItemsInPeriod: boolean },
): boolean {
  if (typeof period.accountHasUnconfirmedItemsInPeriod !== 'boolean' || period.accountHasUnconfirmedItemsInPeriod) return false;
  if (!isBrokerAccountCoverageFinal(coverage, period)) return false;
  // The period's dates are valid here (coverage finality checked them), so both labels exist. Labels 'YYYY-YY'
  // compare as their starting years, so the held years the period touches are exactly those in [first, last].
  const first = ukTaxYearLabelOfDate(period.start);
  const last = ukTaxYearLabelOfDate(period.end);
  if (first === null || last === null || !isBrokerFactsUnconfirmedTaxYears(coverage.unconfirmedTaxYears)) return false;
  return !coverage.unconfirmedTaxYears.some((taxYear) => taxYear >= first && taxYear <= last);
}

/**
 * The part of a period one account's statements must cover: from the later of the period start and the account's
 * opening, to the earlier of the period end and its closure (a `null` date = unknown, so the period's own bound).
 * The one place the run half of the year-final rule reads the opening and closure (the opened-after exemption above is
 * the other use of the opening). The producer decides which opening and closure dates are effective and sends them
 * (N1/N2, see `BrokerFactsAccountCoverage`). 0.18.10: a closure the account's own evidence contradicts
 * (`closureContradictedByEvidence`) is unknown here, whatever the producer sent.
 */
function lifecycleBoundedPeriod(openedOn: string | null, closedOn: string | null,
  evidenceTaxYears: BrokerFactsAccountCoverage['evidenceTaxYears'] | undefined, period: { start: string; end: string })
  : { start: string; end: string } {
  const closure = closedOn !== null && !closureContradictedByEvidence(closedOn, evidenceTaxYears) ? closedOn : null;
  return {
    start: openedOn !== null && openedOn > period.start ? openedOn : period.start,
    end: closure !== null && closure < period.end ? closure : period.end,
  };
}

/**
 * 0.18.10: whether an account's own evidence contradicts its closure: the producer's N2 rule (the close date sent is
 * on or after every evidence date) at the granularity the wire carries. Every date of a UK tax year after the
 * closure's follows the closure, so evidence in any such year contradicts it. Unknown evidence (`null`, absent, or
 * breaking the wire grammar) counts as evidence in every year, so it contradicts too (fail closed). Evidence in the
 * closure's own tax year cannot be ordered against it here; the producer's date-level rule covers that.
 */
function closureContradictedByEvidence(closedOn: string,
  evidenceTaxYears: BrokerFactsAccountCoverage['evidenceTaxYears'] | undefined): boolean {
  const closureYear = ukTaxYearLabelOfDate(closedOn);
  if (closureYear === null || evidenceTaxYears === undefined || evidenceTaxYears === null
    || !isBrokerFactsEvidenceTaxYears(evidenceTaxYears)) return true;
  return evidenceTaxYears.some((taxYear) => taxYear > closureYear);
}

/**
 * The producer serves no page (HTTP 409) while a cut-over scope of the caller cannot state its owned result, i.e.
 * while it awaits the owner's confirmation (authorization) of newer records. The consumer keeps its last complete
 * sync. 1.6.0: a `payment_missing` accrual with no D5 remedy no longer causes a 409. It is served as its unconfirmed
 * default (see `BrokerFactOwnershipMode`, D5).
 */
export interface BrokerFactsFeedResponse {
  schemaVersion: typeof BROKER_FACTS_FEED_SCHEMA_VERSION;
  facts: BrokerFact[];
  /** One entry per broker account of the caller, on every page (including an empty page). */
  coverage: BrokerFactsAccountCoverage[];
  nextCursor: string | null;
  hasMore: boolean;
}
