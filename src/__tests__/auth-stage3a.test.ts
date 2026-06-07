/**
 * 0.5.5 Stage 3A — signer/verifier contract surface. Pins the canonical values +
 * pure validators the gateway signer and the @firstlot/gateway-verifier library
 * both enforce (D-001/D-005/D-007/D-008, AGY-001/AGY-002/AGY-004). SYNTHETIC.
 */
import {
  GATEWAY_SIGNING_KEY_STATES,
  JWKS_PUBLISHED_KEY_STATES,
  isPublishedKeyState,
  TOKEN_CLASS_TTL_SECONDS,
  TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS,
  TOKEN_CLASS_PURPOSE_MATRIX,
  isPurposeAllowedForClass,
  ONE_TIME_USE_PURPOSES,
  isOneTimeUsePurpose,
  JTI_MIN_ENTROPY_BITS,
  isValidRoleSet,
  canonicalizeClaimKey,
  isForbiddenClaimKey,
  scanForbiddenClaims,
  REQUIRED_GATEWAY_TOKEN_CLAIMS,
  findMissingOrMalformedClaim,
  AUTH_TOKEN_POLICY,
} from '../auth';

const set = (a: readonly string[]) => new Set(a);

describe('Stage 3A — key states (D-005)', () => {
  test('four unambiguous states, retired terminal', () => {
    expect(set(GATEWAY_SIGNING_KEY_STATES)).toEqual(set(['next', 'signing', 'verifying_only', 'retired']));
  });

  test('JWKS publishes exactly next+signing+verifying_only, excludes retired', () => {
    expect(set(JWKS_PUBLISHED_KEY_STATES)).toEqual(set(['next', 'signing', 'verifying_only']));
    expect(isPublishedKeyState('retired')).toBe(false);
    for (const s of JWKS_PUBLISHED_KEY_STATES) expect(isPublishedKeyState(s)).toBe(true);
  });
});

describe('Stage 3A — class/TTL/skew (D-008)', () => {
  test('class TTLs are sourced from AUTH_TOKEN_POLICY', () => {
    expect(TOKEN_CLASS_TTL_SECONDS.browser_session).toBe(AUTH_TOKEN_POLICY.browserSessionTtlSeconds);
    expect(TOKEN_CLASS_TTL_SECONDS.service_handshake).toBe(AUTH_TOKEN_POLICY.serviceHandshakeTtlSeconds);
    expect(TOKEN_CLASS_TTL_SECONDS.browser_redirect_handshake).toBe(AUTH_TOKEN_POLICY.browserRedirectHandshakeTtlSeconds);
  });

  test('per-class skew: 10s service, 30s browser classes', () => {
    expect(TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS.service_handshake).toBe(10);
    expect(TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS.browser_session).toBe(30);
    expect(TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS.browser_redirect_handshake).toBe(30);
  });
});

describe('Stage 3A — class/purpose matrix (AGY-004)', () => {
  test('matrix is exactly the approved mapping', () => {
    expect(set(TOKEN_CLASS_PURPOSE_MATRIX.browser_session)).toEqual(set(['browser_session']));
    expect(set(TOKEN_CLASS_PURPOSE_MATRIX.browser_redirect_handshake)).toEqual(set(['suite_handshake']));
    expect(set(TOKEN_CLASS_PURPOSE_MATRIX.service_handshake)).toEqual(set(['child_app_status', 'step_up']));
  });

  test('every approved pair passes and every cross-pair denies', () => {
    expect(isPurposeAllowedForClass('browser_session', 'browser_session')).toBe(true);
    expect(isPurposeAllowedForClass('browser_redirect_handshake', 'suite_handshake')).toBe(true);
    expect(isPurposeAllowedForClass('service_handshake', 'child_app_status')).toBe(true);
    expect(isPurposeAllowedForClass('service_handshake', 'step_up')).toBe(true);
    // cross-pairs deny
    expect(isPurposeAllowedForClass('browser_session', 'child_app_status')).toBe(false);
    expect(isPurposeAllowedForClass('browser_redirect_handshake', 'step_up')).toBe(false);
    expect(isPurposeAllowedForClass('service_handshake', 'browser_session')).toBe(false);
  });
});

