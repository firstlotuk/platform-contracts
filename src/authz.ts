/**
 * The PDP front door (0.5.5 D-009 Phase D / Workstream 4).
 *
 * Source of truth:
 *   specs/security/AUTHORIZATION_MODEL.md §2 (the PDP front door), §4 (action vocabulary),
 *   §6 (build-now-vs-defer), §9 (sequencing)
 *   specs/security/API_GATEWAY_AUTH_SECURITY_ARCHITECTURE.md §8 / D0.6 (PDP home = in-process
 *     platform-contracts library; verify-side composed ONTO, not re-scoped)
 *
 * SCOPE: the in-process authorization SHAPE + the deny-by-default / fail-CLOSED evaluator wrapper.
 * This is the resource-layer Policy Decision Point — NOT the only gate (a future BFF does coarse
 * auth; INGRESS_AND_BFF_TOPOLOGY §3). The cgt-app policy CONTENT (role → entitlement → masking)
 * plugs in via {@link PolicyFn} in Phase E; this module ships no app policy of its own.
 *
 * Hard invariants (AUTHORIZATION_MODEL §2):
 *  - deny-by-default: an unknown action, an absent decision, or a malformed result DENIES.
 *  - fail-CLOSED: any thrown policy/cache exception DENIES — there is no fall-through-to-allow path.
 *    (Mirrors the verifier's unknown-operation ⇒ sensitive behaviour.)
 *  - require_step_up is EMITTED only; the /auth/step-up issuance endpoint is the gateway track.
 *  - ActingContext (the mandate axis) is a RESERVED, inert input — NO mandate policy ships (B4-gated).
 */

import type { GatewayActor, PermissionAction, VerificationFreshness } from './auth';
import { isPermissionAction } from './auth';

// ---------------------------------------------------------------------------
// Decision shape (AUTHORIZATION_MODEL §2) — what every authorize() call returns.
// ---------------------------------------------------------------------------

/** Why access was denied (deny effect). Drives the response class (404 vs 403 vs locked …). */
export const DENY_REASONS = ['not_found', 'forbidden', 'locked', 'consent_required', 'expired'] as const;
export type DenyReason = (typeof DENY_REASONS)[number];

/** Masking strategies for `allow_with_masking`. */
export const MASK_KINDS = ['block', 'field_mask', 'deep_mask', 'multi_year'] as const;
export type MaskKind = (typeof MASK_KINDS)[number];

/**
 * How to re-mask an otherwise-allowed response (AUTHORIZATION_MODEL §2). `field_mask` nulls named
 * top-level fields; `deep_mask` nulls named fields anywhere in the tree; `multi_year` masks the
 * named locked tax years; `block` withholds the whole payload (an in-band block, distinct from a
 * hard `deny('locked')`).
 */
export type MaskSpec =
  | { kind: 'block' }
  | { kind: 'field_mask'; fields: readonly string[] }
  | { kind: 'deep_mask'; fields: readonly string[] }
  | { kind: 'multi_year'; years: readonly string[]; fields?: readonly string[] };

/** Obligations a `require_step_up` decision carries — the PDP EMITS these; issuance is gateway work. */
export interface StepUpObligations {
  /** The operation that triggered step-up (for the gateway's /auth/step-up challenge + audit). */
  operation: string;
  /** Max acceptable auth age (seconds) for this operation; owner-confirmed default 5 min. */
  maxAuthAgeSeconds: number;
}

/**
 * The PDP decision (AUTHORIZATION_MODEL §2). A closed, discriminated union on `effect` so every
 * consumer must handle each case and a new effect is a compile error, not a silent allow.
 */
export type Decision =
  | { effect: 'allow' }
  | { effect: 'deny'; reason: DenyReason }
  | { effect: 'allow_with_masking'; mask: MaskSpec }
  | { effect: 'allow_readonly'; scope?: string }
  | { effect: 'require_step_up'; obligations: StepUpObligations };

// Decision constructors — keep call sites terse and the shapes consistent.
export const allow = (): Decision => ({ effect: 'allow' });
export const deny = (reason: DenyReason): Decision => ({ effect: 'deny', reason });
export const allowWithMasking = (mask: MaskSpec): Decision => ({ effect: 'allow_with_masking', mask });
export const allowReadonly = (scope?: string): Decision => ({ effect: 'allow_readonly', scope });
export const requireStepUp = (obligations: StepUpObligations): Decision => ({
  effect: 'require_step_up',
  obligations,
});

/** True only if `d` actually grants access (allow / masked / readonly). A deny or require_step_up does NOT. */
export function grantsAccess(d: Decision): boolean {
  return d.effect === 'allow' || d.effect === 'allow_with_masking' || d.effect === 'allow_readonly';
}

// ---------------------------------------------------------------------------
// Authorize inputs.
// ---------------------------------------------------------------------------

