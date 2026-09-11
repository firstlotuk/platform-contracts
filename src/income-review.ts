/**
 * d144 R03/R04 — cross-app income review-reference contract.
 *
 * WHY THIS EXISTS (doc 40 WP1 ledger, rows R03 and R04):
 *
 * R03: firstlot-suite's `income-readiness.ts` treated EVERY non-jurisdiction 422 from
 * income-app as `unavailable/unsupported_year`, so a taxpayer whose foreign-tax-credit
 * figures merely needed review was told "Income data isn't available for 2024–25" — a
 * false claim about the tax year. The root cause is an untyped catch-all over an untyped
 * error body. The fix is a closed code table plus a total classifier, both of which live
 * HERE so the producer (income-app) and the consumer (firstlot-suite) cannot drift.
 *
 * R04: the refusal carried `{code, name, reason}` only — no way to say WHICH item needs
 * review — even though the raise sites had the identity in scope. `IncomeReviewRef` is
 * that identity, minimized.
 *
 * REDACTION CONTRACT (doc 40 R04; enforced by `src/__tests__/income-review.test.ts`):
 *
 *   > A cross-app review reference carries EXACTLY three fields — `reviewId`, `kind`,
 *   > `reason` — and nothing else. No amounts, no account numbers, no account names, no
 *   > country codes, no filenames, no document ids, no free text. `reason` is a fixed enum
 *   > member, never an interpolated sentence. The user-facing sentence stays in the single
 *   > top-level `error` string, which must not name a source either.
 *
 * A refusal body crosses an app boundary and is logged by whoever receives it, so it is
 * held to a tighter standard than the authenticated 200 body behind `income.status.read`.
 *
 * RUNTIME DOMAIN: pure types and pure functions. No Ajv, no `server-only`, no Node
 * built-ins — this module is on the browser-safe path (`./browser`) and is importable from
 * plain Node, Edge middleware and client components alike (FIR-579/FIR-584 boundary; see
 * the `src/browser.ts` banner and `__tests__/runtime-domain-boundary.test.ts`).
 */

import type { IncomeTaxAppOutput } from './income-tax';

// ---------------------------------------------------------------------------
// 1. IncomeReviewRef — the minimized, redaction-safe identity
// ---------------------------------------------------------------------------

/**
 * What sort of thing needs review. Coarse on purpose: fine enough to route a
 * taxpayer to the right surface, too coarse to identify a counterparty, an
 * instrument or an amount.
 */
export const INCOME_REVIEW_KINDS = [
  /** A legacy withholding row (`tax_figures`) whose source attribution is ambiguous. */
  'legacy_withholding',
  /** A fact ingested from the CGT capture ledger via the broker-facts feed. */
  'broker_fact',
  /** An income row whose classification (interest / dividend / other) is unresolved. */
  'income_classification',
  /** A projected foreign-income box entry awaiting evidence or attribution. */
  'foreign_projection',
] as const;

export type IncomeReviewKind = (typeof INCOME_REVIEW_KINDS)[number];

export function isIncomeReviewKind(value: unknown): value is IncomeReviewKind {
  return typeof value === 'string' && (INCOME_REVIEW_KINDS as readonly string[]).includes(value);
}

/**
 * `FTCR_REVIEW_REQUIRED` reasons — income-app `FtcrReviewRequiredError`
 * (`src/services/tax/ftcr-review.ts:5`), raised at five sites. Already closed at the
 * producer; mirrored here so the consumer shares the vocabulary.
 */
export const INCOME_FTCR_REVIEW_REASONS = [
  'serial_attribution_required',
  'source_attribution_required',
  'treaty_evidence_required',
  'invalid_amount',
] as const;
export type IncomeFtcrReviewReason = (typeof INCOME_FTCR_REVIEW_REASONS)[number];

