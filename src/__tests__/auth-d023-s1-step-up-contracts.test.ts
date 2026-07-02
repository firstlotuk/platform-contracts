/**
 * 0.5.x d023 S1 — platform-contracts step-up re-auth contract surface.
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB, NO JWKS, NO crypto. These assert the
 * additive contract surface from
 *   specs/implementation/council/0.5.x-d023-step-up-issuance/02-approved-implementation-plan.md (§6.1/§8 S1)
 * — the step_up required-claim profile, the purpose-scoped `operation` policy (D-009), the shared
 * STEP_UP_HEADER, and the introspection/verify type extensions. This file carries the PURE-VALIDATOR
 * halves of threat tests T17–T19; the signer-side (S2) and verifier-side (S3) enforcement halves are
 * separately gated.
 */
import {
  SENSITIVE_OPERATIONS,
  TOKEN_PURPOSES,
  TOKEN_CLASS_PURPOSE_MATRIX,
  ONE_TIME_USE_PURPOSES,
  REQUIRED_GATEWAY_TOKEN_CLAIMS,
  FORBIDDEN_ACTOR_CLAIM_KEYS,
  scanForbiddenClaims,
  // d023 S1 surface
  STEP_UP_HEADER,
  REQUIRED_STEP_UP_TOKEN_CLAIMS,
  findMissingOrMalformedStepUpClaim,
  STEP_UP_ONLY_CLAIM_KEYS,
  findForbiddenStepUpOnlyClaim,
} from '../auth';
import type {
  SessionIntrospectionResult,
  StepUpIntrospectionResult,
  VerifiedStepUpProof,
  VerifiedActorContext,
  VerifyOptions,
} from '../auth';

// A well-formed step_up token payload (gateway actor shape + operation). Overridable per test.
const stepUpPayload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'auth-gateway',
  aud: 'cgt-app',
  sub: 'user-1',
  iat: 1000,
  exp: 1300,
  jti: 'jti-su-1',
  purpose: 'step_up',
  email: 'user@x.test',
  roles: ['user'],
  sessionJti: 'sess-1',
  authTime: '2026-07-02T00:00:00Z',
  operation: 'filing.submit',
  ...over,
});

describe('d023 S1 — shared header + claim-list shape', () => {
  test('STEP_UP_HEADER is the pinned lowercase header name (BFF forward + resource read share it)', () => {
    expect(STEP_UP_HEADER).toBe('x-firstlot-step-up');
    expect(STEP_UP_HEADER).toBe(STEP_UP_HEADER.toLowerCase());
  });

  test('REQUIRED_STEP_UP_TOKEN_CLAIMS = gateway actor shape + operation, exactly', () => {
    expect([...REQUIRED_STEP_UP_TOKEN_CLAIMS]).toEqual([
      ...REQUIRED_GATEWAY_TOKEN_CLAIMS,
      'operation',
    ]);
  });

  test('vocabulary is composed, not invented: step_up is already a purpose, one-time, and matrix-admitted', () => {
    expect(TOKEN_PURPOSES).toContain('step_up');
    expect(ONE_TIME_USE_PURPOSES).toContain('step_up');
    expect(TOKEN_CLASS_PURPOSE_MATRIX.service_handshake).toContain('step_up');
  });

  test('STEP_UP_ONLY_CLAIM_KEYS is exactly [operation]; operation is NOT in the global forbidden list', () => {
    expect([...STEP_UP_ONLY_CLAIM_KEYS]).toEqual(['operation']);
    expect(FORBIDDEN_ACTOR_CLAIM_KEYS as readonly string[]).not.toContain('operation');
  });
});

describe('d023 S1 — findMissingOrMalformedStepUpClaim (T17 pure half)', () => {
  test('a well-formed step_up payload passes', () => {
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload())).toBeNull();
  });

  test('every SENSITIVE_OPERATIONS member is accepted as the operation binding', () => {
    for (const op of SENSITIVE_OPERATIONS) {
      expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ operation: op }))).toBeNull();
    }
  });

  test('missing operation → operation', () => {
    const p = stepUpPayload();
    delete p.operation;
    expect(findMissingOrMalformedStepUpClaim(p)).toBe('operation');
  });

  test.each([
    ['empty string', ''],
    ['non-string number', 42],
    ['array', ['filing.submit']],
    ['object', { op: 'filing.submit' }],
    ['null', null],
  ])('malformed operation (%s) → operation', (_name, bad) => {
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ operation: bad }))).toBe('operation');
  });

  test('unknown operation string denies — a signed token never widens to sensitive (deliberate asymmetry with VerifyOptions.operation)', () => {
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ operation: 'totally.unknown' }))).toBe(
      'operation',
    );
  });

  test('wrong vocabulary — a PermissionAction like cgt.return.submit is NOT a SensitiveOperation → operation', () => {
    expect(
      findMissingOrMalformedStepUpClaim(stepUpPayload({ operation: 'cgt.return.submit' })),
    ).toBe('operation');
  });

  test('wrong purpose on an otherwise-complete payload → purpose', () => {
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ purpose: 'browser_session' }))).toBe(
      'purpose',
    );
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ purpose: 'downstream_actor' }))).toBe(
      'purpose',
    );
  });

  test('gateway actor shape is enforced first (missing/malformed base claims reported by name)', () => {
    const noSub = stepUpPayload();
    delete noSub.sub;
    expect(findMissingOrMalformedStepUpClaim(noSub)).toBe('sub');
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ authTime: '' }))).toBe('authTime');
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ roles: 'user' }))).toBe('roles');
    expect(findMissingOrMalformedStepUpClaim(stepUpPayload({ exp: 'soon' }))).toBe('exp');
  });
});