/** An opaque, explicitly-scoped reference to the resource being authorized. NEVER an authZ claim. */
export interface ResourceRef {
  /** Resource kind, e.g. 'cgt.return', 'document', 'filing.case'. */
  type: string;
  /** Owner subject (the platform `sub`) this resource belongs to, when known — for relationship checks. */
  ownerSub?: string;
  /** Domain id of the resource (routing hint only), e.g. a tax year, document id. */
  id?: string;
  /** Free-form, policy-interpreted attributes (e.g. taxYear, locked) — never trusted as identity. */
  attributes?: Readonly<Record<string, unknown>>;
}

/**
 * The mandate axis (AUTHORIZATION_MODEL §5) — a RESERVED, inert input slot. The PDP signature accepts
 * it so the relationship/mandate stage exists, but NO mandate policy is written and nothing reads it
 * (B4 legal-gated; schema NOT frozen). A reviewer must read this as reserved, not active.
 */
export interface ActingContext {
  /** The subject on whose behalf the actor is acting, if delegated. Inert in this slice. */
  onBehalfOfSub?: string;
  /** Opaque mandate/grant id. Inert in this slice. */
  mandateId?: string;
}

/** Context the PDP composes onto the verified actor. */
export interface AuthorizeContext {
  /** When the actor last authenticated (ISO) — drives step-up freshness. Usually GatewayActor.authTime. */
  authTime?: string;
  /** The verified-context freshness, when the caller has it (cache vs live introspection). */
  freshness?: VerificationFreshness;
  /** RESERVED mandate axis (B4-gated). Accepted but never read by any shipped policy. */
  acting?: ActingContext;
  /** "Now" for deterministic step-up tests; defaults to the call time. */
  now?: Date;
}

/** The resolved input a {@link PolicyFn} receives (action is a validated PermissionAction). */
export interface ResolvedAuthorizeInput {
  actor: GatewayActor;
  action: PermissionAction;
  resource: ResourceRef;
  context: AuthorizeContext;
}

/**
 * The app-supplied policy (Phase E plugs cgt-app content in here). Runs role → entitlement →
 * relationship/mandate → masking and returns a {@link Decision}. May throw — the front door catches
 * and fails CLOSED. Returning a non-Decision is treated as deny-by-default.
 */
export type PolicyFn = (input: ResolvedAuthorizeInput) => Decision;

// ---------------------------------------------------------------------------
// Step-up freshness (AUTHORIZATION_MODEL §3) — PDP reads authTime/freshness, EMITS the obligation.
// ---------------------------------------------------------------------------

/** Owner-confirmed max auth age for a step-up-requiring sensitive operation (5 minutes). */
export const STEP_UP_MAX_AUTH_AGE_SECONDS = 300 as const;

/**
 * True when `authTime` is within `maxAgeSeconds` of `now` — i.e. auth is fresh enough to skip step-up.
 * Fail-CLOSED: a missing/unparseable `authTime`, or a future/NaN value, is NOT fresh (returns false),
 * so the caller emits require_step_up rather than silently allowing on a malformed timestamp.
 */
export function isAuthFresh(
  authTime: string | undefined,
  now: Date,
  maxAgeSeconds: number = STEP_UP_MAX_AUTH_AGE_SECONDS,
): boolean {
  if (!authTime) return false;
  const authMs = Date.parse(authTime);
  if (Number.isNaN(authMs)) return false;
  const ageSeconds = (now.getTime() - authMs) / 1000;
  if (ageSeconds < 0) return false; // authTime in the future — treat as not fresh (fail-closed)
  return ageSeconds <= maxAgeSeconds;
}

// ---------------------------------------------------------------------------
// authorize() — the deny-by-default, fail-CLOSED front door (AUTHORIZATION_MODEL §2).
// ---------------------------------------------------------------------------

/**
 * The PDP front door. Validates the action against the canonical {@link PermissionAction} vocabulary,
 * delegates to the app `policy`, and enforces the hard invariants around it:
 *
 *  - unknown action ⇒ deny('forbidden')  (deny-by-default; the policy is never consulted)
 *  - policy throws  ⇒ deny('forbidden')  (fail-CLOSED — covers any policy/cache exception)
 *  - policy returns a non-Decision ⇒ deny('forbidden')  (no fall-through-to-allow)
 *
 * In-process: no network hop (D0.6). The signature mirrors AUTHORIZATION_MODEL §2's
 * `authorize(actor, action, resource, context)`; `policy` is the pluggable resource-app content.
 */
export function authorize(
  actor: GatewayActor,
  action: PermissionAction | string,
  resource: ResourceRef,
  context: AuthorizeContext,
  policy: PolicyFn,
): Decision {
  // Deny-by-default: an action outside the canonical vocabulary is never authorized.
  if (!isPermissionAction(action)) {
    return deny('forbidden');
  }

  try {
    const decision = policy({ actor, action, resource, context });
    // A malformed/absent policy result must not fall through to allow.
    if (!isDecision(decision)) {
      return deny('forbidden');
    }
    return decision;
  } catch {
    // Fail-CLOSED on ANY policy/cache exception — no path reaches allow.
    return deny('forbidden');
  }
}

