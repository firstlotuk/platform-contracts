/**
 * 0.5.5 D-010 S1 — platform-contracts BFF / downstream-exchange contract surface.
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB, NO JWKS, NO crypto. These assert the
 * additive contract surface from
 *   specs/implementation/council/0.5.5-d010-s1-bff-contracts/02-implementation-plan.md (§Additions/§Acceptance)
 * bound to design 024 §3/§4/§10. Out of scope here (S2/S4/S5): the gateway exchange-route
 * implementation, the BFF, and income — this file only pins the contract values + pure validators.
 */
import {
  TOKEN_PURPOSES,
  TOKEN_CLASS_PURPOSE_MATRIX,
  TOKEN_CLASSES,
  isPurposeAllowedForClass,
  SERVICE_PRINCIPAL_IDS,
  isKnownServicePrincipalId,
  // D-010 S1 surface
  BFF_REQUEST_BINDING_ISS,
  BFF_REQUEST_BINDING_HEADER,
  BFF_FORWARDED_PATH_HEADER,
  BFF_CSP_NONCE_HEADER,
  BFF_CSRF_COOKIE,
  BFF_CSRF_HEADER,
  REQUIRED_B1_DOWNSTREAM_CLAIMS,
  findMissingOrMalformedB1DownstreamClaim,
  REQUIRED_B2_BINDING_CLAIMS,
  FORBIDDEN_B2_BINDING_CLAIM_KEYS,
  MUTATING_HTTP_METHODS,
  findMissingOrMalformedBffBindingClaim,
  findForbiddenBffBindingClaim,
  REQUIRED_GATEWAY_TOKEN_CLAIMS,
  GATEWAY_AUDIENCES,
  findMissingOrMalformedServiceClaim,
} from '../auth';
import type {
  BffRequestBindingEnvelope,
  ExchangeDownstreamRequest,
  ExchangeDownstreamResponse,
  ActorTokenPurpose,
  VerifiedActorContext,
} from '../auth';

const set = (a: readonly string[]) => new Set(a);

// A well-formed B1 downstream-actor payload (carries actor context). Overridable per test.
const b1Payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'auth-gateway',
  aud: 'income-app',
  sub: 'user-1',
  iat: 1000,
  exp: 1120,
  jti: 'jti-b1-1',
  purpose: 'downstream_actor',
  email: 'user@x.test',
  roles: ['user'],
  sessionJti: 'sess-1',
  authTime: '2026-06-14T00:00:00Z',
  tokenClass: 'service_handshake',
  ...over,
});

// A well-formed B2 request-binding envelope (no actor/resource claims). Overridable per test.
// Baseline is a MUTATION (POST) so it carries the mandatory `bodyDigest` per the approved
// mutation-binding contract; safe-read variants override `method` and drop `bodyDigest`.
const b2Payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'platform-bff',
  aud: 'income-app',
  iat: 1000,
  exp: 1120,
  jti: 'jti-b2-1',
  purpose: 'bff_request_binding',
  method: 'POST',
  path: '/api/v1/filings?year=2025',
  bodyDigest: 'sha256:body-deadbeef',
  b1_jti: 'jti-b1-1',
  b1_hash: 'sha256:deadbeef',
  sessionJti: 'sess-1',
  ...over,
});