describe('d023 S1 — findForbiddenStepUpOnlyClaim (T18 pure half)', () => {
  const NON_STEP_UP_PURPOSES = TOKEN_PURPOSES.filter(p => p !== 'step_up');

  test('operation PRESENT on every non-step_up purpose denies by presence', () => {
    for (const purpose of NON_STEP_UP_PURPOSES) {
      expect(
        findForbiddenStepUpOnlyClaim({ purpose, operation: 'filing.submit' }, purpose),
      ).toBe('operation');
    }
  });

  test('presence, not truthiness: operation: "" still denies (every non-step_up purpose)', () => {
    for (const purpose of NON_STEP_UP_PURPOSES) {
      expect(findForbiddenStepUpOnlyClaim({ purpose, operation: '' }, purpose)).toBe('operation');
    }
  });

  test('absent operation on a non-step_up purpose is clean', () => {
    for (const purpose of NON_STEP_UP_PURPOSES) {
      expect(findForbiddenStepUpOnlyClaim({ purpose, sub: 'user-1' }, purpose)).toBeNull();
    }
  });

  test('operation on purpose=step_up is legal (the one purpose that carries it)', () => {
    expect(findForbiddenStepUpOnlyClaim(stepUpPayload(), 'step_up')).toBeNull();
  });

  test('top-level presence only — nested operation is this check’s non-goal (recursive scan covers nesting separately)', () => {
    expect(
      findForbiddenStepUpOnlyClaim(
        { purpose: 'browser_session', meta: { operation: 'filing.submit' } },
        'browser_session',
      ),
    ).toBeNull();
  });
});

describe('d023 S1 — global forbidden scan composes onto step_up (T19 pure half)', () => {
  test('a step_up token additionally carrying a forbidden resource/PII claim still denies (top-level)', () => {
    expect(scanForbiddenClaims(stepUpPayload({ taxpayerId: 'tp-1' }))).toEqual(['taxpayerId']);
  });

  test('nested forbidden claim on a step_up payload still denies — the purpose profile never waives the scan', () => {
    expect(scanForbiddenClaims(stepUpPayload({ meta: { nino: 'QQ123456C' } }))).toEqual([
      'meta.nino',
    ]);
  });

  test('a clean step_up payload passes the global scan (operation is not a forbidden key)', () => {
    expect(scanForbiddenClaims(stepUpPayload())).toEqual([]);
  });
});

describe('d023 S1 — type extensions compile and carry the pinned shapes', () => {
  test('SessionIntrospectionResult.stepUp is tri-state: absent / null / result', () => {
    const absent: SessionIntrospectionResult = { active: true, revoked: false };
    const unknownJti: SessionIntrospectionResult = { active: true, revoked: false, stepUp: null };
    const consumed: StepUpIntrospectionResult = {
      consumed: true,
      operation: 'filing.submit',
      authTime: '2026-07-02T00:00:00Z',
    };
    const won: SessionIntrospectionResult = { active: true, revoked: false, stepUp: consumed };
    expect(absent.stepUp).toBeUndefined();
    expect(unknownJti.stepUp).toBeNull();
    expect(won.stepUp?.consumed).toBe(true);
  });

  test('VerifyOptions.stepUpToken and VerifiedActorContext.stepUp are additive optionals', () => {
    const opts: VerifyOptions = {
      expectedAudience: 'cgt-app',
      operation: 'filing.submit',
      stepUpToken: 'raw.jwt.token',
    };
    const proof: VerifiedStepUpProof = {
      operation: 'filing.submit',
      authTime: '2026-07-02T00:00:00Z',
    };
    const ctx: Pick<VerifiedActorContext, 'stepUp'> = { stepUp: proof };
    expect(opts.stepUpToken).toBeDefined();
    expect(ctx.stepUp?.operation).toBe('filing.submit');
  });
});