/** A non-empty array of strings — the field/year shape every populated mask variant requires. */
function isNonEmptyStringArray(v: unknown): v is readonly string[] {
  return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string');
}

/**
 * Structural guard: is `value` a fully-formed {@link MaskSpec}? Validates EACH variant's payload, not
 * just `kind` — a `field_mask`/`deep_mask` with no `fields`, or a `multi_year` with no `years`, is a
 * malformed mask and is REJECTED so the front door fails closed rather than granting a bad-mask result.
 *   - `block`              — kind only (withholds the whole payload).
 *   - `field_mask`/`deep_mask` — a non-empty readonly string[] of `fields`.
 *   - `multi_year`         — a non-empty string[] of `years`; optional `fields` must also be string[].
 */
export function isMaskSpec(value: unknown): value is MaskSpec {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  switch (kind) {
    case 'block':
      return true;
    case 'field_mask':
    case 'deep_mask':
      return isNonEmptyStringArray((value as { fields?: unknown }).fields);
    case 'multi_year': {
      if (!isNonEmptyStringArray((value as { years?: unknown }).years)) return false;
      const fields = (value as { fields?: unknown }).fields;
      // `fields` is optional, but when present it must be a non-empty string[] (no empty/garbage payload).
      return fields === undefined || isNonEmptyStringArray(fields);
    }
    default:
      return false;
  }
}

/** Structural guard: is `value` a well-formed {@link Decision}? Used to fail-closed on bad policy output. */
export function isDecision(value: unknown): value is Decision {
  if (!value || typeof value !== 'object') return false;
  const effect = (value as { effect?: unknown }).effect;
  switch (effect) {
    case 'allow':
    case 'allow_readonly':
      return true;
    case 'deny':
      return (DENY_REASONS as readonly string[]).includes((value as { reason?: unknown }).reason as string);
    case 'allow_with_masking':
      // Validate the mask payload fully — a malformed mask must NOT survive as a granted decision.
      return isMaskSpec((value as { mask?: unknown }).mask);
    case 'require_step_up': {
      const obl = (value as { obligations?: { operation?: unknown; maxAuthAgeSeconds?: unknown } }).obligations;
      return (
        !!obl &&
        typeof obl.operation === 'string' &&
        obl.operation.length > 0 &&
        typeof obl.maxAuthAgeSeconds === 'number' &&
        // Reject NaN / Infinity / negative ages — a malformed obligation fails closed.
        Number.isFinite(obl.maxAuthAgeSeconds) &&
        obl.maxAuthAgeSeconds >= 0
      );
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// requireDecision() — Decision → response class (AUTHORIZATION_MODEL §2).
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic response class for a {@link Decision}. The HTTP-framework adapter (cgt-app's
 * own requireDecision → NextResponse, Phase E) maps these to concrete responses; keeping the mapping
 * here means the deny→status contract has one source of truth and is unit-tested in the contracts.
 */
export const RESPONSE_CLASSES = [
  'ok',
  'masked',
  'readonly',
  'not_found',
  'forbidden',
  'entitlement_locked',
  'consent_required',
  'expired',
  'step_up',
] as const;
export type ResponseClass = (typeof RESPONSE_CLASSES)[number];

/** The resolved outcome a handler-facing guard returns: whether access is granted + how to respond. */
export interface DecisionOutcome {
  /** True only when the decision actually grants access (allow / masked / readonly). */
  granted: boolean;
  responseClass: ResponseClass;
  /** Suggested HTTP status for a denied/challenged decision; `null` when granted (handler proceeds). */
  status: number | null;
  /** The mask to apply when `responseClass === 'masked'`. */
  mask?: MaskSpec;
  /** The step-up obligations to surface when `responseClass === 'step_up'`. */
  obligations?: StepUpObligations;
}

/**
 * Map a {@link Decision} to its response class + HTTP status. Deny reasons map to:
 * not_found→404, forbidden→403, locked→403 (entitlement_locked), consent_required→403,
 * expired→401; require_step_up→401 (step_up challenge). A granted decision returns `status: null`
 * so the handler proceeds (applying the mask when present).
 */
export function requireDecision(decision: Decision): DecisionOutcome {
  switch (decision.effect) {
    case 'allow':
      return { granted: true, responseClass: 'ok', status: null };
    case 'allow_readonly':
      return { granted: true, responseClass: 'readonly', status: null };
    case 'allow_with_masking':
      return { granted: true, responseClass: 'masked', status: null, mask: decision.mask };
    case 'require_step_up':
      return { granted: false, responseClass: 'step_up', status: 401, obligations: decision.obligations };
    case 'deny':
      switch (decision.reason) {
        case 'not_found':
          return { granted: false, responseClass: 'not_found', status: 404 };
        case 'forbidden':
          return { granted: false, responseClass: 'forbidden', status: 403 };
        case 'locked':
          return { granted: false, responseClass: 'entitlement_locked', status: 403 };
        case 'consent_required':
          return { granted: false, responseClass: 'consent_required', status: 403 };
        case 'expired':
          return { granted: false, responseClass: 'expired', status: 401 };
      }
  }
}
