/**
 * Platform auth contracts (0.5.5 Stage 1 — Auth / API-Gateway foundation).
 *
 * Source of truth:
 *   specs/security/API_GATEWAY_AUTH_SECURITY_ARCHITECTURE.md  (Task 0 baseline)
 *   specs/implementation/runs/phase-0.5.5/001-d0-decisions.md (D0 decisions)
 *
 * SCOPE: shared identity/session/verification TYPES plus the canonical contract
 * VALUES the gateway and every resource server must agree on. **No route wiring,
 * no token signer/verifier implementation, no gateway service** — those are later,
 * separately-gated stages.
 *
 * Trust model: the Auth Gateway authenticates the actor and owns the session/JTI.
 * Resource servers verify a gateway-issued actor context, then authorize SEPARATELY
 * via `can(actor, action, resource)`. Authorization is NEVER carried in token claims.
 */

// ---------------------------------------------------------------------------
// Closed unions — declared as `as const` value arrays so the canonical value
// list and the type cannot drift, and consumers can validate/iterate at runtime.
// ---------------------------------------------------------------------------

/** Intended token recipients. `aud` is mandatory and checked by resource servers. */
export const GATEWAY_AUDIENCES = [
  'firstlot-suite',
  'cgt-app',
  'income-app',
  'dms',
  'auth-gateway',
] as const;
export type GatewayAudience = (typeof GATEWAY_AUDIENCES)[number];

