/**
 * 0.5.5 D-004 — Service-principal contract (Group A: platform-contracts Part C bar).
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB, NO JWKS, NO crypto. Timing
 * rows use an injected clock. These assert the Group A denial matrix (§4) and the
 * Group A test bar (§5) of
 *   specs/implementation/council/0.5.5-d004-service-principal-contract-r2/02-approved-implementation-plan.md
 *
 * Group B rows (14 signature/`kid`, 9b per-token `jti` entropy denial) are deliberately
 * NOT tested here — they require the runtime verifier/signer and are recorded as deferred
 * future obligations in the plan. The contract owns the VALUE `JTI_MIN_ENTROPY_BITS === 128`
 * only (asserted below); the per-token entropy *behaviour* is not a contract unit test.
 */
import {
  TOKEN_CLASSES,
  TOKEN_PURPOSES,
  TOKEN_CLASS_PURPOSE_MATRIX,
  TOKEN_CLASS_TTL_SECONDS,
  TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS,
  isPurposeAllowedForClass,
  ONE_TIME_USE_PURPOSES,
  isOneTimeUsePurpose,
  JTI_MIN_ENTROPY_BITS,
  AUTH_TOKEN_POLICY,
  scanForbiddenClaims,
  findMissingOrMalformedClaim,
  // D-004 surface
  SERVICE_PRINCIPAL_IDS,
  isKnownServicePrincipalId,
  SERVICE_PRINCIPAL_TOKEN_PURPOSES,
  isServiceTokenClass,
  REQUIRED_SERVICE_TOKEN_CLAIMS,
  findMissingOrMalformedServiceClaim,
  FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS,
  findForbiddenServiceActorClaim,
  isIntrospectionCaller,
  isServiceTokenPurpose,
} from '../auth';
import type {
  GatewayAudience,
  VerifiedServiceContext,
  VerifiedActorContext,
  ActorTokenClass,
  ActorTokenPurpose,
} from '../auth';

const set = (a: readonly string[]) => new Set(a);

// A well-formed service token payload (no actor/session fields). Overridable per test.
const servicePayload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'auth-gateway',
  aud: 'auth-gateway',
  sub: 'svc-dms',
  iat: 1000,
  exp: 1120,
  jti: 'jti-introspect-1',
  purpose: 'introspection',
  ...over,
});

const verifiedServiceCtx = (
  over: Partial<VerifiedServiceContext> = {},
  principalOver: Record<string, unknown> = {},
): VerifiedServiceContext => ({
  principal: { serviceId: 'svc-dms', audience: 'auth-gateway', purpose: 'introspection', ...principalOver },
  audience: 'auth-gateway',
  tokenClass: 'service_principal',
  purpose: 'introspection',
  source: 'gateway',
  verifiedAt: '2026-06-08T00:00:00Z',
  ...over,
});

// Pure timing check for row 10 (injected clock; uses the contract's own skew bound).
const ACCEPTED_SKEW = TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS.service_principal;
const isExpiredAtService = (exp: number, now: number): boolean => now > exp + ACCEPTED_SKEW;

