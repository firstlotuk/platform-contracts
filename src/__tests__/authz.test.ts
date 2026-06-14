/**
 * 0.5.5 D-009 Phase D — the PDP front door (AUTHORIZATION_MODEL §2). Pins the hard invariants:
 * deny-by-default, fail-CLOSED on any policy/cache exception, each Decision effect → correct response
 * class, require_step_up does not itself grant access, and the ActingContext mandate slot is inert.
 * SYNTHETIC values.
 */
import type { GatewayActor } from '../auth';
import {
  authorize,
  requireDecision,
  isDecision,
  isMaskSpec,
  isAuthFresh,
  grantsAccess,
  allow,
  deny,
  allowWithMasking,
  allowReadonly,
  requireStepUp,
  STEP_UP_MAX_AUTH_AGE_SECONDS,
  type Decision,
  type ResourceRef,
  type PolicyFn,
} from '../authz';

const actor: GatewayActor = {
  sub: 'user-123',
  email: 'a@example.com',
  sessionJti: 'jti-1',
  roles: ['user'],
  authTime: '2026-06-14T12:00:00.000Z',
};
const resource: ResourceRef = { type: 'cgt.return', ownerSub: 'user-123', id: '2024-25' };
const allowPolicy: PolicyFn = () => allow();

describe('authorize — deny-by-default', () => {
  test('an action outside PERMISSION_ACTIONS denies, never consulting the policy', () => {
    let consulted = false;
    const policy: PolicyFn = () => {
      consulted = true;
      return allow();
    };
    const d = authorize(actor, 'cgt.return.delete', resource, {}, policy);
    expect(d).toEqual(deny('forbidden'));
    expect(consulted).toBe(false);
  });

  test('a registered action defers to the policy decision', () => {
    expect(authorize(actor, 'cgt.return.read', resource, {}, allowPolicy)).toEqual(allow());
  });
});

describe('authorize — fail-CLOSED', () => {
  test('a thrown policy/cache exception denies (no fall-through-to-allow)', () => {
    const throwing: PolicyFn = () => {
      throw new Error('cache unavailable');
    };
    expect(authorize(actor, 'cgt.return.submit', resource, {}, throwing)).toEqual(deny('forbidden'));
  });

  test('a malformed policy result denies', () => {
    const bad: PolicyFn = () => ({ effect: 'totally-allowed' } as unknown as Decision);
    expect(authorize(actor, 'cgt.return.export', resource, {}, bad)).toEqual(deny('forbidden'));
  });

  test('an undefined policy result denies', () => {
    const undef: PolicyFn = () => undefined as unknown as Decision;
    expect(authorize(actor, 'cgt.return.read', resource, {}, undef)).toEqual(deny('forbidden'));
  });
});

describe('authorize — ActingContext is inert (B4-gated)', () => {
  test('passing a mandate ActingContext changes nothing the policy is not written to read', () => {
    // The slot is accepted; no shipped policy reads it. A policy that ignores it returns the same.
    const d = authorize(
      actor,
      'cgt.return.read',
      resource,
      { acting: { onBehalfOfSub: 'someone-else', mandateId: 'm-1' } },
      allowPolicy,
    );
    expect(d).toEqual(allow());
  });
});

describe('isDecision — structural fail-closed guard', () => {
  test('accepts every well-formed effect', () => {
    expect(isDecision(allow())).toBe(true);
    expect(isDecision(allowReadonly('year:2024-25'))).toBe(true);
    expect(isDecision(deny('not_found'))).toBe(true);
    expect(isDecision(allowWithMasking({ kind: 'field_mask', fields: ['gain_loss'] }))).toBe(true);
    expect(isDecision(requireStepUp({ operation: 'filing.submit', maxAuthAgeSeconds: 300 }))).toBe(true);
  });

  test('rejects malformed shapes', () => {
    expect(isDecision(null)).toBe(false);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'nope' } })).toBe(false);
    expect(isDecision({ effect: 'deny', reason: 'banana' })).toBe(false);
    expect(isDecision({ effect: 'require_step_up', obligations: { operation: 'x' } })).toBe(false);
  });

  test('rejects malformed MASKING decisions fully — a known kind with a missing payload is NOT a grant', () => {
    // The gatekeeper P1: { kind: 'field_mask' } with no fields must fail closed, not survive as allow.
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'field_mask' } })).toBe(false);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'field_mask', fields: [] } })).toBe(false);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'field_mask', fields: [1, 2] } })).toBe(false);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'deep_mask' } })).toBe(false);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'multi_year' } })).toBe(false);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'multi_year', years: [] } })).toBe(false);
    expect(
      isDecision({ effect: 'allow_with_masking', mask: { kind: 'multi_year', years: ['2024-25'], fields: [] } }),
    ).toBe(false);
    // Well-formed variants still pass.
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'block' } })).toBe(true);
    expect(isDecision({ effect: 'allow_with_masking', mask: { kind: 'multi_year', years: ['2024-25'] } })).toBe(true);
  });

  test('rejects malformed STEP-UP obligations — non-finite / negative ages fail closed', () => {
    expect(isDecision({ effect: 'require_step_up', obligations: { operation: '', maxAuthAgeSeconds: 300 } })).toBe(false);
    expect(
      isDecision({ effect: 'require_step_up', obligations: { operation: 'x', maxAuthAgeSeconds: Number.NaN } }),
    ).toBe(false);
    expect(
      isDecision({ effect: 'require_step_up', obligations: { operation: 'x', maxAuthAgeSeconds: Infinity } }),
    ).toBe(false);
    expect(
      isDecision({ effect: 'require_step_up', obligations: { operation: 'x', maxAuthAgeSeconds: -1 } }),
    ).toBe(false);
  });
});