describe('Stage 3A — one-time-use purposes (AGY-002)', () => {
  test('suite_handshake + step_up are one-time-use; child_app_status is NOT', () => {
    expect(set(ONE_TIME_USE_PURPOSES)).toEqual(set(['suite_handshake', 'step_up']));
    expect(isOneTimeUsePurpose('suite_handshake')).toBe(true);
    expect(isOneTimeUsePurpose('step_up')).toBe(true);
    expect(isOneTimeUsePurpose('child_app_status')).toBe(false);
    expect(isOneTimeUsePurpose('browser_session')).toBe(false);
  });
});

describe('Stage 3A — JTI entropy floor (D-007)', () => {
  test('minimum entropy is 128 bits', () => {
    expect(JTI_MIN_ENTROPY_BITS).toBe(128);
  });
});

describe('Stage 3A — role-set validity', () => {
  test('valid only when every role is a platform role', () => {
    expect(isValidRoleSet(['user'])).toBe(true);
    expect(isValidRoleSet(['user', 'admin'])).toBe(true);
    expect(isValidRoleSet([])).toBe(true);
    expect(isValidRoleSet(['owner'])).toBe(false); // taxpayer-scoped, not platform
    expect(isValidRoleSet(['user', 'accountant'])).toBe(false);
  });
});

describe('Stage 3A — required gateway-token claims (plan §4)', () => {
  const validClaims = (): Record<string, unknown> => ({
    iss: 'i', aud: 'a', sub: 's', iat: 1, exp: 2, jti: 'j',
    purpose: 'browser_session', email: 'e@x.test', roles: ['user'],
    sessionJti: 'j', authTime: '2026-06-07T00:00:00Z',
  });

  test('the required set is the base claims plus the actor fields', () => {
    expect(set(REQUIRED_GATEWAY_TOKEN_CLAIMS)).toEqual(
      set(['iss', 'aud', 'sub', 'iat', 'exp', 'jti', 'purpose', 'email', 'roles', 'sessionJti', 'authTime']),
    );
  });

  test('a fully-populated claim set is accepted', () => {
    expect(findMissingOrMalformedClaim(validClaims())).toBeNull();
  });

  test('a missing actor claim is reported by name', () => {
    for (const claim of ['sub', 'email', 'authTime', 'purpose', 'sessionJti', 'roles']) {
      const claims = validClaims();
      delete claims[claim];
      expect(findMissingOrMalformedClaim(claims)).toBe(claim);
    }
  });

  test('a malformed claim (wrong type / empty string) is reported by name', () => {
    expect(findMissingOrMalformedClaim({ ...validClaims(), sub: '' })).toBe('sub');
    expect(findMissingOrMalformedClaim({ ...validClaims(), email: 42 })).toBe('email');
    expect(findMissingOrMalformedClaim({ ...validClaims(), authTime: null })).toBe('authTime');
    expect(findMissingOrMalformedClaim({ ...validClaims(), iat: 'soon' })).toBe('iat');
    expect(findMissingOrMalformedClaim({ ...validClaims(), exp: NaN })).toBe('exp');
    expect(findMissingOrMalformedClaim({ ...validClaims(), roles: 'user' })).toBe('roles');
  });
});

describe('Stage 3A — forbidden-claim normalization (AGY-001)', () => {
  test('canonicalization collapses case + separators', () => {
    expect(canonicalizeClaimKey('taxpayerId')).toBe('taxpayerid');
    expect(canonicalizeClaimKey('taxpayer_id')).toBe('taxpayerid');
    expect(canonicalizeClaimKey('TAXPAYER_ID')).toBe('taxpayerid');
    expect(canonicalizeClaimKey('taxpayer-id')).toBe('taxpayerid');
  });

  test('all spelling variants of a forbidden key are caught', () => {
    for (const k of ['taxpayerId', 'taxpayer_id', 'TAXPAYER_ID', 'taxpayer-id', 'workspace_id', 'accountant_grants', 'tax_figures']) {
      expect(isForbiddenClaimKey(k)).toBe(true);
    }
    expect(isForbiddenClaimKey('sub')).toBe(false);
    expect(isForbiddenClaimKey('email')).toBe(false);
  });

  test('recursive scan finds forbidden keys nested inside actor/claims objects', () => {
    expect(scanForbiddenClaims({ sub: 's', email: 'e@x.test' })).toEqual([]);
    expect(scanForbiddenClaims({ actor: { claims: { accountant_grants: ['x'] } } })).toContain('actor.claims.accountant_grants');
    expect(scanForbiddenClaims({ data: [{ tax_figures: { gain: 1 } }] })).toContain('data[0].tax_figures');
    expect(scanForbiddenClaims({ a: { b: { workspace_id: 'w' } } })).toContain('a.b.workspace_id');
  });
});