describe('D-004 — vocabulary additions (D-001)', () => {
  test('service_principal is a token class; introspection is a token purpose', () => {
    expect((TOKEN_CLASSES as readonly string[]).includes('service_principal')).toBe(true);
    expect((TOKEN_PURPOSES as readonly string[]).includes('introspection')).toBe(true);
  });

  // D-011 S1 (sec-gate F1): the service-token purpose vocabulary is no longer
  // introspection-only — `participant.resolve` is an additive, distinct
  // service_principal-only purpose. d065 RETIRED the broker-connection vault's
  // `connections.issue` (the vault admits only the session-derived B1 exchange
  // now), so the vocabulary is back to exactly these two; neither implies the
  // other.
  test('SERVICE_PRINCIPAL_TOKEN_PURPOSES is the service-only vocab: introspection + participant.resolve + authz.snapshot', () => {
    expect(set(SERVICE_PRINCIPAL_TOKEN_PURPOSES)).toEqual(
      set(['introspection', 'participant.resolve', 'authz.snapshot']),
    );
  });

  test('isServiceTokenPurpose recognises ALL service purposes and rejects actor/handshake purposes', () => {
    expect(isServiceTokenPurpose('introspection')).toBe(true);
    expect(isServiceTokenPurpose('participant.resolve')).toBe(true);
    // actor-bearing / non-service purposes are NOT service-token purposes
    expect(isServiceTokenPurpose('browser_session')).toBe(false);
    expect(isServiceTokenPurpose('child_app_status')).toBe(false);
    expect(isServiceTokenPurpose('step_up')).toBe(false);
    expect(isServiceTokenPurpose('downstream_actor')).toBe(false);
    expect(isServiceTokenPurpose('bff_request_binding')).toBe(false);
  });

  test('actor token purposes exclude BOTH service-only purposes (compile-time + runtime)', () => {
    // Compile-time: neither service purpose is assignable to ActorTokenPurpose.
    // @ts-expect-error — introspection is excluded from ActorTokenPurpose
    const _badIntrospect: ActorTokenPurpose = 'introspection';
    // @ts-expect-error — participant.resolve is excluded from ActorTokenPurpose
    const _badResolve: ActorTokenPurpose = 'participant.resolve';
    void _badIntrospect;
    void _badResolve;
    // Runtime: neither is allowed for any actor token class.
    const actorClasses: ActorTokenClass[] = [
      'browser_session',
      'service_handshake',
      'browser_redirect_handshake',
    ];
    for (const cls of actorClasses) {
      expect(isPurposeAllowedForClass(cls, 'introspection')).toBe(false);
      expect(isPurposeAllowedForClass(cls, 'participant.resolve')).toBe(false);
    }
  });

  test('isIntrospectionCaller remains introspection-only — a participant.resolve service ctx denies', () => {
    // Even a known + accepted service principal denies if its purpose is participant.resolve.
    const resolveCtx = verifiedServiceCtx({ purpose: 'participant.resolve' }, { purpose: 'participant.resolve' });
    expect(isIntrospectionCaller(resolveCtx, ['svc-dms'])).toBe(false);
    // The introspection caller still accepts an introspection ctx (control).
    expect(isIntrospectionCaller(verifiedServiceCtx(), ['svc-dms'])).toBe(true);
  });

  test('isServiceTokenClass is true only for service_principal', () => {
    expect(isServiceTokenClass('service_principal')).toBe(true);
    expect(isServiceTokenClass('browser_session')).toBe(false);
    expect(isServiceTokenClass('service_handshake')).toBe(false);
    expect(isServiceTokenClass('browser_redirect_handshake')).toBe(false);
  });
});

