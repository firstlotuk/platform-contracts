/**
 * 0.5.5 Stage 1 — platform auth contracts. Pins the canonical contract VALUES the
 * gateway and every resource server must agree on (D0 decisions / Task 0 spec).
 * Types-and-values only; no wiring. SYNTHETIC values.
 */
import {
  GATEWAY_AUDIENCES,
  PLATFORM_ROLES,
  AUTH_LOGIN_PROVIDERS,
  TOKEN_CLASSES,
  TOKEN_PURPOSES,
  TOKEN_SOURCES,
  PERMISSION_ACTIONS,
  AUTH_TOKEN_POLICY,
  SENSITIVE_OPERATIONS,
  RECOVERY_COMPLETION_OPERATIONS,
  sensitiveOperationAction,
  SERVICE_ONLY,
  REQUIRED_TOKEN_CLAIMS,
  FORBIDDEN_ACTOR_CLAIM_KEYS,
  type GatewayActor,
  type VerifiedActorContext,
} from '../auth';

const set = (a: readonly string[]) => new Set(a);

describe('auth contract — canonical unions', () => {
  test('audiences are exactly the seven platform surfaces plus the authority audience', () => {
    // 'admin-app' = the internal admin console audience (ADMIN_CONSOLE_SPEC Phase 0).
    expect(set(GATEWAY_AUDIENCES)).toEqual(
      set(['firstlot-suite', 'cgt-app', 'income-app', 'dms', 'platform-bff', 'myaccount-app', 'admin-app', 'auth-gateway']),
    );
  });

  test('platform roles are coarse only (no taxpayer/resource roles)', () => {
    expect(set(PLATFORM_ROLES)).toEqual(set(['user', 'admin', 'support']));
    // owner/accountant/viewer are taxpayer-scoped authZ, NOT platform roles
    for (const scoped of ['owner', 'accountant', 'viewer']) {
      expect((PLATFORM_ROLES as readonly string[]).includes(scoped)).toBe(false);
    }
  });

  test('login providers include email plus Google, Apple, and Microsoft', () => {
    expect(set(AUTH_LOGIN_PROVIDERS)).toEqual(set(['email', 'google', 'apple', 'microsoft']));
  });

  test('token sources cover gateway + the two 0.5.4 legacy bridges', () => {
    expect(set(TOKEN_SOURCES)).toEqual(set(['gateway', 'legacy_cgt_session', 'legacy_income_bridge']));
  });

  test('token purposes keep legacy suite_handshake AND the gateway-era child_app_status (D0.5 dual-accept)', () => {
    expect((TOKEN_PURPOSES as readonly string[]).includes('suite_handshake')).toBe(true);
    expect((TOKEN_PURPOSES as readonly string[]).includes('child_app_status')).toBe(true);
  });

  test('token classes distinguish the two handshake flavors', () => {
    expect(set(TOKEN_CLASSES)).toEqual(
      set(['browser_session', 'browser_redirect_handshake', 'service_handshake', 'service_principal']),
    );
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

  // 0.5.8 — the sliding-session model. The access token stays 600s (D-006: 0.5.7 S5's
  // 600→3600 widening is SUPERSEDED/REVERTED — never set 3600 here); the SESSION gets its
  // own idle (900s) + absolute (28800s) lifetime on the gateway_sessions row.
  test('session policy values match the ratified 0.5.8 set (idle 900s, absolute 28800s)', () => {
    expect(AUTH_TOKEN_POLICY.browserSessionTtlSeconds).toBe(600);  // access token NOT widened
    expect(AUTH_TOKEN_POLICY.idleSessionTtlSeconds).toBe(900);     // 15 min — HMRC GG / PCI DSS 8.2.8
    expect(AUTH_TOKEN_POLICY.absoluteSessionTtlSeconds).toBe(28800); // 8 h — one working day
  });

  test('hard invariant: access-token TTL < idle session TTL < absolute session cap', () => {
    // The first inequality is load-bearing: activity is sampled at the ~600s re-handshake
    // cadence, so the idle window MUST exceed that granularity or a session could idle-expire
    // before activity is ever sampled. 900 > 600 holds with a 300s margin.
    expect(AUTH_TOKEN_POLICY.browserSessionTtlSeconds).toBeLessThan(AUTH_TOKEN_POLICY.idleSessionTtlSeconds);
    expect(AUTH_TOKEN_POLICY.idleSessionTtlSeconds).toBeLessThan(AUTH_TOKEN_POLICY.absoluteSessionTtlSeconds);
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

  test('ADMIN_CONSOLE_SPEC §7 row 2 — accounts.{suspend,block,unlock,credential_reset,resend_verification} are sensitive ops, SERVICE_ONLY (no resource-authz action)', () => {
    for (const op of ['accounts.suspend', 'accounts.block', 'accounts.unlock', 'accounts.credential_reset', 'accounts.resend_verification'] as const) {
      expect((SENSITIVE_OPERATIONS as readonly string[]).includes(op)).toBe(true);
      expect(sensitiveOperationAction(op)).toBe(SERVICE_ONLY);
    }
  });
});

describe('auth contract — recovery-completion subset (Stage 2 partition / drift guard)', () => {
  test('recovery-completion ops are the add-a-recovery-channel flows', () => {
    expect(set(RECOVERY_COMPLETION_OPERATIONS)).toEqual(set(['auth.email_change', 'auth.recovery', 'auth.method_change']));
  });

  test('recovery-completion set is a STRICT SUBSET of SENSITIVE_OPERATIONS', () => {
    const sensitive = set(SENSITIVE_OPERATIONS);
    for (const op of RECOVERY_COMPLETION_OPERATIONS) expect(sensitive.has(op)).toBe(true);
    expect(RECOVERY_COMPLETION_OPERATIONS.length).toBeLessThan(SENSITIVE_OPERATIONS.length);
  });

  test('high-risk = SENSITIVE \\ RECOVERY-COMPLETION partitions the list (19 + 3 = 22, fail-closed)', () => {
    const recovery = set(RECOVERY_COMPLETION_OPERATIONS);
    const highRisk = SENSITIVE_OPERATIONS.filter(op => !recovery.has(op));
    // disjoint + complete: every sensitive op is in exactly one class
    expect(highRisk.length + RECOVERY_COMPLETION_OPERATIONS.length).toBe(SENSITIVE_OPERATIONS.length);
    expect(highRisk.some(op => (RECOVERY_COMPLETION_OPERATIONS as readonly string[]).includes(op))).toBe(false);
    expect(highRisk.length).toBe(19);
    expect(RECOVERY_COMPLETION_OPERATIONS.length).toBe(3);
    // a new unclassified sensitive op would land in high-risk (blocked) — fail closed
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