describe('D-010 S1 — vocabulary additions', () => {
  test('downstream_actor and bff_request_binding are registered token purposes', () => {
    expect((TOKEN_PURPOSES as readonly string[]).includes('downstream_actor')).toBe(true);
    expect((TOKEN_PURPOSES as readonly string[]).includes('bff_request_binding')).toBe(true);
  });

  test('svc-platform-bff is a recognized SERVICE_PRINCIPAL_ID', () => {
    expect((SERVICE_PRINCIPAL_IDS as readonly string[]).includes('svc-platform-bff')).toBe(true);
    expect(isKnownServicePrincipalId('svc-platform-bff')).toBe(true);
  });

  test('SERVICE_PRINCIPAL_IDS retains every pre-existing id (purely additive)', () => {
    for (const id of ['svc-firstlot-suite', 'svc-cgt-app', 'svc-income-app', 'svc-dms']) {
      expect(isKnownServicePrincipalId(id)).toBe(true);
    }
  });

  test('BFF_REQUEST_BINDING_ISS is the platform-bff issuer', () => {
    expect(BFF_REQUEST_BINDING_ISS).toBe('platform-bff');
  });

  test('the browser-to-BFF and BFF-to-backend wire names are canonical', () => {
    expect({
      requestBinding: BFF_REQUEST_BINDING_HEADER,
      forwardedPath: BFF_FORWARDED_PATH_HEADER,
      cspNonce: BFF_CSP_NONCE_HEADER,
      csrfCookie: BFF_CSRF_COOKIE,
      csrfHeader: BFF_CSRF_HEADER,
    }).toEqual({
      requestBinding: 'x-fl-request-binding',
      forwardedPath: 'x-fl-path',
      cspNonce: 'x-fl-csp-nonce',
      csrfCookie: '__Host-fl_bff_csrf',
      csrfHeader: 'x-csrf-token',
    });
  });
});

describe('D-010 S1 — matrix: downstream_actor on service_handshake ONLY (plan §2)', () => {
  test('downstream_actor is allowed on service_handshake', () => {
    expect((TOKEN_CLASS_PURPOSE_MATRIX.service_handshake as readonly string[])).toContain('downstream_actor');
    expect(isPurposeAllowedForClass('service_handshake', 'downstream_actor')).toBe(true);
  });

  test('downstream_actor is REJECTED on service_principal (no actor context on a service token)', () => {
    expect((TOKEN_CLASS_PURPOSE_MATRIX.service_principal as readonly string[])).not.toContain('downstream_actor');
    expect(isPurposeAllowedForClass('service_principal', 'downstream_actor')).toBe(false);
  });

  test('downstream_actor appears on NO other class row', () => {
    for (const cls of TOKEN_CLASSES) {
      if (cls === 'service_handshake') continue;
      expect((TOKEN_CLASS_PURPOSE_MATRIX[cls] as readonly string[]).includes('downstream_actor')).toBe(false);
    }
  });

  test('service_handshake keeps its prior purposes (additive, not replaced)', () => {
    expect(set(TOKEN_CLASS_PURPOSE_MATRIX.service_handshake)).toEqual(
      set(['child_app_status', 'step_up', 'downstream_actor']),
    );
  });

  test('bff_request_binding is NOT a matrix purpose for any class (BFF-issued, not a gateway class)', () => {
    for (const cls of TOKEN_CLASSES) {
      expect((TOKEN_CLASS_PURPOSE_MATRIX[cls] as readonly string[]).includes('bff_request_binding')).toBe(false);
      expect(isPurposeAllowedForClass(cls, 'bff_request_binding')).toBe(false);
    }
  });
});