/** Coarse PLATFORM roles only — never taxpayer/resource ownership (D0.6). */
export const PLATFORM_ROLES = ['user', 'admin', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * External login providers the Auth Gateway may accept. These are upstream
 * authentication methods only; the gateway still mints the stable FirstLot `sub`
 * and owns sessions/JTI/revocation. Provider ids never become authZ proof.
 */
export const AUTH_LOGIN_PROVIDERS = ['email', 'google', 'apple', 'microsoft'] as const;
export type AuthLoginProvider = (typeof AUTH_LOGIN_PROVIDERS)[number];

export const TOKEN_CLASSES = [
  'browser_session',
  'browser_redirect_handshake',
  'service_handshake',
  // D-004: a genuinely user-less, session-less machine identity (no actor). Used
  // only to call introspection offline; never produces a `VerifiedActorContext`.
  'service_principal',
] as const;
export type TokenClass = (typeof TOKEN_CLASSES)[number];

/**
 * `child_app_status` is the gateway-era purpose for a service call into a child
 * app's status endpoint. NOTE (D0.5): the 0.5.4 income bridge token used
 * `suite_handshake`; the dual-accept verifier must map that legacy purpose during
 * the coexistence window.
 */
export const TOKEN_PURPOSES = [
  'browser_session',
  'suite_handshake',
  'child_app_status',
  'step_up',
  // D-004: the act of calling `POST /auth/introspect`. Allowed for `service_principal`
  // only (see TOKEN_CLASS_PURPOSE_MATRIX); no actor/browser/service_handshake class may carry it.
  'introspection',
  // D-010 S1 (B1): the gateway-minted downstream-actor token the BFF presents to a
  // private backend. Allowed for `service_handshake` ONLY (see TOKEN_CLASS_PURPOSE_MATRIX);
  // NEVER for `service_principal` — a service token carries no actor context. It is an
  // actor-bearing purpose: a B1 token still carries sub/roles/email/authTime/sessionJti.
  'downstream_actor',
  // D-010 S1 (B2): the BFF-issued (`iss=platform-bff`) per-request binding envelope that
  // pins a B1 token to one HTTP request. It is NOT a gateway token class and appears in NO
  // TOKEN_CLASS_PURPOSE_MATRIX row; it carries no sub/roles/resource claims of its own.
  'bff_request_binding',
] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

/** Which auth path produced the context — drives bridge-retirement telemetry (D0.5). */
export const TOKEN_SOURCES = [
  'gateway',
  'legacy_cgt_session',
  'legacy_income_bridge',
] as const;
export type TokenSource = (typeof TOKEN_SOURCES)[number];

/**
 * AuthZ action vocabulary (D0.6). Looked up via the permission boundary; NOT a claim.
 *
 * ONE canonical list (AUTHORIZATION_MODEL §4 / PLATFORM_SECURITY_BASELINE §10) — never forked. The
 * `document.*` actions are the canonical resource-authz names for the document/DMS domain; the
 * `dms.*` strings in {@link SENSITIVE_OPERATIONS} are live-introspection operation labels that each
 * RECONCILE to one of these actions (see {@link SENSITIVE_OPERATION_ACTION_MAP}), so there is no
 * parallel `dms.*` permission registry. The `cgt.*` action set (D-009 Phase D worked example) names
 * read vs export vs submit on a CGT return plus the admin year grant.
 */
export const PERMISSION_ACTIONS = [
  'filing.read',
  'filing.write',
  'income.status.read',
  'cgt.status.read',
  'document.read',
  'document.decrypt_for_extraction',
  // D-009 Phase C: canonical document-domain actions the dms.* sensitive ops reconcile to.
  'document.download',
  'document.export',
  'document.evidence_share',
  // D-009 Phase D: cgt-app worked-example actions (return read vs export vs submit; admin year grant).
  'cgt.return.read',
  'cgt.return.export',
  'cgt.return.submit',
  'cgt.year.grant',
  // D-009 Phase E (F1): the admin reference-data write the cgt-app F1 route is now expressed as a PDP
  // decision through (AUTHORIZATION_MODEL §9 — the original F1 admin gate, now PDP-backed, not file-gate).
  'reference_data.system_institution.write',
  'access.grant',
  'access.revoke',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** True only if `s` is in the closed {@link PERMISSION_ACTIONS} vocabulary (fail-closed lookup). */
export function isPermissionAction(s: string): s is PermissionAction {
  return (PERMISSION_ACTIONS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Actor — authN identity only. NEVER authorization.
// ---------------------------------------------------------------------------

export interface GatewayActor {
  /**
   * Opaque platform user id (D0.2). UUID/ULID-like — NOT an email, cgt/income
   * integer id, taxpayer id, filing-case id, or any resource id.
   */
  sub: string;
  /** Normalized; display / transition-join fallback only — never an authZ input. */
  email: string;
  /** Revocable session identifier; revocation is unified across derived tokens. */
  sessionJti: string;
  /** Coarse platform roles only. Scoped permissions are looked up, not claimed. */
  roles: PlatformRole[];
  /** Last authentication time (ISO); drives step-up / re-auth on sensitive ops. */
  authTime: string;
}

/**
 * Transition-only mapping to a legacy app identity. For migration + diagnostics
 * during the bridge coexistence window — NEVER an authorization input (D0.2/D0.5).
 */
export interface LegacyIdentityLink {
  app: 'cgt-app' | 'income-app';
  appUserId: string;
}

// ---------------------------------------------------------------------------
// Verification result — what a resource server's verifier returns.
// ---------------------------------------------------------------------------

export type VerificationFreshness =
  | { mode: 'local_cache'; checkedAt: string; cacheExpiresAt: string }
  | { mode: 'live_introspection'; checkedAt: string };

/**
 * Actor-token class/purpose: every class/purpose EXCEPT the non-user service ones
 * (D-004 isolation) and the BFF-issued B2 request-binding purpose (D-010 S1). The
 * `service_principal` class and `introspection` purpose belong to the separate service
 * path, and `bff_request_binding` is a BFF-issued per-request envelope that carries NO
 * actor context — none of these may EVER appear on a {@link VerifiedActorContext}.
 * Excluding them at the type level makes "a service_principal token never produces a
 * VerifiedActorContext" (plan §5) and "a B2 envelope never produces actor context"
 * compile-time guarantees, not only runtime ones.
 */
export type ActorTokenClass = Exclude<TokenClass, 'service_principal'>;
export type ActorTokenPurpose = Exclude<TokenPurpose, 'introspection' | 'bff_request_binding'>;

export interface VerifiedActorContext {
  actor: GatewayActor;
  audience: GatewayAudience;
  /** Actor classes only — `service_principal` is excluded by type (D-004). */
  tokenClass: ActorTokenClass;
  /** Actor purposes only — `introspection` is excluded by type (D-004). */
  purpose: ActorTokenPurpose;
  /** The accepted auth path (gateway vs a 0.5.4 legacy bridge). */
  source: TokenSource;
  verifiedAt: string;
  freshness: VerificationFreshness;
  /** Present only for legacy sources during the coexistence window. */
  legacyLink?: LegacyIdentityLink;
}

/**
 * The shared LIVE session-introspection contract (0.5.5 Stage 3A). ONE shape used by
 * BOTH the gateway introspection endpoint (`platform-gateway`) and the verifier's
 * injected `IntrospectionClient` (`@firstlot/gateway-verifier`), so the two sides
 * cannot drift on what is sent or returned.
 *
 * Transport: the caller sends the **raw `sessionJti`** (NOT a pre-hashed value); the
 * gateway hashes it once into `session_jti_hash` for lookup. A resource server must
 * never hash before calling, or the gateway would hash the hash and report active
 * sessions inactive.
 */
export interface SessionIntrospectionResult {
  /** Session row exists AND revoked_at IS NULL AND expires_at > now. */
  active: boolean;
  /** Session row exists AND revoked_at IS NOT NULL. */
  revoked: boolean;
}

// ---------------------------------------------------------------------------
// Canonical token/session policy values (D0.3). Single source of truth so the
// gateway and every resource server agree. All durations in SECONDS.
// ---------------------------------------------------------------------------

export const AUTH_TOKEN_POLICY = {
  /** Browser actor/access token TTL — short, bounded replay window. */
  browserSessionTtlSeconds: 600, // 10 min
  /** Service-to-service call handshake TTL. */
  serviceHandshakeTtlSeconds: 120, // 2 min
  /** Interactive browser-redirect SSO handshake TTL. */
  browserRedirectHandshakeTtlSeconds: 900, // 15 min
  /** D-004: non-user service-principal introspection-caller token TTL — short, bounded replay. */
  servicePrincipalTtlSeconds: 120, // 2 min
  /** Max time a revocation must propagate to local caches before fail-closed. */
  revocationCachePropagationSlaSeconds: 30,
  /** Max time a permission-grant change must propagate to caches. */
  permissionCachePropagationSlaSeconds: 60,
} as const;

/**
 * Operations that MUST verify via live gateway introspection, never cache-only
 * (D0.3). Stage 1 names them as a contract; route enforcement is a later stage.
 */
export const SENSITIVE_OPERATIONS = [
  'dms.decrypt',
  'dms.download',
  'dms.export',
  'dms.evidence_share',
  'auth.password_change',
  'auth.email_change',
  'auth.mfa_change',
  'auth.recovery',
  'auth.method_change',
  'access.grant',
  'access.revoke',
  'auth.break_glass',
  'filing.submit',
  'filing.amend',
  'filing.withdraw',
  'profile.identity_change',
  'session.revoke_all',
] as const;
export type SensitiveOperation = (typeof SENSITIVE_OPERATIONS)[number];

/**
 * Marker for a {@link SensitiveOperation} that has NO resource-authz {@link PermissionAction} — it is
 * gated by the gateway/auth domain (recovery gate, session, identity, break-glass), not by the
 * resource-server PDP. Recorded explicitly so "no PermissionAction" is a deliberate decision, never an
 * accidental orphan (PLATFORM_SECURITY_BASELINE §10 reconciliation invariant).
 */
export const SERVICE_ONLY = 'service_only' as const;
export type ServiceOnly = typeof SERVICE_ONLY;

/**
 * D-009 Phase C — the action-vocabulary RECONCILIATION (PLATFORM_SECURITY_BASELINE §10 /
 * AUTHORIZATION_MODEL §4). Every {@link SensitiveOperation} maps to EITHER a canonical registered
 * {@link PermissionAction} (resource-authz'd by the PDP) OR the explicit {@link SERVICE_ONLY} marker
 * (gateway/auth-domain ops with no resource action). This is the single canonical bridge between the
 * `dms.*` live-introspection labels and the `document.*` permission actions, so the two lists provably
 * cannot drift and there is no parallel `dms.*` permission registry.
 *
 * The drift guard {@link findOrphanedSensitiveOperation} enforces that this map stays total + valid;
 * the cgt-app R16 gate (Phase B) imports {@link sensitiveOperationAction} to reject a sensitive
 * manifest action lacking SENSITIVE_OPERATIONS membership.
 */
export const SENSITIVE_OPERATION_ACTION_MAP: Record<SensitiveOperation, PermissionAction | ServiceOnly> = {
  // document/DMS domain — reconciled to the canonical document.* actions.
  'dms.decrypt': 'document.decrypt_for_extraction',
  'dms.download': 'document.download',
  'dms.export': 'document.export',
  'dms.evidence_share': 'document.evidence_share',
  // filing mutations — resource-authz'd as filing writes.
  'filing.submit': 'filing.write',
  'filing.amend': 'filing.write',
  'filing.withdraw': 'filing.write',
  // access-grant lifecycle — direct PermissionActions.
  'access.grant': 'access.grant',
  'access.revoke': 'access.revoke',
  // gateway / auth-domain ops — no resource-authz action (recovery gate / session / identity).
  'auth.password_change': SERVICE_ONLY,
  'auth.email_change': SERVICE_ONLY,
  'auth.mfa_change': SERVICE_ONLY,
  'auth.recovery': SERVICE_ONLY,
  'auth.method_change': SERVICE_ONLY,
  'auth.break_glass': SERVICE_ONLY,
  'profile.identity_change': SERVICE_ONLY,
  'session.revoke_all': SERVICE_ONLY,
};

/** True only if `s` is in the closed {@link SENSITIVE_OPERATIONS} vocabulary (fail-closed lookup). */
export function isSensitiveOperation(s: string): s is SensitiveOperation {
  return (SENSITIVE_OPERATIONS as readonly string[]).includes(s);
}

/**
 * The canonical {@link PermissionAction} a sensitive operation reconciles to, or {@link SERVICE_ONLY}
 * for gateway/auth-domain ops with no resource action. Returns `null` for an unknown operation string
 * (fail-closed — the caller must treat unknown as deny/sensitive, never allow).
 */
export function sensitiveOperationAction(op: string): PermissionAction | ServiceOnly | null {
  if (!isSensitiveOperation(op)) return null;
  return SENSITIVE_OPERATION_ACTION_MAP[op];
}

/** True if a sensitive operation is deliberately marked {@link SERVICE_ONLY} (no resource action). */
export function isServiceOnlyOperation(op: SensitiveOperation): boolean {
  return SENSITIVE_OPERATION_ACTION_MAP[op] === SERVICE_ONLY;
}

/**
 * Reconciliation drift guard (PLATFORM_SECURITY_BASELINE §10): returns the FIRST sensitive operation
 * whose map entry is neither {@link SERVICE_ONLY} nor a registered {@link PermissionAction} (an
 * orphan), or `null` when every sensitive op is provably reconciled. Pure — no I/O. Shipped as a unit
 * test invariant and importable by the cgt-app R16 gate.
 */
export function findOrphanedSensitiveOperation(): SensitiveOperation | null {
  for (const op of SENSITIVE_OPERATIONS) {
    const mapped = SENSITIVE_OPERATION_ACTION_MAP[op];
    if (mapped === SERVICE_ONLY) continue;
    if (!isPermissionAction(mapped)) return op;
  }
  return null;
}

/**
 * The strict subset of `SENSITIVE_OPERATIONS` a **recovery-incomplete** user MAY still perform
 * (with step-up / current-provider re-auth + abuse controls) in order to BECOME recoverable —
 * the path to completeness (0.5.5 Stage 2). Without this carve-out, an Apple private-relay-only
 * user would be deadlocked out of adding a recovery channel (see
 * `runs/phase-0.5.5/003-provider-identity-and-recovery.md` and `004-stage2-plan.md` §recovery gate).
 *
 * Every OTHER sensitive operation is HIGH-RISK and blocked until recovery is complete. Consumers
 * MUST derive high-risk as `SENSITIVE_OPERATIONS \ RECOVERY_COMPLETION_OPERATIONS` so that an
 * unclassified/new sensitive op fails CLOSED (defaults to high-risk/blocked).
 */
export const RECOVERY_COMPLETION_OPERATIONS = [
  'auth.email_change',
  'auth.recovery',
  'auth.method_change',
] as const;
export type RecoveryCompletionOperation = (typeof RECOVERY_COMPLETION_OPERATIONS)[number];

// ---------------------------------------------------------------------------
// Claim policy (§7 of the security spec; D0 forbidden list).
// ---------------------------------------------------------------------------

/** Claims every signed auth token must carry; `purpose` is also required for service tokens. */
export const REQUIRED_TOKEN_CLAIMS = ['iss', 'aud', 'sub', 'iat', 'exp', 'jti'] as const;
export type RequiredTokenClaim = (typeof REQUIRED_TOKEN_CLAIMS)[number];

/**
 * Keys that must NEVER appear as authorization proof in an actor/token contract.
 * AuthZ lives behind `can(actor, action, resource)`, not in claims (D0.6). Resource
 * ownership ids may appear ONLY as explicitly-scoped routing hints, never as proof.
 */
export const FORBIDDEN_ACTOR_CLAIM_KEYS = [
  'taxpayerId',
  'filingCaseId',
  'documentId',
  'workspaceId',
  'sourceId',
  'accountantGrants',
  'utr',
  'nino',
  'address',
  'taxFigures',
] as const;
export type ForbiddenActorClaimKey = (typeof FORBIDDEN_ACTOR_CLAIM_KEYS)[number];

// ---------------------------------------------------------------------------
// 0.5.5 Stage 3A — signer/verifier contract surface.
//
// Canonical, contract-owned values + pure validators so the gateway signer and
// the `@firstlot/gateway-verifier` library enforce ONE source of truth, not
// implementer-local string checks. Covers council decisions D-001, D-005,
// D-007, D-008 and reference-review items AGY-001, AGY-002, AGY-004.
// Still NO route wiring / signer / verifier implementation here — just the
// shared contract these modules must agree on.
// ---------------------------------------------------------------------------

/**
 * Gateway signing-key lifecycle states (D-005) — the four-state "overlap, never
 * flip" model. `next` (published, not signing) → `signing` (exactly one) →
 * `verifying_only` (demoted, still published until max TTL + margin) → `retired`
 * (excluded from JWKS, terminal).
 */
export const GATEWAY_SIGNING_KEY_STATES = ['next', 'signing', 'verifying_only', 'retired'] as const;
export type GatewaySigningKeyState = (typeof GATEWAY_SIGNING_KEY_STATES)[number];

/** Key states whose public JWK is published in JWKS. `retired` is excluded (D-005). */
export const JWKS_PUBLISHED_KEY_STATES = ['next', 'signing', 'verifying_only'] as const;
export type JwksPublishedKeyState = (typeof JWKS_PUBLISHED_KEY_STATES)[number];

export function isPublishedKeyState(state: GatewaySigningKeyState): boolean {
  return (JWKS_PUBLISHED_KEY_STATES as readonly string[]).includes(state);
}

/** Per-token-class TTL (seconds), sourced from {@link AUTH_TOKEN_POLICY}. */
export const TOKEN_CLASS_TTL_SECONDS: Record<TokenClass, number> = {
  browser_session: AUTH_TOKEN_POLICY.browserSessionTtlSeconds,
  service_handshake: AUTH_TOKEN_POLICY.serviceHandshakeTtlSeconds,
  browser_redirect_handshake: AUTH_TOKEN_POLICY.browserRedirectHandshakeTtlSeconds,
  service_principal: AUTH_TOKEN_POLICY.servicePrincipalTtlSeconds,
};

/**
 * Per-class maximum accepted clock skew in SECONDS (D-008). Short-lived service
 * tokens use a tighter skew so they do not silently gain a ~50% replay-window
 * extension. This is a HARD upper bound — a verifier may configure a smaller
 * skew but MUST reject any configuration above the per-class maximum.
 */
export const TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS: Record<TokenClass, number> = {
  service_handshake: 10,
  browser_session: 30,
  browser_redirect_handshake: 30,
  // D-004/D-005: service-principal uses the tight service skew bound (10s).
  service_principal: 10,
};

/**
 * Canonical class→allowed-purpose matrix (AGY-004). Any class/purpose combination
 * outside this matrix denies at BOTH signer and verifier. New purposes/classes
 * require a contract change here, not an implementer-local string check.
 */
export const TOKEN_CLASS_PURPOSE_MATRIX: Record<TokenClass, readonly TokenPurpose[]> = {
  browser_session: ['browser_session'],
  browser_redirect_handshake: ['suite_handshake'],
  // D-010 S1 (B1): `downstream_actor` is added here on `service_handshake` ONLY. The B1
  // token is a short-lived service-handshake-class token that additionally carries actor
  // context. `bff_request_binding` (B2) is deliberately NOT a matrix purpose — it is a
  // BFF-issued envelope, not a gateway token class.
  service_handshake: ['child_app_status', 'step_up', 'downstream_actor'],
  // D-004/D-001: `introspection` is allowed for `service_principal` only and appears
  // in no other class row, so an actor/browser/service_handshake token claiming
  // `introspection` denies on the matrix alone. `service_principal` NEVER carries
  // `downstream_actor` — a service token has no actor context (D-010 S1).
  service_principal: ['introspection'],
};

export function isPurposeAllowedForClass(tokenClass: TokenClass, purpose: TokenPurpose): boolean {
  const allowed = TOKEN_CLASS_PURPOSE_MATRIX[tokenClass];
  return !!allowed && allowed.includes(purpose);
}

/**
 * Purposes whose derived tokens are ONE-TIME-USE (AGY-002): a second presentation
 * denies even inside the TTL. `child_app_status` is intentionally NOT here — it is
 * a bounded short-lived bearer token for idempotent status reads.
 */
export const ONE_TIME_USE_PURPOSES = ['suite_handshake', 'step_up'] as const;
export type OneTimeUsePurpose = (typeof ONE_TIME_USE_PURPOSES)[number];

export function isOneTimeUsePurpose(purpose: TokenPurpose): boolean {
  return (ONE_TIME_USE_PURPOSES as readonly string[]).includes(purpose);
}

/**
 * Minimum CSPRNG entropy for a gateway token `jti` (D-007). UUIDv4 (122 random
 * bits) and ULID (timestamp-derived) explicitly do NOT satisfy this; the gateway
 * generates the jti itself from >= 16 random bytes and fails closed otherwise.
 */
export const JTI_MIN_ENTROPY_BITS = 128 as const;

/**
 * The explicit operation/sensitivity input a verifier MUST accept (D-001).
 * `verify(rawToken, options)`. When `operation` is in {@link SENSITIVE_OPERATIONS}
 * the live introspection path is forced; an UNKNOWN operation string fails CLOSED
 * to sensitive (matching the derive-high-risk default).
 */
export interface VerifyOptions {
  /** This resource server's own expected audience; MUST equal the token `aud`. */
  expectedAudience: GatewayAudience;
  /** The operation being authorized; unknown strings are treated as sensitive. */
  operation?: SensitiveOperation | string;
}

/** True only if every role is in the closed {@link PLATFORM_ROLES} vocabulary. */
export function isValidRoleSet(roles: readonly string[]): boolean {
  const vocab = new Set<string>(PLATFORM_ROLES);
  return roles.every(r => vocab.has(r));
}

/**
 * Canonicalize a claim key for forbidden-claim comparison (AGY-001):
 * lowercase + strip every non-alphanumeric character. So `taxpayerId`,
 * `taxpayer_id`, `TAXPAYER_ID`, and `taxpayer-id` all canonicalize identically.
 */
export function canonicalizeClaimKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FORBIDDEN_CANONICAL_KEYS = new Set<string>(
  FORBIDDEN_ACTOR_CLAIM_KEYS.map(canonicalizeClaimKey),
);

/** True if `key` canonicalizes to any forbidden actor-claim key (AGY-001). */
export function isForbiddenClaimKey(key: string): boolean {
  return FORBIDDEN_CANONICAL_KEYS.has(canonicalizeClaimKey(key));
}

/**
 * The FULL set of claims a gateway-issued token must carry (plan §4): the base
 * {@link REQUIRED_TOKEN_CLAIMS} plus the actor fields `purpose`, `email`, `roles`,
 * `sessionJti`, and `authTime`. Enforced at BOTH the signer (refuse to mint) and the
 * verifier (refuse to accept) so a token missing or malforming any of them never
 * yields an actor context. `tokenClass` is additionally required by the verifier for
 * the class/purpose matrix re-check but is a gateway-internal claim, validated there.
 */
export const REQUIRED_GATEWAY_TOKEN_CLAIMS = [
  'iss',
  'aud',
  'sub',
  'iat',
  'exp',
  'jti',
  'purpose',
  'email',
  'roles',
  'sessionJti',
  'authTime',
] as const;
export type RequiredGatewayTokenClaim = (typeof REQUIRED_GATEWAY_TOKEN_CLAIMS)[number];

/**
 * Validate that every {@link REQUIRED_GATEWAY_TOKEN_CLAIMS} entry is present with the
 * correct primitive type (plan §4). Strings must be non-empty; `iat`/`exp` must be
 * finite numbers; `roles` must be an array. Returns the FIRST offending claim name, or
 * `null` if all required claims are present and well-typed. Pure — no I/O. Used by the
 * signer and the verifier so missing/malformed `sub`/`email`/`authTime` (etc.) deny.
 */
export function findMissingOrMalformedClaim(payload: Record<string, unknown>): string | null {
  const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
  if (!nonEmptyString(payload.iss)) return 'iss';
  if (!nonEmptyString(payload.aud)) return 'aud';
  if (!nonEmptyString(payload.sub)) return 'sub';
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return 'iat';
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return 'exp';
  if (!nonEmptyString(payload.jti)) return 'jti';
  if (!nonEmptyString(payload.purpose)) return 'purpose';
  if (!nonEmptyString(payload.email)) return 'email';
  if (!Array.isArray(payload.roles)) return 'roles';
  if (!nonEmptyString(payload.sessionJti)) return 'sessionJti';
  if (!nonEmptyString(payload.authTime)) return 'authTime';
  return null;
}

/**
 * Recursively scan a decoded payload for forbidden claim keys (AGY-001). Walks
 * nested objects and arrays so a forbidden resource id hidden inside a nested
 * claim still denies. Returns the offending key PATHS (empty array = clean).
 */
export function scanForbiddenClaims(payload: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => hits.push(...scanForbiddenClaims(v, `${path}[${i}]`)));
  } else if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      const here = path ? `${path}.${k}` : k;
      if (isForbiddenClaimKey(k)) hits.push(here);
      hits.push(...scanForbiddenClaims(v, here));
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 0.5.5 D-004 — Service-principal contract surface (non-user machine identity).
//
// A genuinely non-user, session-less principal so a portable service-token
// introspection-auth model can later be adopted WITHOUT faking user/session
// fields. Target: `platform-contracts` types/values/tests ONLY — no signer,
// no verifier, no route wiring (those are Group B / later, separately-gated
// stages). Covers council decisions D-001…D-010. Group A (this surface) is the
// pure-contract acceptance bar; Group B (JWKS signature/`kid`, per-token `jti`
// entropy denial) is deferred to the verifier/signer and is NOT implemented here.
// ---------------------------------------------------------------------------

/**
 * Closed vocabulary of recognised non-user machine identities (D-005). A service
 * token's `sub` carries one of these; an unknown id fails CLOSED (denies). Seeded
 * conservatively with the resource-server introspection callers and expanded ONLY
 * by a contract change here. Membership ≠ acceptance: each introspection endpoint
 * additionally pins a deploy-configured `acceptedServiceIds` subset (see
 * {@link isIntrospectionCaller}). `svc-` prefix marks a machine subject so it is
 * never confused with a user `sub` or a {@link GATEWAY_AUDIENCES} value.
 */
export const SERVICE_PRINCIPAL_IDS = [
  'svc-firstlot-suite',
  'svc-cgt-app',
  'svc-income-app',
  'svc-dms',
  // D-010 S1: the BFF tier's machine identity. The platform-bff authenticates to the
  // private exchange surface (`POST {private}/auth/exchange-downstream`) as this
  // principal. Like the other ids, membership ≠ acceptance — each endpoint still pins
  // its own deploy-configured `acceptedServiceIds` subset.
  'svc-platform-bff',
] as const;
export type ServicePrincipalId = (typeof SERVICE_PRINCIPAL_IDS)[number];

/** True only if `id` is in the closed {@link SERVICE_PRINCIPAL_IDS} vocabulary (fail-closed). */
export function isKnownServicePrincipalId(id: string): boolean {
  return (SERVICE_PRINCIPAL_IDS as readonly string[]).includes(id);
}

/**
 * The minimal service-token purpose vocabulary (D-003). Deliberately just
 * `introspection`; any sibling service purpose is deferred and fails closed.
 */
export const SERVICE_PRINCIPAL_TOKEN_PURPOSES = ['introspection'] as const;
export type ServiceTokenPurpose = (typeof SERVICE_PRINCIPAL_TOKEN_PURPOSES)[number];

/**
 * A non-user machine identity (D-002). NEVER a {@link GatewayActor}: it carries no
 * `email` / `roles` / `sessionJti` / `authTime`. `serviceId` is the token `sub`.
 */
export interface ServicePrincipal {
  /** Stable machine subject (the token `sub`); one of {@link SERVICE_PRINCIPAL_IDS}. */
  serviceId: string;
  /** `auth-gateway` for introspection (no new audience is introduced). */
  audience: GatewayAudience;
  purpose: ServiceTokenPurpose;
}

/**
 * What a verifier returns for a service token (D-003). Has NO `actor`, NO
 * `sessionJti`, and NO live-introspection `freshness` — verification is offline
 * (D-004), so there is no session to be fresh against.
 */
export interface VerifiedServiceContext {
  principal: ServicePrincipal;
  audience: GatewayAudience;
  tokenClass: 'service_principal';
  purpose: ServiceTokenPurpose;
  /** The accepted auth path — `gateway` for service principals. */
  source: TokenSource;
  verifiedAt: string;
  // Deliberately NO `actor`, NO `sessionJti`, NO `freshness`.
}

/** Is `cls` the non-user service class? Drives the verifier's class branch (D-006). */
export function isServiceTokenClass(cls: TokenClass): boolean {
  return cls === 'service_principal';
}

/**
 * True (and narrows) when `cls` is an ACTOR token class — i.e. NOT the non-user
 * `service_principal` class (D-004). Actor-path consumers (signer/verifier) use this to
 * fail CLOSED on a service class until the separately-gated service path exists, so a
 * service token can never traverse the actor path.
 */
export function isActorTokenClass(cls: TokenClass): cls is ActorTokenClass {
  return cls !== 'service_principal';
}

/** True when `purpose` is the service-only `introspection` purpose (D-004). */
export function isServiceTokenPurpose(purpose: TokenPurpose): boolean {
  return purpose === 'introspection';
}

/**
 * Required claims for a SERVICE token (D-006): the base claims plus `purpose`, and
 * explicitly NONE of the actor fields. This is the service-path counterpart to
 * {@link REQUIRED_GATEWAY_TOKEN_CLAIMS}; a service token routed through the actor
 * validator would be forced to fabricate `email`/`roles`/`sessionJti`/`authTime`,
 * which this whole stage exists to avoid.
 */
export const REQUIRED_SERVICE_TOKEN_CLAIMS = [
  'iss',
  'aud',
  'sub',
  'iat',
  'exp',
  'jti',
  'purpose',
] as const;
export type RequiredServiceTokenClaim = (typeof REQUIRED_SERVICE_TOKEN_CLAIMS)[number];

/**
 * Validate that every {@link REQUIRED_SERVICE_TOKEN_CLAIMS} entry is present with the
 * correct primitive type. Strings must be non-empty; `iat`/`exp` must be finite
 * numbers. Returns the FIRST offending claim name, or `null` if all required claims
 * are present and well-typed. Pure — no I/O. Does NOT require — and does not look at —
 * `email`/`roles`/`sessionJti`/`authTime`; their *presence* is a separate DENY check
 * (see {@link findForbiddenServiceActorClaim}), not a required-shape concern.
 */
export function findMissingOrMalformedServiceClaim(payload: Record<string, unknown>): string | null {
  const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
  if (!nonEmptyString(payload.iss)) return 'iss';
  if (!nonEmptyString(payload.aud)) return 'aud';
  if (!nonEmptyString(payload.sub)) return 'sub';
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return 'iat';
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return 'exp';
  if (!nonEmptyString(payload.jti)) return 'jti';
  if (!nonEmptyString(payload.purpose)) return 'purpose';
  return null;
}

/**
 * Actor/session fields a `service_principal` token must NEVER carry (D-010). Their
 * PRESENCE on a service payload is actor/session injection — it reopens the fake-actor
 * escape hatch this stage closes — so it must DENY (fail closed), never be stripped or
 * ignored. If the actor contract ever grows a new session-shaped field, this list must
 * be extended in lockstep.
 */
export const FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS = [
  'email',
  'roles',
  'sessionJti',
  'authTime',
] as const;
export type ForbiddenServiceActorClaimKey = (typeof FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS)[number];

/**
 * Returns the FIRST forbidden actor/session field PRESENT on a service payload, or
 * `null` if none are present (D-010). Pure — no I/O. Companion to (not a replacement
 * for) {@link findMissingOrMalformedServiceClaim}: required-claim *shape* and
 * actor-field *injection* are two distinct invariants, mirroring how
 * {@link scanForbiddenClaims} is separate from {@link findMissingOrMalformedClaim}.
 *
 * Detection is by key PRESENCE — `Object.prototype.hasOwnProperty` — NOT truthiness:
 * a forbidden field present but falsy (`roles: []`, `email: ''`, `authTime: 0`) is
 * still injection and still DENIES.
 */
export function findForbiddenServiceActorClaim(payload: Record<string, unknown>): string | null {
  for (const key of FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return key;
  }
  return null;
}

/**
 * Narrow a {@link VerifiedServiceContext} to the introspection caller an endpoint
 * accepts (D-005). Fail-closed: true ONLY when the context is the `service_principal`
 * class with the `introspection` purpose, its `serviceId` is in the closed
 * {@link SERVICE_PRINCIPAL_IDS} vocabulary, AND it is in the endpoint's deploy-configured
 * `acceptedServiceIds` subset (membership ≠ acceptance). A known serviceId that is not in
 * the accepted subset denies (matrix row 7).
 */
export function isIntrospectionCaller(
  ctx: VerifiedServiceContext,
  acceptedServiceIds: Iterable<string>,
): boolean {
  if (ctx.tokenClass !== 'service_principal') return false;
  if (ctx.purpose !== 'introspection') return false;
  const serviceId = ctx.principal.serviceId;
  if (!isKnownServicePrincipalId(serviceId)) return false;
  for (const accepted of acceptedServiceIds) {
    if (accepted === serviceId) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 0.5.5 D-010 S1 — BFF / downstream-exchange contract surface.
//
// The ingress → gateway-login → BFF → private-backend topology (design 024 §3/§4/§10).
// Purely additive contract VALUES + pure validators for:
//   • B1 — the gateway-minted downstream-actor token (class `service_handshake` +
//     purpose `downstream_actor`) the BFF presents to a private backend. It carries actor
//     context, so its required claim shape is the gateway-token shape pinned to that purpose
//     and a canonical downstream `aud`.
//   • B2 — the BFF-issued per-request binding envelope (`iss=platform-bff`,
//     purpose `bff_request_binding`) that pins a B1 token to a single HTTP request. It
//     carries NO `sub`/`roles`/resource claims.
//   • the private exchange route req/resp (session ref + target aud → B1 token).
// NO signer, NO verifier, NO route wiring — those are S2/S4/S5, separately gated.
// ---------------------------------------------------------------------------

/** Canonical issuer of a B2 request-binding envelope — the BFF tier, not the gateway. */
export const BFF_REQUEST_BINDING_ISS = 'platform-bff' as const;
export type BffRequestBindingIss = typeof BFF_REQUEST_BINDING_ISS;

/**
 * B1 — the gateway-minted downstream-actor token (design 024 §3). Class is
 * `service_handshake`, purpose is `downstream_actor`, and it carries the actor context
 * (`sub`/`roles`/`email`/`authTime`/`sessionJti`). Its REQUIRED claim set is the gateway
 * actor-token shape ({@link REQUIRED_GATEWAY_TOKEN_CLAIMS}) PLUS `tokenClass`: design 024
 * §3 pins B1 to exactly `tokenClass=service_handshake + purpose=downstream_actor` and
 * requires `tokenClass` in B1 claims so wrong-class / service-principal actor injection
 * denies at the shared contract boundary (not just a gateway-internal verifier re-check).
 * Declared as its own closed list so the B1 contract is self-documenting and cannot
 * silently drift (the matching test asserts it equals the gateway shape plus `tokenClass`).
 */
export const REQUIRED_B1_DOWNSTREAM_CLAIMS = [
  'iss',
  'aud',
  'sub',
  'iat',
  'exp',
  'jti',
  'purpose',
  'email',
  'roles',
  'sessionJti',
  'authTime',
  'tokenClass',
] as const;
export type RequiredB1DownstreamClaim = (typeof REQUIRED_B1_DOWNSTREAM_CLAIMS)[number];

/**
 * Validate a B1 downstream-actor payload (plan §5 / design 024 §3). Reuses the gateway-token
 * shape check (so a missing/malformed `roles`/`authTime`/`sub`/… is reported by name) and
 * additionally pins (a) exactly `tokenClass === 'service_handshake'`, (b) `purpose ===
 * 'downstream_actor'`, and (c) `aud` to a canonical {@link GATEWAY_AUDIENCES} value (the
 * downstream app, e.g. `income-app`). Pinning `tokenClass` here means a missing class, a
 * wrong class (e.g. `browser_session`), or a `service_principal` actor injection all DENY
 * at the shared contract. Returns the FIRST offending claim name, or `null` when the payload
 * is a well-formed B1. Pure — no I/O.
 */
export function findMissingOrMalformedB1DownstreamClaim(
  payload: Record<string, unknown>,
): string | null {
  const shape = findMissingOrMalformedClaim(payload);
  if (shape) return shape;
  if (payload.tokenClass !== 'service_handshake') return 'tokenClass';
  if (payload.purpose !== 'downstream_actor') return 'purpose';
  if (!(GATEWAY_AUDIENCES as readonly string[]).includes(payload.aud as string)) return 'aud';
  return null;
}

/**
 * B2 — the BFF-issued per-request binding envelope (design 024 §3/§4). Issued by the BFF
 * (`iss=platform-bff`, `purpose=bff_request_binding`) to pin a B1 token to exactly one HTTP
 * request: it binds the request (`method` + canonical `path`-with-query, plus a `bodyDigest`
 * for mutations) and links the B1 token it accompanies (`b1_jti`/`b1_hash` + the `sessionJti`
 * the B1 was minted for). It carries NO `sub`/`roles`/resource claims — it is request-binding
 * metadata, not an actor or authorization assertion.
 *
 * `bodyDigest` is method-conditional: REQUIRED (non-empty) for mutating requests
 * (POST/PUT/PATCH/DELETE) so a signed mutation binding cannot be replayed against a different
 * body, and absent for safe reads with no body. Every other field is mandatory. See
 * {@link MUTATING_HTTP_METHODS} and {@link findMissingOrMalformedBffBindingClaim}.
 */
export interface BffRequestBindingEnvelope {
  iss: BffRequestBindingIss;
  purpose: 'bff_request_binding';
  iat: number;
  aud: GatewayAudience;
  exp: number;
  jti: string;
  /** HTTP method, canonicalized by the BFF (e.g. upper-case `GET`/`POST`). */
  method: string;
  /** Canonical request path including the query string the BFF bound. */
  path: string;
  /** Digest of the request body — present ONLY for mutating requests. */
  bodyDigest?: string;
  /** The `jti` of the B1 token this envelope binds. */
  b1_jti: string;
  /** A hash of the B1 token this envelope binds (detects token swap/replay). */
  b1_hash: string;
  /** The session the bound B1 token was minted for (raw `sessionJti`, not pre-hashed). */
  sessionJti: string;
}

/**
 * The mandatory keys on a {@link BffRequestBindingEnvelope} (B2). `bodyDigest` is NOT here —
 * it is request-conditional (mutations only); its well-typedness when present is checked by
 * {@link findMissingOrMalformedBffBindingClaim}.
 */
export const REQUIRED_B2_BINDING_CLAIMS = [
  'iss',
  'aud',
  'iat',
  'exp',
  'jti',
  'purpose',
  'method',
  'path',
  'b1_jti',
  'b1_hash',
  'sessionJti',
] as const;
export type RequiredB2BindingClaim = (typeof REQUIRED_B2_BINDING_CLAIMS)[number];

/**
 * Keys a B2 binding envelope must NEVER carry (plan §4): it is request-binding metadata, not
 * an actor/authorization assertion, so `sub`/`roles` PRESENCE is injection and DENIES (fail
 * closed — by presence, not truthiness), mirroring {@link findForbiddenServiceActorClaim}.
 * Resource-id claims are additionally caught by {@link scanForbiddenClaims}.
 */
export const FORBIDDEN_B2_BINDING_CLAIM_KEYS = ['sub', 'roles'] as const;
export type ForbiddenB2BindingClaimKey = (typeof FORBIDDEN_B2_BINDING_CLAIM_KEYS)[number];

/**
 * HTTP methods treated as mutating on a B2 envelope (design 024 §3/§4: "body digest for
 * mutations"). A B2 envelope whose (BFF-canonicalized, upper-case) `method` is one of these MUST
 * carry a non-empty `bodyDigest`; safe reads (`GET`/`HEAD`/`OPTIONS`) may omit it. Enforced by
 * {@link findMissingOrMalformedBffBindingClaim}.
 */
export const MUTATING_HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type MutatingHttpMethod = (typeof MUTATING_HTTP_METHODS)[number];

/**
 * Validate a B2 request-binding envelope (plan §4 / acceptance; design 024 §3 audience rule).
 * Pins `iss === 'platform-bff'` and `purpose === 'bff_request_binding'`, requires `aud` to be a
 * canonical {@link GATEWAY_AUDIENCES} value (income verifies B2 through this shared contract, so
 * a non-canonical audience must fail closed here, not by BFF-local convention), then checks every
 * {@link REQUIRED_B2_BINDING_CLAIMS} key is present and well-typed (non-empty strings; `iat`/`exp`
 * finite numbers). `bodyDigest` is method-conditional: a mutating method
 * ({@link MUTATING_HTTP_METHODS}) MUST carry a non-empty `bodyDigest` (so a signed mutation
 * binding cannot be replayed against a different body); a safe read may omit it, but a present
 * `bodyDigest` must still be a non-empty string. Returns the FIRST offending claim name, or `null`
 * when the envelope is well-formed. Pure — no I/O. Does NOT check `sub`/`roles` absence — that is
 * the separate {@link findForbiddenBffBindingClaim} injection check.
 */
export function findMissingOrMalformedBffBindingClaim(
  payload: Record<string, unknown>,
): string | null {
  const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
  if (payload.iss !== BFF_REQUEST_BINDING_ISS) return 'iss';
  if (payload.purpose !== 'bff_request_binding') return 'purpose';
  if (!(GATEWAY_AUDIENCES as readonly string[]).includes(payload.aud as string)) return 'aud';
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return 'iat';
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return 'exp';
  if (!nonEmptyString(payload.jti)) return 'jti';
  if (!nonEmptyString(payload.method)) return 'method';
  if (!nonEmptyString(payload.path)) return 'path';
  if (!nonEmptyString(payload.b1_jti)) return 'b1_jti';
  if (!nonEmptyString(payload.b1_hash)) return 'b1_hash';
  if (!nonEmptyString(payload.sessionJti)) return 'sessionJti';
  const isMutating = (MUTATING_HTTP_METHODS as readonly string[]).includes(
    (payload.method as string).toUpperCase(),
  );
  if (isMutating) {
    // Mutations MUST bind the body: a missing or empty bodyDigest fails closed.
    if (!nonEmptyString(payload.bodyDigest)) return 'bodyDigest';
  } else if (
    // Safe reads may omit bodyDigest, but a present one must still be well-typed.
    Object.prototype.hasOwnProperty.call(payload, 'bodyDigest') &&
    !nonEmptyString(payload.bodyDigest)
  ) {
    return 'bodyDigest';
  }
  return null;
}

/**
 * Returns the FIRST forbidden actor/authz key PRESENT on a B2 envelope (`sub`/`roles`), or
 * `null` if none. By presence (`hasOwnProperty`), NOT truthiness — a falsy `roles: []` or
 * `sub: ''` is still injection and still DENIES. Pure — no I/O.
 */
export function findForbiddenBffBindingClaim(payload: Record<string, unknown>): string | null {
  for (const key of FORBIDDEN_B2_BINDING_CLAIM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return key;
  }
  return null;
}

/**
 * Request body for `POST {private}/auth/exchange-downstream` (design 024 §4). The BFF —
 * authenticated as `svc-platform-bff` — presents the browser session reference (raw
 * `sessionJti`, NOT pre-hashed; the gateway hashes once for lookup) and the canonical
 * downstream audience it needs a B1 token for. The gateway resolves the actor from the
 * session and mints a B1 downstream-actor token bound to that audience. NO actor/resource
 * fields — the actor is never asserted by the caller.
 */
export interface ExchangeDownstreamRequest {
  /** The browser session reference the B1 token will be minted for (raw `sessionJti`). */
  sessionJti: string;
  /** The canonical downstream audience (e.g. `income-app`) the B1 `aud` is pinned to. */
  targetAudience: GatewayAudience;
}

/**
 * Response body for `POST {private}/auth/exchange-downstream`. Returns the minted B1
 * downstream-actor token plus the canonical audience it is bound to, its always-
 * `downstream_actor` purpose, and the token expiry (epoch seconds) so the BFF can decide
 * when to re-exchange. The actor context lives INSIDE the signed B1 token, not in this body.
 */
export interface ExchangeDownstreamResponse {
  /** The minted B1 downstream-actor token (compact JWT). */
  downstreamToken: string;
  /** The canonical audience the returned B1 token is bound to (echoes the request). */
  audience: GatewayAudience;
  /** Always `downstream_actor` — the B1 purpose. */
  purpose: 'downstream_actor';
  /** B1 token expiry (epoch seconds) for the BFF's re-exchange decision. */
  exp: number;
}