/**
 * `FOREIGN_INCOME_REVIEW_REQUIRED` reasons — the quarantine atoms produced by income-app's
 * foreign-income projection (`src/services/foreign-income/projection.ts`). The `state:
 * 'ready'` atoms (`eligible`, `sa106_required`, `sa106_route_selected`,
 * `other_foreign_income_requires_sa106`) are deliberately ABSENT: the refusal filters on
 * `state !== 'ready'`, so a ready atom can never be a reason something needs review, and
 * admitting it here would let a producer claim review on a settled projection.
 *
 * `late_fact_received` is included although the `is_current = TRUE` reader filter means it
 * cannot reach a refusal today (`persistence.ts:153` writes it alongside
 * `projection_state = 'invalidated'`). It is a legal value of the column, so the consumer
 * should recognise rather than drop it if that filter ever changes.
 */
export const FOREIGN_PROJECTION_REVIEW_REASONS = [
  'source_fact_review_pending',
  'source_fact_inactive',
  'source_fact_superseded',
  'event_type_unclassified',
  'payment_date_missing',
  'source_country_unresolved',
  'account_ownership_unresolved',
  'joint_account_quarantine',
  'tax_exempt_account',
  'gross_amount_invalid',
  'withholding_evidence_missing',
  'withholding_amount_invalid',
  'withholding_exceeds_gross',
  'settlement_recognition_required',
  'fx_unresolved',
  'interest_amount_basis_unresolved',
  'dividend_amount_basis_unresolved',
  'tax_year_rule_missing',
  'related_fact_requires_review',
  'total_dividend_context_unresolved',
  'remittance_basis_requires_sa106',
  'fig_claim_requires_sa106',
  'foreign_dividend_election_required',
  'late_fact_received',
] as const;
export type ForeignProjectionReviewReason = (typeof FOREIGN_PROJECTION_REVIEW_REASONS)[number];

/**
 * Machine reason codes. CLOSED union — never an interpolated sentence, and never the
 * comma-joined multi-atom string the projection column holds today (see
 * `expandIncomeReviewRef`).
 *
 * Every member matches `INCOME_REVIEW_REASON_SHAPE`: lower_snake_case, no whitespace, no
 * currency, no decimal point, no path separator. The redaction test asserts that shape
 * over the whole vocabulary, so a sentence, a filename or an amount cannot be smuggled in
 * by adding a member. A consumer that meets an unrecognised reason must degrade, not
 * guess — see `isIncomeReviewReason`.
 */
export const INCOME_REVIEW_REASONS = [
  ...INCOME_FTCR_REVIEW_REASONS,
  ...FOREIGN_PROJECTION_REVIEW_REASONS,
] as const;

export type IncomeReviewReason = IncomeFtcrReviewReason | ForeignProjectionReviewReason;

/**
 * The permitted SHAPE of a reason member — the executable half of "never an interpolated
 * sentence". Rejects whitespace, `£`/`$`/`€`, `.` (so no `statement.pdf`, no `1234.56`),
 * `,` (so no comma-joined atom list), `/`, and any uppercase (so no `GB` country code).
 * Digits are permitted only inside a word, because HMRC form names are part of the
 * vocabulary (`remittance_basis_requires_sa106`).
 */
export const INCOME_REVIEW_REASON_SHAPE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export function isIncomeReviewReason(value: unknown): value is IncomeReviewReason {
  return typeof value === 'string' && (INCOME_REVIEW_REASONS as readonly string[]).includes(value);
}