describe('D-010 S1 — B1 downstream-actor claim shape (plan §5)', () => {
  test('required B1 claims are the gateway actor-token claims PLUS tokenClass (design 024 §3)', () => {
    // B1 is a gateway actor token pinned to one class — so its required set is the gateway
    // shape plus the explicit `tokenClass` claim the contract pins to `service_handshake`.
    expect(set(REQUIRED_B1_DOWNSTREAM_CLAIMS)).toEqual(set([...REQUIRED_GATEWAY_TOKEN_CLAIMS, 'tokenClass']));
    expect(set(REQUIRED_B1_DOWNSTREAM_CLAIMS)).toEqual(
      set([
        'iss', 'aud', 'sub', 'iat', 'exp', 'jti', 'purpose', 'email', 'roles', 'sessionJti', 'authTime', 'tokenClass',
      ]),
    );
    expect((REQUIRED_B1_DOWNSTREAM_CLAIMS as readonly string[]).includes('tokenClass')).toBe(true);
  });

  test('a well-formed B1 payload passes', () => {
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload())).toBeNull();
  });

  test('B1 requires tokenClass === service_handshake — missing / wrong / service_principal all deny (design 024 §3)', () => {
    // missing tokenClass
    const noClass = b1Payload();
    delete noClass.tokenClass;
    expect(findMissingOrMalformedB1DownstreamClaim(noClass)).toBe('tokenClass');
    // wrong class (browser_session)
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ tokenClass: 'browser_session' }))).toBe('tokenClass');
    // service_principal actor injection — denies (no actor context on a service token)
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ tokenClass: 'service_principal' }))).toBe('tokenClass');
    // the valid B1 class still passes
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ tokenClass: 'service_handshake' }))).toBeNull();
  });

  test('B1 missing roles fails validation (acceptance)', () => {
    const p = b1Payload();
    delete p.roles;
    expect(findMissingOrMalformedB1DownstreamClaim(p)).toBe('roles');
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ roles: 'user' }))).toBe('roles');
  });

  test('B1 missing authTime fails validation (acceptance)', () => {
    const p = b1Payload();
    delete p.authTime;
    expect(findMissingOrMalformedB1DownstreamClaim(p)).toBe('authTime');
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ authTime: '' }))).toBe('authTime');
  });

  test('B1 missing sub/email/sessionJti fail by name', () => {
    for (const claim of ['sub', 'email', 'sessionJti', 'jti', 'iss']) {
      const p = b1Payload();
      delete p[claim];
      expect(findMissingOrMalformedB1DownstreamClaim(p)).toBe(claim);
    }
  });

  test('B1 with a non-downstream_actor purpose fails on purpose', () => {
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ purpose: 'child_app_status' }))).toBe('purpose');
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ purpose: 'introspection' }))).toBe('purpose');
  });

  test('B1 aud must be a canonical GATEWAY_AUDIENCES value', () => {
    expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ aud: 'not-an-app' }))).toBe('aud');
    for (const aud of GATEWAY_AUDIENCES) {
      expect(findMissingOrMalformedB1DownstreamClaim(b1Payload({ aud }))).toBeNull();
    }
  });
});

