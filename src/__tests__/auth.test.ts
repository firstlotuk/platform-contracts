/**
 * 0.5.5 Stage 1 — platform auth contracts. Pins the canonical contract VALUES the
 * gateway and every resource server must agree on (D0 decisions / Task 0 spec).
 * Types-and-values only; no wiring. SYNTHETIC values.
 */
import {
  GATEWAY_AUDIENCES,
  PLATFORM_ROLES,
  TOKEN_CLASSES,
  TOKEN_PURPOSES,
  TOKEN_SOURCES,
  PERMISSION_ACTIONS,
  AUTH_TOKEN_POLICY,
  SENSITIVE_OPERATIONS,
  REQUIRED_TOKEN_CLAIMS,
  FORBIDDEN_ACTOR_CLAIM_KEYS,
  type GatewayActor,
  type VerifiedActorContext,
} from '../auth';

const set = (a: readonly string[]) => new Set(a);

describe('auth contract — canonical unions', () => {
  test('audiences are exactly the five platform surfaces', () => {
    expect(set(GATEWAY_AUDIENCES)).toEqual(set(['firstlot-suite', 'cgt-app', 'income-app', 'dms', 'auth-gateway']));
  });

  test('platform roles are coarse only (no taxpayer/resource roles)', () => {
    expect(set(PLATFORM_ROLES)).toEqual(set(['user', 'admin', 'support']));
    // owner/accountant/viewer are taxpayer-scoped authZ, NOT platform roles
    for (const scoped of ['owner', 'accountant', 'viewer']) {
      expect((PLATFORM_ROLES as readonly string[]).includes(scoped)).toBe(false);
    }
  });

  test('token sources cover gateway + the two 0.5.4 legacy bridges', () => {
    expect(set(TOKEN_SOURCES)).toEqual(set(['gateway', 'legacy_cgt_session', 'legacy_income_bridge']));
  });

  test('token purposes keep legacy suite_handshake AND the gateway-era child_app_status (D0.5 dual-accept)', () => {
    expect((TOKEN_PURPOSES as readonly string[]).includes('suite_handshake')).toBe(true);
    expect((TOKEN_PURPOSES as readonly string[]).includes('child_app_status')).toBe(true);
  });

  test('token classes distinguish the two handshake flavors', () => {
    expect(set(TOKEN_CLASSES)).toEqual(set(['browser_session', 'browser_redirect_handshake', 'service_handshake']));
  });

  test('permission actions exist and authZ vocabulary is present', () => {
    for (const a of ['filing.read', 'document.decrypt_for_extraction', 'access.grant', 'access.revoke']) {
      expect((PERMISSION_ACTIONS as readonly string[]).includes(a)).toBe(true);
    }
  });
});

describe('auth contract — D0.3 policy values', () => {
  test('token TTLs match the resolved D0.3 values (seconds)', () => {
    expect(AUTH_TOKEN_POLICY.browserSessionTtlSeconds).toBe(600);          // 10 min
    expect(AUTH_TOKEN_POLICY.serviceHandshakeTtlSeconds).toBe(120);        // 2 min
    expect(AUTH_TOKEN_POLICY.browserRedirectHandshakeTtlSeconds).toBe(900); // 15 min
  });

  test('cache propagation SLAs match D0.3 (revocation 30s, permission 60s)', () => {
    expect(AUTH_TOKEN_POLICY.revocationCachePropagationSlaSeconds).toBe(30);
    expect(AUTH_TOKEN_POLICY.permissionCachePropagationSlaSeconds).toBe(60);
  });

  test('browser session TTL stays within the spec 5-15 min replay bound', () => {
    expect(AUTH_TOKEN_POLICY.browserSessionTtlSeconds).toBeGreaterThanOrEqual(300);
    expect(AUTH_TOKEN_POLICY.browserSessionTtlSeconds).toBeLessThanOrEqual(900);
  });

  test('sensitive ops requiring live introspection include the D0.3 set', () => {
    for (const op of ['dms.decrypt', 'auth.password_change', 'access.grant', 'access.revoke', 'auth.break_glass', 'filing.submit', 'session.revoke_all']) {
      expect((SENSITIVE_OPERATIONS as readonly string[]).includes(op)).toBe(true);
    }
  });
});

describe('auth contract — claim policy', () => {
  test('required claims cover iss/aud/sub/iat/exp/jti', () => {
    expect(set(REQUIRED_TOKEN_CLAIMS)).toEqual(set(['iss', 'aud', 'sub', 'iat', 'exp', 'jti']));
  });

  test('forbidden actor-claim keys block authZ proof + PII in tokens', () => {
    for (const k of ['taxpayerId', 'filingCaseId', 'documentId', 'accountantGrants', 'utr', 'nino']) {
      expect((FORBIDDEN_ACTOR_CLAIM_KEYS as readonly string[]).includes(k)).toBe(true);
    }
  });
});

describe('auth contract — shapes compile + construct', () => {
  test('a GatewayActor carries opaque sub + coarse roles, no ownership', () => {
    const actor: GatewayActor = {
      sub: '01J0-opaque-ulid',
      email: 'user@example.test',
      sessionJti: 'jti-123',
      roles: ['user'],
      authTime: '2026-06-05T00:00:00Z',
    };
    expect(actor.sub).not.toMatch(/@/); // not an email
    expect(actor.roles.every(r => (PLATFORM_ROLES as readonly string[]).includes(r))).toBe(true);
  });

  test('VerifiedActorContext discriminates freshness and exposes the token source', () => {
    const ctx: VerifiedActorContext = {
      actor: { sub: 's', email: 'e@x.test', sessionJti: 'j', roles: ['user'], authTime: '2026-06-05T00:00:00Z' },
      audience: 'income-app',
      tokenClass: 'service_handshake',
      purpose: 'child_app_status',
      source: 'gateway',
      verifiedAt: '2026-06-05T00:00:00Z',
      freshness: { mode: 'live_introspection', checkedAt: '2026-06-05T00:00:00Z' },
    };
    expect(ctx.source).toBe('gateway');
    expect(ctx.freshness.mode).toBe('live_introspection');
  });
});