describe('isMaskSpec — every variant validated, not just kind', () => {
  test('accepts well-formed variants', () => {
    expect(isMaskSpec({ kind: 'block' })).toBe(true);
    expect(isMaskSpec({ kind: 'field_mask', fields: ['gain_loss'] })).toBe(true);
    expect(isMaskSpec({ kind: 'deep_mask', fields: ['cost', 'proceeds'] })).toBe(true);
    expect(isMaskSpec({ kind: 'multi_year', years: ['2024-25'] })).toBe(true);
    expect(isMaskSpec({ kind: 'multi_year', years: ['2024-25'], fields: ['cost'] })).toBe(true);
  });

  test('rejects malformed variants', () => {
    expect(isMaskSpec(null)).toBe(false);
    expect(isMaskSpec({ kind: 'unknown' })).toBe(false);
    expect(isMaskSpec({ kind: 'field_mask' })).toBe(false);
    expect(isMaskSpec({ kind: 'field_mask', fields: [] })).toBe(false);
    expect(isMaskSpec({ kind: 'deep_mask', fields: 'gain_loss' })).toBe(false);
    expect(isMaskSpec({ kind: 'multi_year', years: [] })).toBe(false);
    expect(isMaskSpec({ kind: 'multi_year', years: ['2024-25'], fields: [] })).toBe(false);
  });
});

describe('authorize — a malformed-mask policy result fails CLOSED at the front door', () => {
  test('a policy returning allow_with_masking with no fields is denied, never granted', () => {
    const badMask: PolicyFn = () =>
      ({ effect: 'allow_with_masking', mask: { kind: 'field_mask' } } as unknown as Decision);
    const d = authorize(actor, 'cgt.return.read', resource, {}, badMask);
    expect(d).toEqual(deny('forbidden'));
    expect(grantsAccess(d)).toBe(false);
  });
});

describe('requireDecision — Decision → response class', () => {
  test('allow / readonly grant access with no error status', () => {
    expect(requireDecision(allow())).toMatchObject({ granted: true, responseClass: 'ok', status: null });
    expect(requireDecision(allowReadonly())).toMatchObject({ granted: true, responseClass: 'readonly', status: null });
  });

  test('allow_with_masking grants and carries the mask', () => {
    const mask = { kind: 'deep_mask', fields: ['cost'] } as const;
    const out = requireDecision(allowWithMasking(mask));
    expect(out.granted).toBe(true);
    expect(out.responseClass).toBe('masked');
    expect(out.mask).toEqual(mask);
  });

  test('deny reasons map to the right status classes', () => {
    expect(requireDecision(deny('not_found'))).toMatchObject({ granted: false, responseClass: 'not_found', status: 404 });
    expect(requireDecision(deny('forbidden'))).toMatchObject({ granted: false, responseClass: 'forbidden', status: 403 });
    expect(requireDecision(deny('locked'))).toMatchObject({ granted: false, responseClass: 'entitlement_locked', status: 403 });
    expect(requireDecision(deny('consent_required'))).toMatchObject({ granted: false, responseClass: 'consent_required', status: 403 });
    expect(requireDecision(deny('expired'))).toMatchObject({ granted: false, responseClass: 'expired', status: 401 });
  });

  test('require_step_up does NOT grant access (it is a challenge, not an allow)', () => {
    const out = requireDecision(requireStepUp({ operation: 'filing.submit', maxAuthAgeSeconds: 300 }));
    expect(out.granted).toBe(false);
    expect(out.responseClass).toBe('step_up');
    expect(out.status).toBe(401);
    expect(grantsAccess(requireStepUp({ operation: 'x', maxAuthAgeSeconds: 300 }))).toBe(false);
  });
});

describe('isAuthFresh — step-up freshness (5 min, fail-closed)', () => {
  const now = new Date('2026-06-14T12:05:00.000Z');

  test('default threshold is the owner-confirmed 5 minutes', () => {
    expect(STEP_UP_MAX_AUTH_AGE_SECONDS).toBe(300);
  });

  test('auth within the window is fresh; outside is not', () => {
    expect(isAuthFresh('2026-06-14T12:01:00.000Z', now)).toBe(true); // 4 min old
    expect(isAuthFresh('2026-06-14T11:59:00.000Z', now)).toBe(false); // 6 min old
  });

  test('missing / unparseable / future authTime is NOT fresh (fail-closed)', () => {
    expect(isAuthFresh(undefined, now)).toBe(false);
    expect(isAuthFresh('not-a-date', now)).toBe(false);
    expect(isAuthFresh('2026-06-14T12:10:00.000Z', now)).toBe(false); // future
  });
});
