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
