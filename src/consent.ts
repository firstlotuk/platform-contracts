/**
 * Platform consent-authority contracts (0.5.x-consent-authority-v1 Part C).
 *
 * Source of truth:
 *   specs/implementation/council/0.5.x-consent-authority-v1/02-approved-implementation-plan.md
 *   specs/platform/CONSENT_SERVICE_DESIGN_BRIEF.md
 *   data-protection-legal-determinations-matrix (L1/L2/L3/L7/L8/L10, provisional ~80%, counsel pre-GA)
 *
 * SCOPE: the complete shared-contract vocabulary for the consent-authority service —
 * closed vocabularies + fail-closed validators (§3.1), legal-artifact/evidence/event types (§3.2),
 * the append-only ConsentEvent vs derived ConsentProjection structural split (§3.3), the PDP query
 * contract (§3.4), the SLA reference (§3.5), and the d019 handler seam (§10). No route wiring,
 * no storage implementation, no service — those are the consent-authority service itself.
 *
 * Legal posture: built to the conservative provisional leans. A later counsel correction folds into
 * the record schema/artifact text, never a silent re-architecture. Diverge from the ratified spec
 * only by human decision (STOP-and-report).
 *
 * Key design invariants (enforced at the type level, §3.3):
 *  - ConsentEvent has NO `status` / `revokedAt` field — a revoke is a NEW event of kind 'revoke'
 *    linked by causationId, never a field mutation.
 *  - ConsentProjection carries `status`/`revokedAt` and is DERIVED / rebuildable — never the SoT.
 *  - legal_attestation records are non-withdrawable (L2 lean): isRevocable() returns false for that kind.
 *  - Scope must be purpose-bound (hasBoundScope()): no blanket-role records permitted (L1/D-006).
 */

import { AUTH_TOKEN_POLICY, SENSITIVE_OPERATIONS } from './auth';
type SensitiveOp = (typeof SENSITIVE_OPERATIONS)[number];

// ---------------------------------------------------------------------------
// §3.1 Closed vocabularies + fail-closed validators
// ---------------------------------------------------------------------------

