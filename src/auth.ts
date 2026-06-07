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
] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

/** Which auth path produced the context — drives bridge-retirement telemetry (D0.5). */
export const TOKEN_SOURCES = [
  'gateway',
  'legacy_cgt_session',
  'legacy_income_bridge',
] as const;
export type TokenSource = (typeof TOKEN_SOURCES)[number];

/** AuthZ action vocabulary (D0.6). Looked up via the permission boundary; NOT a claim. */
export const PERMISSION_ACTIONS = [
  'filing.read',
  'filing.write',
  'income.status.read',
  'cgt.status.read',
  'document.read',
  'document.decrypt_for_extraction',
  'access.grant',
  'access.revoke',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

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

export interface VerifiedActorContext {
  actor: GatewayActor;
  audience: GatewayAudience;
  tokenClass: TokenClass;
  purpose: TokenPurpose;
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
};

/**
 * Canonical class→allowed-purpose matrix (AGY-004). Any class/purpose combination
 * outside this matrix denies at BOTH signer and verifier. New purposes/classes
 * require a contract change here, not an implementer-local string check.
 */
export const TOKEN_CLASS_PURPOSE_MATRIX: Record<TokenClass, readonly TokenPurpose[]> = {
  browser_session: ['browser_session'],
  browser_redirect_handshake: ['suite_handshake'],
  service_handshake: ['child_app_status', 'step_up'],
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