/**
 * The permitted SHAPE of a `reviewId` (d144 R18).
 *
 * The producer mints `ir1` + `base64url(HMAC-SHA256(key, canonical-scope))` truncated to
 * 22 characters (income-app `src/services/tax/review-ref.ts`). A genuine handle is
 * therefore the public prefix plus 22 characters of the base64url alphabet
 * `A-Z a-z 0-9 - _` — no padding, no `+`, no `/`, no `.`.
 *
 * THIS CHECK IS NAMESPACED SHAPE DEFENCE, NOT AN OPACITY PROOF. Opacity is the HMAC
 * construction and the private `INCOME_REVIEW_ID_KEY` that never leaves income-app. The
 * consumer cannot verify provenance without that key, and must not be given it. The
 * regex rejects obvious leaks (`'77213'`, `'statement.pdf'`, a UUID, the unprefixed
 * 22-character database-key `'income_review_00000001'`). A regression that emits the
 * prefix plus 22 legal characters — including `'ir1' + 'income_review_00000001'` —
 * still passes. Do not describe this guard as proving the value is unguessable.
 *
 * A handle that fails this test drops the whole reference (`parseIncomeReviewRef` → `null`),
 * exactly as an unrecognised `kind` or a free-text `reason` does: a malformed reference is
 * never repaired, relayed or guessed at.
 *
 * CHANGING THE PREFIX OR PAYLOAD LENGTH IS A CONTRACT CHANGE. Producer and consumer move
 * together; outstanding handles are invalidated — the same coupling the
 * `REVIEW_ID_SCOPE` version string already has.
 */
export const INCOME_REVIEW_ID_PREFIX = 'ir1';

export const INCOME_REVIEW_ID_PAYLOAD_LENGTH = 22;

export const INCOME_REVIEW_ID_LENGTH =
  INCOME_REVIEW_ID_PREFIX.length + INCOME_REVIEW_ID_PAYLOAD_LENGTH;

export const INCOME_REVIEW_ID_SHAPE = /^ir1[A-Za-z0-9_-]{22}$/;

export function isIncomeReviewId(value: unknown): value is string {
  return typeof value === 'string' && INCOME_REVIEW_ID_SHAPE.test(value);
}

/**
 * A pointer to one thing the taxpayer must resolve before the return can be computed.
 *
 * `reviewId` is an HMAC handle, not a raw database primary key: non-enumerable and
 * scoped to one (taxpayer, tax year), so possessing one proves nothing and reveals no row
 * cardinality. The consumer shape check does not establish that property — see
 * `INCOME_REVIEW_ID_SHAPE`. Resolution goes through the existing `income.status.read`
 * action via the single `authorize()` front door (AUTHORIZATION_MODEL §2/§4); a handle for
 * another taxpayer, another year, or a rotated key yields `deny_not_found` → 404,
 * byte-identical to a handle that never existed (§2: confirming existence is itself a
 * disclosure).
 *
 * DO NOT ADD FIELDS. The redaction contract in this module's banner is enforced both at
 * compile time (`_incomeReviewRefFieldParity` below) and at run time (the redaction test).
 */
export interface IncomeReviewRef {
  reviewId: string;
  kind: IncomeReviewKind;
  reason: IncomeReviewReason;
}

/**
 * The redaction contract as DATA: the complete, closed list of permitted field names.
 *
 * `parseIncomeReviewRef` projects an untrusted object down to exactly these keys, so a
 * producer that leaks an amount or a filename has it stripped at the boundary rather than
 * relayed. The compile-time parity check below makes this list and `keyof IncomeReviewRef`
 * mutually exhaustive: adding a field to the interface without adding it here (or vice
 * versa) is a TYPE ERROR, and adding it to both turns the redaction test red.
 */
export const INCOME_REVIEW_REF_FIELDS = ['reviewId', 'kind', 'reason'] as const;

export type IncomeReviewRefField = (typeof INCOME_REVIEW_REF_FIELDS)[number];

/* Compile-time redaction guard — both directions. Do not delete. */
type _RefKeysAreListed = Exclude<keyof IncomeReviewRef, IncomeReviewRefField> extends never ? true : false;
type _ListedAreRefKeys = Exclude<IncomeReviewRefField, keyof IncomeReviewRef> extends never ? true : false;
const _incomeReviewRefFieldParity: [_RefKeysAreListed, _ListedAreRefKeys] = [true, true];
void _incomeReviewRefFieldParity;