/** The three consent/attestation record kinds in V1. */
export const CONSENT_KINDS = ['third_party_share', 'legal_attestation', 'internal_preference'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** True only if `s` is in the closed {@link CONSENT_KINDS} vocabulary (fail-closed lookup). */
export function isConsentKind(s: unknown): s is ConsentKind {
  return typeof s === 'string' && (CONSENT_KINDS as readonly string[]).includes(s);
}

/**
 * Purpose-bound acts that require recorded consent/attestation in V1. CLOSED here; an unknown
 * action fails closed (deny / never auto-allow). Each value reconciles to an existing PDP
 * PermissionAction / SENSITIVE_OPERATIONS in auth.ts (the conformance test asserts the map is
 * total so a new consent action cannot drift away from a PDP action). Extending the set is a
 * contract edit (PR-reviewed), never a runtime free string.
 */
export const CONSENT_ACTIONS = [
  'accountant.share',  // third_party_share → maps to access.grant / evidence_share
  'filing.submit',     // legal_attestation → SENSITIVE_OPERATIONS
  'filing.amend',      // legal_attestation
  'filing.withdraw',   // legal_attestation
] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

/** True only if `s` is in the closed {@link CONSENT_ACTIONS} vocabulary (fail-closed lookup). */
export function isConsentAction(s: unknown): s is ConsentAction {
  return typeof s === 'string' && (CONSENT_ACTIONS as readonly string[]).includes(s);
}

/**
 * Total reconciliation map: every {@link ConsentAction} → the {@link SensitiveOperation} it
 * corresponds to in `auth.ts`. CLOSED and exported so the conformance test can assert totality —
 * every consent action must have a valid target; `accountant.share` is explicitly covered
 * (reconciles to `access.grant`, which is a SENSITIVE_OPERATION). Extending `CONSENT_ACTIONS`
 * without adding an entry here is a build error (Record<ConsentAction, …> forces exhaustiveness).
 */
export const CONSENT_ACTION_RECONCILIATION_MAP: Record<ConsentAction, SensitiveOp> = {
  'accountant.share': 'access.grant',   // SENSITIVE_OPERATIONS member
  'filing.submit':    'filing.submit',   // SENSITIVE_OPERATIONS member
  'filing.amend':     'filing.amend',    // SENSITIVE_OPERATIONS member
  'filing.withdraw':  'filing.withdraw', // SENSITIVE_OPERATIONS member
} as const;

/**
 * The marker proving HOW strongly the principal authenticated when they consented.
 * CLOSED + owned here; unknown ⇒ treated as the WEAKEST level (fail-closed), never
 * accepted as 'sca'.
 */
export const CONSENT_AUTH_LEVELS = ['password', 'mfa', 'sca', 'step_up'] as const;
export type ConsentAuthLevel = (typeof CONSENT_AUTH_LEVELS)[number];

/** True only if `s` is in the closed {@link CONSENT_AUTH_LEVELS} vocabulary (fail-closed). */
export function isConsentAuthLevel(s: unknown): s is ConsentAuthLevel {
  return typeof s === 'string' && (CONSENT_AUTH_LEVELS as readonly string[]).includes(s);
}

/** Resource taxonomy — designed-in for d019 (content/metadata classification). */
export const CONSENT_RESOURCE_KINDS = [
  'app', 'filing_case', 'tax_year', 'document', 'mandate',
] as const;
export type ConsentResourceKind = (typeof CONSENT_RESOURCE_KINDS)[number];

/** Compliance-trail event names — CLOSED. */
export const CONSENT_AUDIT_EVENTS = [
  'granted', 'revoked', 'expired', 'superseded', 'queried',
] as const;
export type ConsentAuditEvent = (typeof CONSENT_AUDIT_EVENTS)[number];

/**
 * Projected status — the derived view only (L7). NEVER an appended field; exists only on
 * {@link ConsentProjection}, which is folded from the event chain (§3.3).
 */
export const CONSENT_STATUSES = ['granted', 'revoked', 'expired'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// §3.2 Legal-artifact reference, evidence, event envelope, scope
// ---------------------------------------------------------------------------

/** Legal-artifact registry reference (D-008). Stores the reference, NOT the wording. */
export interface LegalArtifactRef {
  version:     string; // owner/legal-owned text version id
  contentHash: string; // hash of the exact presented text
  locale:      string;
}

/** Strong-auth evidence at consent time (D-009). Ties to step-up contract in authz.ts. */
export interface ConsentEvidence {
  sessionJti: string;
  authLevel:  ConsentAuthLevel; // CLOSED vocab (§3.1), not an open string
  at:         string;           // ISO-8601
}

/**
 * Purpose-bound scope (D-006) — never a blanket role. Every record names the party/account/
 * purpose/tax-year. Use {@link hasBoundScope} to assert at least one binding is present.
 */
export interface ConsentScope {
  filingCaseId?: string;
  taxYear?:      string;              // YYYY-YY (platform-canonical)
  resourceKind?: ConsentResourceKind;
  resourceId?:   string;
  capabilities?: readonly string[];
  dataClasses?:  readonly string[];
}

/** Event envelope + correlation ids (designed-in for d019 causation chain). */
export interface ConsentEventEnvelope {
  envelopeVersion: 1;  // contract version pin
  eventId:         string; // unique per appended event
  correlationId:   string; // ties grant→revoke→supersede + the request that caused it
  causationId?:    string; // the prior eventId this one supersedes/answers
  occurredAt:      string; // ISO-8601, set by the writer, immutable
}

// ---------------------------------------------------------------------------
// §3.3 Append-only EVENT vs derived STATUS PROJECTION (D-004 — structural fix)
//
// ConsentEvent has NO `status` / `revokedAt` — a revoke is a NEW event of kind
// 'revoke', linked by the envelope's causationId (never a field edit). The status
// only appears on the DERIVED ConsentProjection, which is rebuildable from the
// event chain and never the source of truth.
// ---------------------------------------------------------------------------

export const CONSENT_EVENT_KINDS = ['grant', 'revoke', 'expire', 'supersede'] as const;
export type ConsentEventKind = (typeof CONSENT_EVENT_KINDS)[number];

/**
 * What gets APPENDED. Immutable once written. NO `status`, NO `revokedAt` — those are
 * on the DERIVED {@link ConsentProjection} only. A revoke is a new event of eventKind
 * 'revoke' linked by envelope.causationId; nothing is mutated in place.
 */
export interface ConsentEvent {
  readonly envelope:     ConsentEventEnvelope;
  readonly eventKind:    ConsentEventKind;
  readonly kind:         ConsentKind;
  readonly principalSub: string;        // gateway sub of the user who authorises
  readonly actorSub:     string;        // third party (share) or === principalSub
  readonly action:       ConsentAction; // CLOSED vocab (§3.1)
  readonly scope:        ConsentScope;  // purpose-bound (D-006)
  readonly artifact:     LegalArtifactRef;  // D-008
  readonly evidence:     ConsentEvidence;   // D-009
  readonly expiresAt?:   string;        // set on a grant; PSD2/clear-expiry lean
  readonly reason?:      string;        // revoke/supersede reason text
}

/**
 * What status() RETURNS and what the read-side cache holds. DERIVED by folding the event
 * chain (latest-event-wins within a (principalSub, action, scope) key). Persisted only as a
 * rebuildable projection; the ledger is the source of truth.
 *
 * The presence of `status`/`revokedAt` here — and their ABSENCE on {@link ConsentEvent} — is
 * the structural guarantee that no implementer can mutate a record in place.
 */
export interface ConsentProjection {
  status:        ConsentStatus;  // folded from the event chain
  principalSub:  string;
  action:        ConsentAction;
  scope:         ConsentScope;
  grantedAt:     string;
  expiresAt?:    string;
  revokedAt?:    string;         // present iff status === 'revoked'
  latestEventId: string;         // the event this projection was folded to
}

// ---------------------------------------------------------------------------
// §3.4 PDP query contract (D-005) — what the PDP calls; maps to DenyReason
// ---------------------------------------------------------------------------

export interface ConsentStatusQuery {
  principalSub: string;
  action:       ConsentAction;                          // CLOSED vocab (§3.1)
  scope:        Pick<ConsentScope, 'filingCaseId' | 'taxYear'>;
  sensitivity:  'standard' | 'sensitive';               // sensitive ⇒ live-check, never cache-only
}

/**
 * What status() returns. Maps to PDP DenyReason:
 *  - 'revoked' / 'none' → PDP deny('consent_required')
 *  - 'expired'          → PDP deny('expired')
 *  - 'none'             → deny-by-default (no record = deny, never allow)
 */
export type ConsentStatusResult =
  | { status: 'granted' }
  | { status: 'revoked' }  // → DenyReason 'consent_required'
  | { status: 'expired' }  // → DenyReason 'expired'
  | { status: 'none' };    // no record → 'consent_required' (deny-by-default)

// ---------------------------------------------------------------------------
// §3.5 Revocation/cache SLA — REUSE from auth.ts, do not redefine
// ---------------------------------------------------------------------------

/**
 * Consent-authority cache SLA constants. REUSES the ratified AUTH_TOKEN_POLICY values from
 * auth.ts so they cannot drift from the gateway values they must equal. Sensitive reads always
 * live-check; standard reads may be stale up to the permission-cache SLA (≤60 s); a revoke
 * invalidates the projection within the revocation SLA (30 s).
 */
export const CONSENT_CACHE_SLA = {
  sensitiveReadMode: 'live_only',                                                      // never cache
  standardReadMaxStalenessSeconds: AUTH_TOKEN_POLICY.permissionCachePropagationSlaSeconds, // ≤60
  revokeInvalidationSlaSeconds:    AUTH_TOKEN_POLICY.revocationCachePropagationSlaSeconds,  // 30
} as const;

// ---------------------------------------------------------------------------
// Semantic helpers (D-003/D-006 enforcement points the service calls)
// ---------------------------------------------------------------------------

/**
 * True iff a `kind` may transition to `status === 'revoked'` (D-003, L2 lean).
 * `legal_attestation` is a non-withdrawable authorization — its state machine forbids a
 * revoke transition; a correction is a NEW attestation event, never a retraction.
 * `third_party_share` (GDPR consent, L1) and `internal_preference` are revocable.
 *
 * The service MUST call this before appending a 'revoke' event and reject if false.
 */
export function isRevocable(kind: ConsentKind): boolean {
  return kind !== 'legal_attestation';
}

/**
 * True iff `scope` contains at least one CONCRETE binding (D-006, L1 lean). The consent
 * authority MUST reject a record with no party/account/purpose/tax-year binding — no
 * blanket-role consent is permitted.
 *
 * V1 scope identity is **case/year level** (`filingCaseId` or `taxYear`) — the same identity the
 * `ConsentStatusQuery` contract carries, so every bound record is servable by `status()` (G-010,
 * Option A). `resourceKind`/`resourceId` (resource-level consent) are deferred (Option B): they are
 * NOT a V1 bound scope and `record()` rejects records that carry them.
 */
export function hasBoundScope(scope: ConsentScope): boolean {
  return !!(scope.filingCaseId || scope.taxYear);
}

/**
 * Closed kind/action policy (G-008, approved plan §4/§11 items 4 and 8): each ConsentAction
 * is bound to exactly one ConsentKind. The service MUST validate this pair before appending any
 * event — a mismatched pair would allow a filing attestation to appear revocable (HMRC retraction)
 * or an accountant mandate to appear non-withdrawable.
 *
 *   accountant.share → third_party_share   (GDPR consent, revocable, Art 6(1)(a), L1)
 *   filing.submit    → legal_attestation   (non-withdrawable authorization, L2 lean)
 *   filing.amend     → legal_attestation
 *   filing.withdraw  → legal_attestation
 *
 * internal_preference has no V1 outward action — the type exists at the contract level (§9)
 * but no valid (internal_preference, outward ConsentAction) pair exists in V1, so it can never
 * satisfy an outward PDP status() query.
 */
export const CONSENT_KIND_ACTION_POLICY: Record<ConsentAction, ConsentKind> = {
  'accountant.share': 'third_party_share',
  'filing.submit':    'legal_attestation',
  'filing.amend':     'legal_attestation',
  'filing.withdraw':  'legal_attestation',
} as const;

/**
 * True iff `kind` is the required kind for `action` per the closed policy (G-008).
 * Any event with a mismatched kind/action pair MUST be rejected fail-closed — the service
 * calls this in both record() and revoke() before appending.
 */
export function isValidKindActionPair(kind: ConsentKind, action: ConsentAction): boolean {
  return CONSENT_KIND_ACTION_POLICY[action] === kind;
}

// ---------------------------------------------------------------------------
// §10 d019 handler seam — designed-in, NOT implemented in V1
//
// The standard triplet d019 will call. Exported here so d019 imports the
// contract (content|metadata tagging, export/erase/classify signatures) without
// rework. Implementation + orchestration is d019 (legal-gated, named deferral).
// ---------------------------------------------------------------------------

/** Content vs metadata tag — every export/inventory item is tagged (Art.20 portability vs L7 defence evidence). */
export type DataTag = 'content' | 'metadata';

export interface ExportItem {
  tag:       DataTag;
  recordRef: string;
  payload:   unknown;
}

export interface ExportBundle {
  sub:   string;
  items: readonly ExportItem[];
}

export type EraseMode = 'closure' | 'erasure';

export interface EraseResult {
  removed:    readonly string[]; // recordRefs suppressed/pseudonymised
  retained:   readonly string[]; // recordRefs kept (L7 = defence evidence)
  failClosed: true;              // unknown ⇒ retain + report, never silent delete
}

export interface InventoryReport {
  sub:  string;
  held: readonly { resourceKind: ConsentResourceKind; count: number; tag: DataTag }[];
}

/**
 * The standard triplet d019 will call (§10). Designed-in at the contract level now so d019
 * can import the interface without rework. Implementation + orchestration is d019
 * (legal-gated, named deferral — NOT built in V1).
 */
export interface SubjectDataHandler {
  export(sub: string, scope?: ConsentScope): Promise<ExportBundle>;
  erase(sub: string, mode: EraseMode): Promise<EraseResult>;
  classify(sub: string): Promise<InventoryReport>;
}