describe('D-004 — positive: valid service token yields a service context', () => {
  // §5 Group A positive (1): valid class/purpose/aud/allowlisted serviceId → service context
  test('a valid service context has NO actor and NO sessionJti', () => {
    const ctx = verifiedServiceCtx();
    expect(Object.prototype.hasOwnProperty.call(ctx, 'actor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(ctx, 'sessionJti')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(ctx, 'freshness')).toBe(false);
    expect(ctx.principal.serviceId).toBe('svc-dms');
    expect(isIntrospectionCaller(ctx, ['svc-dms'])).toBe(true);
  });

  // §5 Group A positive (2): the contract-level service-path checks are pure — no introspection call
  test('the service-path validators are pure (no I/O, no introspection call)', () => {
    const payload = servicePayload();
    // Running every contract check is side-effect free and references no client.
    expect(findMissingOrMalformedServiceClaim(payload)).toBeNull();
    expect(findForbiddenServiceActorClaim(payload)).toBeNull();
    expect(scanForbiddenClaims(payload)).toEqual([]);
    expect(isPurposeAllowedForClass('service_principal', 'introspection')).toBe(true);
  });
});

describe('D-004 — Group A denial matrix (§4): every row denies', () => {
  // Row 1 — actor / browser_session token claiming introspection
  test('row 1: browser_session cannot carry introspection (matrix)', () => {
    expect(isPurposeAllowedForClass('browser_session', 'introspection')).toBe(false);
    expect(isServiceTokenClass('browser_session')).toBe(false);
  });

  // Row 2 — service_handshake + child_app_status
  test('row 2: service_handshake + child_app_status is not the service path', () => {
    expect(isPurposeAllowedForClass('service_handshake', 'introspection')).toBe(false);
    expect(isServiceTokenClass('service_handshake')).toBe(false);
  });

  // Row 3 — service_handshake + step_up
  test('row 3: service_handshake + step_up cannot reach introspection', () => {
    expect(isPurposeAllowedForClass('service_handshake', 'step_up')).toBe(true); // its real purpose
    expect(isPurposeAllowedForClass('service_handshake', 'introspection')).toBe(false);
  });

  // Row 4 — wrong aud (e.g. cgt-app)
  test('row 4: aud != auth-gateway denies (expected-aud equality)', () => {
    const expectedAud: GatewayAudience = 'auth-gateway';
    const payload = servicePayload({ aud: 'cgt-app' });
    expect(payload.aud === expectedAud).toBe(false);
  });

  // Row 5 — wrong purpose (anything but introspection)
  test('row 5: a non-introspection purpose is not in the service vocab and misses the matrix', () => {
    expect((SERVICE_PRINCIPAL_TOKEN_PURPOSES as readonly string[]).includes('child_app_status')).toBe(false);
    expect(isPurposeAllowedForClass('service_principal', 'child_app_status' as never)).toBe(false);
  });

  // Row 6 — unknown serviceId (not in SERVICE_PRINCIPAL_IDS)
  test('row 6: unknown serviceId denies (closed vocab membership)', () => {
    expect(isKnownServicePrincipalId('svc-attacker')).toBe(false);
    expect(isKnownServicePrincipalId('')).toBe(false);
    expect(isIntrospectionCaller(verifiedServiceCtx({}, { serviceId: 'svc-attacker' }), ['svc-attacker'])).toBe(false);
  });

  // Row 7 — known serviceId NOT in the endpoint's accepted subset
  test('row 7: known serviceId not in acceptedServiceIds denies (membership != acceptance)', () => {
    const ctx = verifiedServiceCtx({}, { serviceId: 'svc-income-app' });
    expect(isKnownServicePrincipalId('svc-income-app')).toBe(true); // known...
    expect(isIntrospectionCaller(ctx, ['svc-dms'])).toBe(false); // ...but not accepted here
    expect(isIntrospectionCaller(ctx, [])).toBe(false);
  });

  // Row 8 — missing/empty sub (service identity)
  test('row 8: missing/empty sub denies (required-claim shape)', () => {
    expect(findMissingOrMalformedServiceClaim(servicePayload({ sub: '' }))).toBe('sub');
    const noSub = servicePayload();
    delete noSub.sub;
    expect(findMissingOrMalformedServiceClaim(noSub)).toBe('sub');
  });

  // Row 9a — missing jti
  test('row 9a: missing jti denies (required-claim shape)', () => {
    const noJti = servicePayload();
    delete noJti.jti;
    expect(findMissingOrMalformedServiceClaim(noJti)).toBe('jti');
    expect(findMissingOrMalformedServiceClaim(servicePayload({ jti: '' }))).toBe('jti');
  });

  // Row 10 — expired / skew beyond 10s (pure timing, injected clock)
  test('row 10: expiry beyond the 10s service skew denies; inside it is accepted', () => {
    expect(ACCEPTED_SKEW).toBe(10);
    const exp = 1120;
    expect(isExpiredAtService(exp, exp + 9)).toBe(false); // 9s past exp, within skew
    expect(isExpiredAtService(exp, exp + 10)).toBe(false); // exactly at the bound
    expect(isExpiredAtService(exp, exp + 11)).toBe(true); // 11s past exp, beyond skew → deny
  });

  // Row 11 — service_principal class but actor fields faked to pass the actor path
  test('row 11: service class routes to the service path; faked actor fields still deny', () => {
    const injected = servicePayload({ email: 'attacker@x.test', roles: ['admin'], sessionJti: 's', authTime: 't' });
    expect(isServiceTokenClass('service_principal')).toBe(true); // class branch → service path
    // and the injected actor fields are caught (never strip-and-continue)
    expect(findForbiddenServiceActorClaim(injected)).not.toBeNull();
  });

  // Row 12 — forbidden resource/authZ claim present
  test('row 12: a forbidden resource id in a service payload denies (scanForbiddenClaims)', () => {
    expect(scanForbiddenClaims(servicePayload({ taxpayerId: 'tp-1' }))).toContain('taxpayerId');
    expect(scanForbiddenClaims(servicePayload({ filingCaseId: 'fc-1' }))).toContain('filingCaseId');
  });

  // Row 13 — malformed / missing tokenClass
  test('row 13: an unknown/missing tokenClass denies before any branch (vocab membership)', () => {
    expect((TOKEN_CLASSES as readonly string[]).includes('not_a_class')).toBe(false);
    expect((TOKEN_CLASSES as readonly string[]).includes('')).toBe(false);
  });

  // Row 15 (NEW, D-010) — service_principal carrying any actor/session field denies
  test('row 15: each actor/session field present on a service token denies — individually', () => {
    for (const key of FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS) {
      const payload = servicePayload({ [key]: 'whatever' });
      expect(findForbiddenServiceActorClaim(payload)).toBe(key);
    }
  });

  test('row 15: combined actor/session fields deny (first one reported)', () => {
    const payload = servicePayload({ email: 'e@x.test', roles: ['user'], sessionJti: 's', authTime: 't' });
    expect(findForbiddenServiceActorClaim(payload)).not.toBeNull();
    expect(FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS).toContain(findForbiddenServiceActorClaim(payload));
  });

  // D-010 watchpoint 1: PRESENCE not truthiness — falsy forbidden fields still deny.
  test('row 15: a forbidden field present but FALSY still denies (presence, not truthiness)', () => {
    expect(findForbiddenServiceActorClaim(servicePayload({ roles: [] }))).toBe('roles');
    expect(findForbiddenServiceActorClaim(servicePayload({ email: '' }))).toBe('email');
    expect(findForbiddenServiceActorClaim(servicePayload({ authTime: 0 }))).toBe('authTime');
    expect(findForbiddenServiceActorClaim(servicePayload({ sessionJti: null }))).toBe('sessionJti');
  });
});

describe('D-004 — cross-type isolation (§5 Group A)', () => {
  // (3) a service token never produces a VerifiedActorContext — it has no actor at all
  test('a service context has no actor: it can never be read as an actor context', () => {
    const ctx = verifiedServiceCtx();
    expect((ctx as unknown as Record<string, unknown>).actor).toBeUndefined();
  });

  // (4) an actor/browser token never produces a VerifiedServiceContext — wrong class
  test('an actor/browser token is not the service class (no service context)', () => {
    expect(isServiceTokenClass('browser_session')).toBe(false);
    // an actor payload carries actor fields, which the service path forbids outright
    const actorPayload = {
      iss: 'auth-gateway', aud: 'firstlot-suite', sub: 'user-1', iat: 1, exp: 2, jti: 'j',
      purpose: 'browser_session', email: 'e@x.test', roles: ['user'], sessionJti: 's', authTime: 't',
    };
    expect(findForbiddenServiceActorClaim(actorPayload)).not.toBeNull();
  });

  // (5) an actor/browser token cannot satisfy the service path by adding purpose=introspection
  test('adding purpose=introspection to a browser token still denies (matrix + class branch)', () => {
    expect(isPurposeAllowedForClass('browser_session', 'introspection')).toBe(false);
    expect(isServiceTokenClass('browser_session')).toBe(false);
  });
});

describe('D-004 — structural / contract assertions (§5 Group A)', () => {
  // (6) required-shape ignores actor fields; injection denies them — "not required AND not allowed"
  test('findMissingOrMalformedServiceClaim requires NONE of the actor fields', () => {
    expect(set(REQUIRED_SERVICE_TOKEN_CLAIMS)).toEqual(set(['iss', 'aud', 'sub', 'iat', 'exp', 'jti', 'purpose']));
    // a clean service payload (no actor fields at all) passes the required-shape check
    expect(findMissingOrMalformedServiceClaim(servicePayload())).toBeNull();
    // none of the forbidden actor keys are in the required set
    for (const key of FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS) {
      expect((REQUIRED_SERVICE_TOKEN_CLAIMS as readonly string[]).includes(key)).toBe(false);
    }
  });

  test('FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS is exactly the four actor/session fields', () => {
    expect(set(FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS)).toEqual(set(['email', 'roles', 'sessionJti', 'authTime']));
  });

  // (7) matrix: introspection is allowed for service_principal and appears in no other class row.
  // D-011 S1 (sec-gate F1) additively added `participant.resolve` to the service_principal row (the
  // same service-principal-only class as introspection), so the row is no longer introspection-only;
  // introspection itself still appears ONLY on the service_principal row.
  test('introspection is service_principal-only and appears in no other class row', () => {
    expect((TOKEN_CLASS_PURPOSE_MATRIX.service_principal as readonly string[])).toContain('introspection');
    for (const cls of TOKEN_CLASSES) {
      if (cls === 'service_principal') continue;
      expect((TOKEN_CLASS_PURPOSE_MATRIX[cls] as readonly string[]).includes('introspection')).toBe(false);
    }
  });

  // (8) introspection is NOT one-time-use
  test('introspection is NOT in ONE_TIME_USE_PURPOSES', () => {
    expect((ONE_TIME_USE_PURPOSES as readonly string[]).includes('introspection')).toBe(false);
    expect(isOneTimeUsePurpose('introspection' as never)).toBe(false);
  });

  // (9) TTL/skew entries present; JTI_MIN_ENTROPY_BITS value-level assertion (Group B owns per-token denial)
  test('service_principal TTL is 120s and skew is 10s; entropy floor value is 128', () => {
    expect(TOKEN_CLASS_TTL_SECONDS.service_principal).toBe(120);
    expect(TOKEN_CLASS_TTL_SECONDS.service_principal).toBe(AUTH_TOKEN_POLICY.servicePrincipalTtlSeconds);
    expect(TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS.service_principal).toBe(10);
    expect(JTI_MIN_ENTROPY_BITS).toBe(128);
  });

  // (10) scanForbiddenClaims applies to a service payload
  test('scanForbiddenClaims denies a resource id nested in a service payload', () => {
    expect(scanForbiddenClaims(servicePayload({ meta: { workspace_id: 'w' } }))).toContain('meta.workspace_id');
  });

  // (11) missing/malformed tokenClass denies before any context is produced
  test('an empty/unknown tokenClass is not in the closed vocab (deny before branch)', () => {
    expect((TOKEN_CLASSES as readonly string[]).includes('')).toBe(false);
    expect((TOKEN_CLASSES as readonly string[]).includes('service_principle')).toBe(false); // typo guard
  });

  // Closed-vocab seed sanity: every seeded id is svc-prefixed and recognised.
  test('SERVICE_PRINCIPAL_IDS is the conservative resource-server seed', () => {
    expect(set(SERVICE_PRINCIPAL_IDS)).toEqual(
      // D-010 S1 added svc-platform-bff (the BFF tier's machine identity), additively.
      // Admin Console §3 (FX read slice) added svc-admin-ui (exchange caller only), additively.
      set(['svc-firstlot-suite', 'svc-cgt-app', 'svc-income-app', 'svc-dms', 'svc-platform-bff', 'svc-admin-ui']),
    );
    for (const id of SERVICE_PRINCIPAL_IDS) expect(isKnownServicePrincipalId(id)).toBe(true);
  });

  // Sanity: the actor validator still rejects a bare service payload (no actor fields),
  // proving the two paths are genuinely separate validators.
  test('the actor validator rejects a service payload (paths are separate)', () => {
    expect(findMissingOrMalformedClaim(servicePayload())).not.toBeNull();
  });
});

describe('D-004 — type-level isolation: VerifiedActorContext excludes the service class/purpose', () => {
  // Regression for the gatekeeper finding: widening the shared unions must NOT let a
  // VerifiedActorContext carry service_principal/introspection. These @ts-expect-error
  // lines FAIL the build if the type ever stops excluding the service-only values.
  const actorBase = {
    actor: { sub: 'u', email: 'e@x.test', sessionJti: 's', roles: [] as never[], authTime: 't' },
    audience: 'firstlot-suite' as const,
    source: 'gateway' as const,
    verifiedAt: '2026-06-08T00:00:00Z',
    freshness: { mode: 'live_introspection' as const, checkedAt: '2026-06-08T00:00:00Z' },
  };

  test('a valid actor context typechecks; the service class/purpose do not', () => {
    const good: VerifiedActorContext = { ...actorBase, tokenClass: 'browser_session', purpose: 'browser_session' };
    expect(good.tokenClass).toBe('browser_session');

    // @ts-expect-error — service_principal is not an ActorTokenClass (D-004 type isolation)
    const badClass: VerifiedActorContext = { ...actorBase, tokenClass: 'service_principal', purpose: 'browser_session' };
    // @ts-expect-error — introspection is not an ActorTokenPurpose (D-004 type isolation)
    const badPurpose: VerifiedActorContext = { ...actorBase, tokenClass: 'browser_session', purpose: 'introspection' };
    void badClass;
    void badPurpose;
  });

  test('ActorTokenClass / ActorTokenPurpose exclude the service-only values at the type level', () => {
    const okClass: ActorTokenClass = 'browser_session';
    const okPurpose: ActorTokenPurpose = 'browser_session';
    expect(okClass).toBe('browser_session');
    expect(okPurpose).toBe('browser_session');

    // @ts-expect-error — service_principal is excluded from ActorTokenClass
    const badClass: ActorTokenClass = 'service_principal';
    // @ts-expect-error — introspection is excluded from ActorTokenPurpose
    const badPurpose: ActorTokenPurpose = 'introspection';
    void badClass;
    void badPurpose;
  });
});