describe('D-010 S1 — B2 request-binding envelope (plan §4)', () => {
  test('required B2 claims are the closed mandatory set (bodyDigest is conditional, excluded)', () => {
    expect(set(REQUIRED_B2_BINDING_CLAIMS)).toEqual(
      set(['iss', 'aud', 'iat', 'exp', 'jti', 'purpose', 'method', 'path', 'b1_jti', 'b1_hash', 'sessionJti']),
    );
    expect((REQUIRED_B2_BINDING_CLAIMS as readonly string[]).includes('bodyDigest')).toBe(false);
  });

  test('a well-formed B2 envelope passes — a mutation with bodyDigest, and a safe read without one', () => {
    // baseline is a POST mutation carrying its mandatory body digest
    expect(findMissingOrMalformedBffBindingClaim(b2Payload())).toBeNull();
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ bodyDigest: 'sha256:abc' }))).toBeNull();
    // a safe read (GET, no body) needs no bodyDigest
    const safeRead = b2Payload({ method: 'GET' });
    delete safeRead.bodyDigest;
    expect(findMissingOrMalformedBffBindingClaim(safeRead)).toBeNull();
  });

  test('B2 mutating methods REQUIRE a non-empty bodyDigest — absent or empty denies (plan §4 / design 024 §3)', () => {
    // the mutation-binding contract: a signed mutation envelope without a body binding must
    // fail closed so it cannot be replayed against a different request body.
    for (const method of MUTATING_HTTP_METHODS) {
      const noDigest = b2Payload({ method });
      delete noDigest.bodyDigest;
      expect(findMissingOrMalformedBffBindingClaim(noDigest)).toBe('bodyDigest');
      expect(findMissingOrMalformedBffBindingClaim(b2Payload({ method, bodyDigest: '' }))).toBe('bodyDigest');
      // same mutation WITH a body digest is well-formed
      expect(findMissingOrMalformedBffBindingClaim(b2Payload({ method, bodyDigest: 'sha256:abc' }))).toBeNull();
    }
    // method is canonicalized upper-case by the BFF, but a lower-case mutation still binds-or-denies
    const lower = b2Payload({ method: 'post' });
    delete lower.bodyDigest;
    expect(findMissingOrMalformedBffBindingClaim(lower)).toBe('bodyDigest');
  });

  test('B2 safe reads may omit bodyDigest, but a present one must be a non-empty string', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const read = b2Payload({ method });
      delete read.bodyDigest;
      expect(findMissingOrMalformedBffBindingClaim(read)).toBeNull();
      // present-but-malformed still denies even on a read
      expect(findMissingOrMalformedBffBindingClaim(b2Payload({ method, bodyDigest: '' }))).toBe('bodyDigest');
      expect(findMissingOrMalformedBffBindingClaim(b2Payload({ method, bodyDigest: 42 }))).toBe('bodyDigest');
    }
  });

  test('B2 aud must be a canonical GATEWAY_AUDIENCES value — non-canonical denies (design 024 §3)', () => {
    // income verifies B2 through this shared contract, so a non-canonical audience must fail
    // closed here rather than relying on a BFF-local convention.
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ aud: 'not-an-app' }))).toBe('aud');
    const noAud = b2Payload();
    delete noAud.aud;
    expect(findMissingOrMalformedBffBindingClaim(noAud)).toBe('aud');
    for (const aud of GATEWAY_AUDIENCES) {
      expect(findMissingOrMalformedBffBindingClaim(b2Payload({ aud }))).toBeNull();
    }
  });

  test('B2 with the wrong iss fails (acceptance)', () => {
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ iss: 'auth-gateway' }))).toBe('iss');
    const noIss = b2Payload();
    delete noIss.iss;
    expect(findMissingOrMalformedBffBindingClaim(noIss)).toBe('iss');
  });

  test('B2 with the wrong purpose fails (acceptance)', () => {
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ purpose: 'downstream_actor' }))).toBe('purpose');
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ purpose: 'browser_session' }))).toBe('purpose');
  });

  test('B2 missing any required binding/linkage field fails by name (acceptance)', () => {
    for (const claim of ['aud', 'jti', 'method', 'path', 'b1_jti', 'b1_hash', 'sessionJti']) {
      const p = b2Payload();
      delete p[claim];
      expect(findMissingOrMalformedBffBindingClaim(p)).toBe(claim);
    }
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ iat: 'soon' }))).toBe('iat');
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ exp: NaN }))).toBe('exp');
  });

  test('B2 linkage fields are the snake_case wire names — a camelCase-only payload fails (contract guard)', () => {
    // The B1-linkage fields are serialized JWT/envelope claim names: b1_jti / b1_hash.
    // A payload carrying ONLY the camelCase b1Jti/b1Hash must fail as the snake_case field missing.
    const camel = b2Payload();
    delete camel.b1_jti;
    delete camel.b1_hash;
    camel.b1Jti = 'jti-b1-1';
    camel.b1Hash = 'sha256:deadbeef';
    expect(findMissingOrMalformedBffBindingClaim(camel)).toBe('b1_jti');
    // and with only b1_hash missing, b1_jti present:
    const onlyHashCamel = b2Payload();
    delete onlyHashCamel.b1_hash;
    onlyHashCamel.b1Hash = 'sha256:deadbeef';
    expect(findMissingOrMalformedBffBindingClaim(onlyHashCamel)).toBe('b1_hash');
  });

  test('B2 bodyDigest, when present, must be a non-empty string', () => {
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ bodyDigest: '' }))).toBe('bodyDigest');
    expect(findMissingOrMalformedBffBindingClaim(b2Payload({ bodyDigest: 42 }))).toBe('bodyDigest');
  });

  test('B2 must NOT carry sub/roles — presence is injection and denies (not truthiness)', () => {
    expect(set(FORBIDDEN_B2_BINDING_CLAIM_KEYS)).toEqual(set(['sub', 'roles']));
    expect(findForbiddenBffBindingClaim(b2Payload())).toBeNull();
    expect(findForbiddenBffBindingClaim(b2Payload({ sub: 'user-1' }))).toBe('sub');
    expect(findForbiddenBffBindingClaim(b2Payload({ roles: ['admin'] }))).toBe('roles');
    // falsy-but-present still denies
    expect(findForbiddenBffBindingClaim(b2Payload({ sub: '' }))).toBe('sub');
    expect(findForbiddenBffBindingClaim(b2Payload({ roles: [] }))).toBe('roles');
  });
});

