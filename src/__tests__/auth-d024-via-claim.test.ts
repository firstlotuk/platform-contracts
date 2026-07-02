/**
 * 0.5.x d024 — B1 exchange-caller provenance claim (`via`) contract surface.
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB, NO crypto. These assert the additive
 * surface from
 *   specs/implementation/council/0.5.x-d024-suite-cgt-readonly-enforcement/02-approved-implementation-plan.md (§4.1/§5)
 * — the `via` claim key + purpose-scoped validator (D-001/D-002), the stamp-by-default /
 * BFF-exempt predicate (D-003), the mutating-method wrapper (D-005), and the forbidden-claim
 * non-collision reconciliation (§3.2). Signer-side (gateway) and verifier-side enforcement are
 * separately tested in their own packages.
 */
import {
  TOKEN_PURPOSES,
  SERVICE_PRINCIPAL_IDS,
  FORBIDDEN_ACTOR_CLAIM_KEYS,
  MUTATING_HTTP_METHODS,
  canonicalizeClaimKey,
  isForbiddenClaimKey,
  // d024 surface
  B1_EXCHANGE_VIA_CLAIM,
  B1_VIA_EXEMPT_CALLERS,
  shouldStampExchangeCaller,
  findForbiddenViaClaim,
  isMutatingMethod,
} from '../auth';
import type { ServicePrincipalId, VerifiedActorContext } from '../auth';

const NON_DOWNSTREAM_PURPOSES = TOKEN_PURPOSES.filter(p => p !== 'downstream_actor');

describe('d024 — claim key + exempt-list shape', () => {
  test('B1_EXCHANGE_VIA_CLAIM is the pinned claim key', () => {
    expect(B1_EXCHANGE_VIA_CLAIM).toBe('via');
  });

  test('exempt list is exactly the BFF (it fronts full app traffic incl. mutations)', () => {
    expect([...B1_VIA_EXEMPT_CALLERS]).toEqual(['svc-platform-bff']);
  });
});

describe('d024 — shouldStampExchangeCaller (D-003 stamp-by-default)', () => {
  test('the BFF is exempt', () => {
    expect(shouldStampExchangeCaller('svc-platform-bff')).toBe(false);
  });

  test('the suite is stamped', () => {
    expect(shouldStampExchangeCaller('svc-firstlot-suite')).toBe(true);
  });

  test('every non-exempt SERVICE_PRINCIPAL_IDS member is stamped (fail-closed for new callers)', () => {
    for (const id of SERVICE_PRINCIPAL_IDS) {
      const expected = !(B1_VIA_EXEMPT_CALLERS as readonly string[]).includes(id);
      expect(shouldStampExchangeCaller(id)).toBe(expected);
    }
  });
});

describe('d024 — findForbiddenViaClaim (D-002 purpose-scoped policy)', () => {
  test('absent via → null on EVERY purpose (presence-gated: unmarked tokens hit no new branch)', () => {
    for (const purpose of TOKEN_PURPOSES) {
      expect(findForbiddenViaClaim({}, purpose)).toBeNull();
    }
  });

  test('present on downstream_actor with every vocabulary value → null', () => {
    for (const id of SERVICE_PRINCIPAL_IDS) {
      expect(findForbiddenViaClaim({ via: id }, 'downstream_actor')).toBeNull();
    }
  });

  test.each([
    ['unknown principal', 'svc-evil'],
    ['empty string', ''],
    ['null', null],
    ['number', 42],
    ['array', ['svc-firstlot-suite']],
    ['object', { id: 'svc-firstlot-suite' }],
  ])('present on downstream_actor with non-vocabulary value (%s) → via', (_name, bad) => {
    expect(findForbiddenViaClaim({ via: bad }, 'downstream_actor')).toBe('via');
  });

  test('presence on every OTHER purpose denies — including falsy values (by hasOwnProperty)', () => {
    for (const purpose of NON_DOWNSTREAM_PURPOSES) {
      expect(findForbiddenViaClaim({ via: 'svc-firstlot-suite' }, purpose)).toBe('via');
      expect(findForbiddenViaClaim({ via: '' }, purpose)).toBe('via');
      expect(findForbiddenViaClaim({ via: null }, purpose)).toBe('via');
      expect(findForbiddenViaClaim({ via: undefined }, purpose)).toBe('via');
    }
  });

  test('presence on an unknown/free-string purpose denies (fail-closed)', () => {
    expect(findForbiddenViaClaim({ via: 'svc-firstlot-suite' }, 'made_up_purpose')).toBe('via');
  });
});

describe('d024 — isMutatingMethod (D-005: the existing RFC 9110 non-safe set)', () => {
  test('POST/PUT/PATCH/DELETE are mutating, case-insensitively', () => {
    for (const m of MUTATING_HTTP_METHODS) {
      expect(isMutatingMethod(m)).toBe(true);
      expect(isMutatingMethod(m.toLowerCase())).toBe(true);
    }
  });

  test('GET/HEAD/OPTIONS are not mutating', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get', 'head', 'options']) {
      expect(isMutatingMethod(m)).toBe(false);
    }
  });
});

describe('d024 §3.2 — forbidden-claim reconciliation (deliberate, recorded)', () => {
  test("via is NOT in FORBIDDEN_ACTOR_CLAIM_KEYS and canonicalizes onto no forbidden key", () => {
    expect(FORBIDDEN_ACTOR_CLAIM_KEYS as readonly string[]).not.toContain('via');
    expect(canonicalizeClaimKey('via')).toBe('via');
    expect(isForbiddenClaimKey('via')).toBe(false);
  });
});

describe('d024 — VerifiedActorContext.via type surface (compile-time)', () => {
  test('via is optional provenance typed to the closed principal vocabulary', () => {
    const base: Omit<VerifiedActorContext, 'via'> = {
      actor: {
        sub: 'user-1',
        email: 'user@x.test',
        sessionJti: 'sess-1',
        roles: ['user'],
        authTime: '2026-07-02T00:00:00Z',
      },
      audience: 'cgt-app',
      tokenClass: 'service_handshake',
      purpose: 'downstream_actor',
      source: 'gateway',
      verifiedAt: '2026-07-02T00:00:01Z',
      freshness: { mode: 'local_cache', checkedAt: 'x', cacheExpiresAt: 'y' },
    };
    const unmarked: VerifiedActorContext = { ...base };
    const marked: VerifiedActorContext = { ...base, via: 'svc-firstlot-suite' as ServicePrincipalId };
    expect(unmarked.via).toBeUndefined();
    expect(marked.via).toBe('svc-firstlot-suite');
  });
});