/**
 * Parse ONE untrusted review reference, projecting down to exactly the three permitted
 * fields. Returns `null` — never throws — when the value is not a usable reference, so a
 * single malformed entry from an older producer drops out instead of failing the whole
 * refusal. A free-text `reason` is rejected here, and so is a `reviewId` that is not the
 * prefixed producer handle: that is the redaction rule, executable.
 *
 * The pre-d144 `FOREIGN_INCOME_REVIEW_REQUIRED` item shape (`sa-output/route.ts:88-97` —
 * `{sourceEventId, reason}`, the reason comma-joined) therefore yields `null` and DROPS.
 * That is correct, not a regression: `sourceEventId` is a raw identifier the redaction
 * rule forbids relaying, and a comma-joined reason is not an enum member. The income-app
 * lane migrates that emit site to `{reviewId, kind, reason}` via `expandIncomeReviewRef`;
 * until it does, a Suite on this contract shows the refusal with zero located items rather
 * than leaking an id or inventing one.
 */
export function parseIncomeReviewRef(value: unknown): IncomeReviewRef | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const reviewId = candidate.reviewId;
  // Not "a non-empty string": the FIXED producer handle shape. See `INCOME_REVIEW_ID_SHAPE`
  // — a raw row id, a filename or a UUID in this field drops the reference here.
  if (!isIncomeReviewId(reviewId)) return null;
  if (!isIncomeReviewKind(candidate.kind)) return null;
  if (!isIncomeReviewReason(candidate.reason)) return null;
  // Rebuilt field by field, NOT spread: anything the producer added is dropped here.
  return { reviewId, kind: candidate.kind, reason: candidate.reason };
}

/** Parse an untrusted `reviewItems` array; absent/!array ⇒ `[]`, malformed entries dropped. */
export function parseIncomeReviewRefs(value: unknown): IncomeReviewRef[] {
  if (!Array.isArray(value)) return [];
  const parsed: IncomeReviewRef[] = [];
  for (const entry of value) {
    const ref = parseIncomeReviewRef(entry);
    if (ref !== null) parsed.push(ref);
  }
  return parsed;
}

/**
 * Fan a producer-side record whose `reason` is the projection column's COMMA-JOINED atom
 * list (`projection.ts:99` — `reason: reasons.join(',')`, e.g.
 * `"source_country_unresolved,fx_unresolved"`) into one `IncomeReviewRef` per recognised
 * atom, in order, deduplicated.
 *
 * This exists because `IncomeReviewRef.reason` is ONE enum member by contract, and the
 * producer must not be tempted to satisfy that by concatenating or by inventing a summary
 * sentence. Unrecognised atoms are dropped rather than relayed as free text. An empty
 * result means nothing recognisable was supplied — emit no ref, not a guess.
 *
 * Intended for the income-app lane at the emit site. A consumer should never need it: by
 * the time a refusal crosses the boundary the atoms are already separate refs.
 */