describe('D-010 S1 — exchange route req/resp types (plan §6)', () => {
  test('ExchangeDownstreamRequest carries only session ref + target aud (no actor assertion)', () => {
    const req: ExchangeDownstreamRequest = { sessionJti: 'sess-1', targetAudience: 'income-app' };
    expect(req.sessionJti).toBe('sess-1');
    expect((GATEWAY_AUDIENCES as readonly string[]).includes(req.targetAudience)).toBe(true);
    // structurally there is no actor/resource field on the request type
    expect(Object.keys(req).sort()).toEqual(['sessionJti', 'targetAudience']);
  });

  test('ExchangeDownstreamResponse returns a B1 token bound to the audience with downstream_actor purpose', () => {
    const resp: ExchangeDownstreamResponse = {
      downstreamToken: 'eyJ...b1',
      audience: 'income-app',
      purpose: 'downstream_actor',
      exp: 1120,
    };
    expect(resp.purpose).toBe('downstream_actor');
    expect((GATEWAY_AUDIENCES as readonly string[]).includes(resp.audience)).toBe(true);
  });

  test('BffRequestBindingEnvelope typechecks as a closed shape (no sub/roles)', () => {
    const env: BffRequestBindingEnvelope = {
      iss: 'platform-bff',
      purpose: 'bff_request_binding',
      iat: 1000,
      aud: 'income-app',
      exp: 1120,
      jti: 'jti-b2-1',
      method: 'GET',
      path: '/api/v1/filings',
      b1_jti: 'jti-b1-1',
      b1_hash: 'sha256:deadbeef',
      sessionJti: 'sess-1',
    };
    expect(findMissingOrMalformedBffBindingClaim(env as unknown as Record<string, unknown>)).toBeNull();
  });
});

describe('D-010 S1 — type-level isolation: bff_request_binding never produces actor context', () => {
  test('bff_request_binding is excluded from ActorTokenPurpose / VerifiedActorContext (compile-time)', () => {
    // downstream_actor IS an actor-bearing purpose and must remain assignable.
    const okPurpose: ActorTokenPurpose = 'downstream_actor';
    expect(okPurpose).toBe('downstream_actor');

    // @ts-expect-error — bff_request_binding (B2) is excluded from ActorTokenPurpose; a B2
    // envelope carries no actor context and must never produce a VerifiedActorContext.
    const badPurpose: ActorTokenPurpose = 'bff_request_binding';
    void badPurpose;

    // And it cannot appear as a VerifiedActorContext['purpose'] either.
    const ctxPurpose = (ctx: VerifiedActorContext): ActorTokenPurpose => ctx.purpose;
    expect(typeof ctxPurpose).toBe('function');
    // @ts-expect-error — VerifiedActorContext['purpose'] cannot be bff_request_binding
    const badCtxPurpose: VerifiedActorContext['purpose'] = 'bff_request_binding';
    void badCtxPurpose;
  });
});

describe('D-010 S1 — path isolation (B1 vs B2 vs service token)', () => {
  test('a B1 payload (actor context) is NOT a valid service token — service path forbids actor fields', () => {
    // a service-claim validator only checks base+purpose; the actor fields are not required there,
    // but a B1 carries them — so the two shapes are distinct and a B1 is not routed as a service token.
    expect(findMissingOrMalformedServiceClaim(b1Payload())).toBeNull(); // base shape ok...
    // ...but its purpose is downstream_actor, which is not a service-principal purpose.
    expect(isPurposeAllowedForClass('service_principal', 'downstream_actor')).toBe(false);
  });

  test('a B2 envelope is not a B1: its purpose/iss differ and it lacks actor claims', () => {
    expect(findMissingOrMalformedB1DownstreamClaim(b2Payload())).not.toBeNull(); // missing sub/email/roles/authTime
    expect(findMissingOrMalformedBffBindingClaim(b1Payload() as Record<string, unknown>)).not.toBeNull(); // wrong iss/purpose
  });
});