export function expandIncomeReviewRef(input: {
  reviewId: string;
  kind: IncomeReviewKind;
  reason: string;
}): IncomeReviewRef[] {
  if (!isIncomeReviewId(input.reviewId)) return [];
  if (!isIncomeReviewKind(input.kind)) return [];
  if (typeof input.reason !== 'string') return [];
  const seen = new Set<string>();
  const refs: IncomeReviewRef[] = [];
  for (const atom of input.reason.split(',')) {
    const trimmed = atom.trim();
    if (!isIncomeReviewReason(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    refs.push({ reviewId: input.reviewId, kind: input.kind, reason: trimmed });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// 2. The error envelope and its code table
// ---------------------------------------------------------------------------

/** 422 codes that mean "the taxpayer has work to do", NOT "this year is unsupported". */
export const INCOME_REVIEW_REQUIRED_CODES = [
  'FTCR_REVIEW_REQUIRED',
  'FOREIGN_INCOME_REVIEW_REQUIRED',
] as const;
export type IncomeReviewRequiredCode = (typeof INCOME_REVIEW_REQUIRED_CODES)[number];

/** 422 codes that mean "income-app will not compute this at all". */
export const INCOME_BLOCKING_CODES = ['JURISDICTION_UNKNOWN', 'JURISDICTION_UNSUPPORTED'] as const;
export type IncomeBlockingCode = (typeof INCOME_BLOCKING_CODES)[number];

export type IncomeKnownErrorCode = IncomeReviewRequiredCode | IncomeBlockingCode;

/**
 * EXHAUSTIVE disposition table. The mapped type means a code added to either union above
 * without a row here is a compile error — you cannot widen the vocabulary and forget to
 * say what the code means.
 */
export const INCOME_ERROR_CODE_DISPOSITION: {
  readonly [K in IncomeKnownErrorCode]: K extends IncomeReviewRequiredCode ? 'review_required' : 'blocked';
} = {
  FTCR_REVIEW_REQUIRED: 'review_required',
  FOREIGN_INCOME_REVIEW_REQUIRED: 'review_required',
  JURISDICTION_UNKNOWN: 'blocked',
  JURISDICTION_UNSUPPORTED: 'blocked',
};

export function isIncomeReviewRequiredCode(value: unknown): value is IncomeReviewRequiredCode {
  return typeof value === 'string' && (INCOME_REVIEW_REQUIRED_CODES as readonly string[]).includes(value);
}

export function isIncomeBlockingCode(value: unknown): value is IncomeBlockingCode {
  return typeof value === 'string' && (INCOME_BLOCKING_CODES as readonly string[]).includes(value);
}

/**
 * The refusal body income-app puts on a 422 from `GET /api/child-app/status` and
 * `GET /api/sa-output`. The pre-d144 shape was `{error}` or `{error, code, reason}`;
 * `reviewItems` is the R04 addition.
 *
 * `code`/`reason` are typed as `string` on the WIRE deliberately — a Suite built today
 * must be able to receive a code a future income-app invents without a parse failure. The
 * narrowing to the closed unions happens in `classifyIncomeErrorEnvelope`, which is where
 * an unrecognised code becomes `unknown_child_error` rather than a guess.
 */
export interface IncomeErrorEnvelope {
  /** The user-facing sentence, authored by income-app. Must not name a source. */
  error: string;
  code?: string;
  reason?: string;
  reviewItems?: IncomeReviewRef[];
}

// ---------------------------------------------------------------------------
// 3. Disposition — why an unknown code CANNOT become a tax-year claim
// ---------------------------------------------------------------------------

export const INCOME_UNAVAILABLE_REASONS = [
  /** income-app cannot compute this tax year AT ALL. See the disposition note below. */
  'unsupported_year',
  'service_unavailable',
  'session_expired',
  /** d144 R03 — total fallback for a 422 whose code this consumer does not recognise. */
  'unknown_child_error',
] as const;
export type IncomeUnavailableReason = (typeof INCOME_UNAVAILABLE_REASONS)[number];

/**
 * The unavailable reasons a CODED refusal may map to. `'unsupported_year'` is excluded by
 * construction: a coded 422 can never claim the tax year is unsupported.
 */
export type IncomeCodedUnavailableReason = Exclude<IncomeUnavailableReason, 'unsupported_year'>;

/** The safe default for an unrecognised code. Typed so it cannot be `'unsupported_year'`. */
export const INCOME_UNKNOWN_CODE_REASON: IncomeCodedUnavailableReason = 'unknown_child_error';

/**
 * What a 422 envelope actually means.
 *
 * THE TYPE-LEVEL GUARANTEE (R03): the `'unsupported_year'` arm has NO `code` field — there
 * is nowhere to put one — so a coded refusal is not expressible as it. The only arm a
 * codeless 422 produces is `'unsupported_year'`, and the only arm an unrecognised code
 * produces is `'unknown_child_error'`. A consumer cannot reach the tax-year claim from an
 * unknown code by accident, because the classifier is total and the arm is unreachable
 * from any code-bearing input.
 */
export type IncomeErrorDisposition =
  | {
      disposition: 'review_required';
      code: IncomeReviewRequiredCode;
      /** `null` when the producer sent a reason this consumer does not recognise. */
      reason: IncomeReviewReason | null;
      message: string;
      reviewItems: IncomeReviewRef[];
    }
  | { disposition: 'blocked'; code: IncomeBlockingCode; message: string }
  /** The ONE true untyped-422 case: income-app's threshold loader has no data for the year. */
  | { disposition: 'unsupported_year' }
  | { disposition: 'unknown_child_error'; code: string; message: string };

/**
 * Total classifier for a 422 body. Never throws; every input lands on exactly one arm.
 *
 * - no `code` at all      → `unsupported_year`   (the threshold-loader case, and only it)
 * - a review code         → `review_required` + parsed, redacted `reviewItems`
 * - a blocking code       → `blocked`
 * - ANY other code        → `unknown_child_error` — never a tax-year claim
 */
export function classifyIncomeErrorEnvelope(body: unknown): IncomeErrorDisposition {
  const envelope = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const message = typeof envelope.error === 'string' ? envelope.error : '';
  const rawCode = envelope.code;

  if (typeof rawCode !== 'string' || rawCode.length === 0) {
    return { disposition: 'unsupported_year' };
  }
  if (isIncomeReviewRequiredCode(rawCode)) {
    return {
      disposition: 'review_required',
      code: rawCode,
      reason: isIncomeReviewReason(envelope.reason) ? envelope.reason : null,
      message,
      reviewItems: parseIncomeReviewRefs(envelope.reviewItems),
    };
  }
  if (isIncomeBlockingCode(rawCode)) {
    return { disposition: 'blocked', code: rawCode, message };
  }
  return { disposition: 'unknown_child_error', code: rawCode, message };
}

// ---------------------------------------------------------------------------
// 4. The Suite-facing readiness outcome
// ---------------------------------------------------------------------------

/**
 * The `review_required` arm doc 40 R03 specifies, exactly.
 *
 * `deepLink` is `string | null` because as of d144 WP1 income-app has NO review-resolver
 * surface: no page reads a review query param, and `firstlot-suite/src/lib/cgt-links.ts`
 * strips every launch param outside its allowlist. Until a resolver and an allowlist entry
 * both exist, the honest value is `null` and the Suite renders a plain "Open Income"
 * launch. NEVER fabricate a URL for a route that cannot resolve the handle.
 */
export interface IncomeReviewRequiredOutcome {
  kind: 'review_required';
  code: IncomeReviewRequiredCode;
  reason: IncomeReviewReason | null;
  /** income-app's user-facing sentence, relayed VERBATIM. Suite must not author its own. */
  message: string;
  reviewItems: IncomeReviewRef[];
  deepLink: string | null;
}

/**
 * The full outcome of a Suite → income-app status fetch.
 *
 * Exhaustive by construction: `assertNeverIncomeFetchOutcome` in a `default:` branch makes
 * a consumer that forgets an arm fail `tsc`, which is the other half of the R03 fix — the
 * catch-all that produced the false tax-year sentence cannot be re-introduced silently.
 */
export type IncomeFetchOutcome =
  | { kind: 'ok'; output: IncomeTaxAppOutput }
  | { kind: 'not_connected' }
  | { kind: 'blocked'; code: IncomeBlockingCode; message: string }
  | IncomeReviewRequiredOutcome
  | { kind: 'unavailable'; reason: IncomeUnavailableReason };

/** Exhaustiveness witness for `switch` over `IncomeFetchOutcome` / `IncomeErrorDisposition`. */
export function assertNeverIncomeFetchOutcome(value: never): never {
  throw new Error(`Unhandled income outcome: ${JSON.stringify(value)}`);
}
