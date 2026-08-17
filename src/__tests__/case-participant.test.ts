/**
 * D-011 Stage 1 — platform-contracts durable-identity vocabulary (`case_participant`).
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB. These assert the additive contract surface
 * from
 *   specs/implementation/council/0.5.6-d011-stage1-contracts/02-implementation-plan.md (§Build/§Tests)
 * bound to the council-approved design §3/§6 and SECURITY-GATE-ADJUDICATION F1 + F8. Out of scope
 * here (Stages 2–5): the suite participant store, the resolver endpoint, and any service wiring —
 * this file only pins the vocabulary, the resolution shapes, and the shared role/status → Decision
 * mapping helper.
 */
import {
  // D-011 S1 case_participant surface
  CASE_ROLES,
  isCaseRole,
  PARTICIPANT_STATUSES,
  isParticipantStatus,
  PARTICIPANT_RESOLVE_SENSITIVITIES,
  PARTICIPANT_RESOLUTION_STATUSES,
  roleStatusEntitlement,
  participantDecision,
  // shared PDP Decision surface (the helper reuses these invariants)
  isDecision,
  grantsAccess,
  deny,
  // F1 — auth purpose vocabulary
  TOKEN_PURPOSES,
  TOKEN_CLASSES,
  TOKEN_CLASS_PURPOSE_MATRIX,
  isPurposeAllowedForClass,
  isOneTimeUsePurpose,
  FORBIDDEN_ACTOR_CLAIM_KEYS,
  // F1 — service-principal purpose vocabulary / acceptance surface
  SERVICE_PRINCIPAL_TOKEN_PURPOSES,
  isServiceTokenPurpose,
  isIntrospectionCaller,
} from '../index';
import type {
  CaseParticipant,
  CaseRole,
  ParticipantResolution,
  ParticipantResolveRequest,
  ParticipantResolveSensitivity,
} from '../index';
import type { ActorTokenPurpose, TokenPurpose, VerifiedServiceContext } from '../auth';
import type { Decision } from '../authz';

const set = (a: readonly string[]) => new Set(a);

// Compile-time assertion helper (no runtime effect).
type Assert<T extends true> = T;

// ---------------------------------------------------------------------------
// Closed vocabulary (design §3)
// ---------------------------------------------------------------------------

describe('case_participant closed vocabulary (design §3)', () => {
  test('CaseRole is EXACTLY the pinned closed set owner/accountant/support (final for Part B)', () => {
    expect(set(CASE_ROLES)).toEqual(set(['owner', 'accountant', 'support']));
  });

  test('isCaseRole is a fail-closed membership check', () => {
    for (const r of CASE_ROLES) expect(isCaseRole(r)).toBe(true);
    for (const bad of ['admin', 'user', 'OWNER', '', 'taxpayer', undefined, null, 1, {}]) {
      expect(isCaseRole(bad as unknown)).toBe(false);
    }
  });

  test('ParticipantStatus is EXACTLY active/inactive', () => {
    expect(set(PARTICIPANT_STATUSES)).toEqual(set(['active', 'inactive']));
  });

  test('isParticipantStatus is a fail-closed membership check', () => {
    for (const s of PARTICIPANT_STATUSES) expect(isParticipantStatus(s)).toBe(true);
    for (const bad of ['revoked', 'not_participant', 'ACTIVE', '', undefined, null, 0]) {
      expect(isParticipantStatus(bad as unknown)).toBe(false);
    }
  });

  test('resolve sensitivity is exactly standard/sensitive; resolution statuses add not_participant', () => {
    expect(set(PARTICIPANT_RESOLVE_SENSITIVITIES)).toEqual(set(['standard', 'sensitive']));
    expect(set(PARTICIPANT_RESOLUTION_STATUSES)).toEqual(set(['active', 'inactive', 'not_participant']));
  });
});

// ---------------------------------------------------------------------------
// Shapes — types compile + serialize (design §3, D-006)
// ---------------------------------------------------------------------------

describe('CaseParticipant / resolution shapes', () => {
  test('CaseParticipant shape compiles + serializes', () => {
    const row: CaseParticipant = {
      filing_case_id: 'fc-1',
      participant_sub: 'sub-1',
      role: 'owner',
      status: 'active',
    };
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  test('ParticipantResolveRequest — filing_case_id arm carries (sub,case) key + sensitivity, no app-local ids', () => {
    const req: ParticipantResolveRequest = {
      filing_case_id: 'fc-1',
      participant_sub: 'sub-1',
      sensitivity: 'sensitive',
    };
    expect(Object.keys(req).sort()).toEqual(['filing_case_id', 'participant_sub', 'sensitivity']);
    const sens: ParticipantResolveSensitivity[] = ['standard', 'sensitive'];
    expect(sens).toHaveLength(2);
  });

  test('ParticipantResolveRequest — tax_year arm is valid without filing_case_id', () => {
    const req: ParticipantResolveRequest = {
      tax_year: '2023-24',
      participant_sub: 'sub-1',
      sensitivity: 'standard',
    };
    expect(Object.keys(req).sort()).toEqual(['participant_sub', 'sensitivity', 'tax_year']);
  });

  test('ParticipantResolveRequest — discriminated union rejects both arms present (compile-time)', () => {
    // @ts-expect-error passing both filing_case_id and tax_year must not satisfy the union
    const _both: ParticipantResolveRequest = {
      filing_case_id: 'fc-1',
      tax_year: '2023-24',
      participant_sub: 'sub-1',
      sensitivity: 'standard',
    };
    void _both;
    expect(true).toBe(true); // compile-time assertion above is the real check
  });

  test('ParticipantResolveRequest — discriminated union rejects neither arm present (compile-time)', () => {
    // @ts-expect-error omitting both filing_case_id and tax_year must not satisfy the union
    const _neither: ParticipantResolveRequest = {
      participant_sub: 'sub-1',
      sensitivity: 'standard',
    };
    void _neither;
    expect(true).toBe(true); // compile-time assertion above is the real check
  });

  test('ParticipantResolution active variant carries ROLE ONLY — never a Decision/effect', () => {
    const active: ParticipantResolution = {
      status: 'active',
      filing_case_id: 'fc-1',
      participant_sub: 'sub-1',
      role: 'owner',
    };
    // The active variant exposes a `role` and NO `effect`/`mask`/Decision-shaped field.
    expect(active).toHaveProperty('role');
    expect(active).not.toHaveProperty('effect');
    expect(active).not.toHaveProperty('decision');
    expect(active).not.toHaveProperty('mask');
    const role: CaseRole = active.role;
    expect(CASE_ROLES.includes(role)).toBe(true);

    const inactive: ParticipantResolution = { status: 'inactive' };
    const none: ParticipantResolution = { status: 'not_participant' };
    expect(Object.keys(inactive)).toEqual(['status']);
    expect(Object.keys(none)).toEqual(['status']);
  });
});

// ---------------------------------------------------------------------------
// F8 — shared role/status → Decision mapping helper, exhaustive conformance suite.
// ---------------------------------------------------------------------------

const isDeny = (d: Decision, reason = 'forbidden') => d.effect === 'deny' && (d as { reason: string }).reason === reason;

describe('roleStatusEntitlement (pre-B4 role/status → Decision)', () => {
  test('owner + active → allow (the sole taxpayer-data authorizer)', () => {
    expect(roleStatusEntitlement('owner', 'active')).toEqual({ effect: 'allow' });
  });

  test('accountant + active → deny(forbidden) (inert mandate slot, pre-B4)', () => {
    expect(isDeny(roleStatusEntitlement('accountant', 'active'))).toBe(true);
  });

  test('support + active → deny(forbidden) (no B4 path to taxpayer data)', () => {
    expect(isDeny(roleStatusEntitlement('support', 'active'))).toBe(true);
  });

  test('any non-active status denies regardless of role (incl. owner)', () => {
    for (const role of [...CASE_ROLES, 'admin', '', undefined, null]) {
      for (const status of ['inactive', 'not_participant', 'pending', '', undefined, null]) {
        expect(isDeny(roleStatusEntitlement(role as unknown, status as unknown))).toBe(true);
      }
    }
  });

  test('unknown/missing role with active status denies', () => {
    for (const bad of ['hacker', 'OWNER', '', undefined, null, 1, {}]) {
      expect(isDeny(roleStatusEntitlement(bad as unknown, 'active'))).toBe(true);
    }
  });

  test('every output is a well-formed Decision; only active-owner grants access', () => {
    const inputs: Array<[unknown, unknown]> = [
      ['owner', 'active'], ['accountant', 'active'], ['support', 'active'],
      ['owner', 'inactive'], ['hacker', 'active'], [undefined, undefined],
    ];
    for (const [role, status] of inputs) {
      const d = roleStatusEntitlement(role, status);
      expect(isDecision(d)).toBe(true);
      expect(grantsAccess(d)).toBe(role === 'owner' && status === 'active');
    }
  });
});

describe('participantDecision (F8 load-bearing resolution → Decision helper)', () => {
  const active = (over: Record<string, unknown> = {}): unknown => ({
    status: 'active',
    filing_case_id: 'fc-1',
    participant_sub: 'sub-1',
    role: 'owner',
    ...over,
  });

  test('well-formed active owner → allow (the only allow path)', () => {
    expect(participantDecision(active())).toEqual({ effect: 'allow' });
    expect(grantsAccess(participantDecision(active()))).toBe(true);
  });

  test('active accountant / support → deny(forbidden)', () => {
    expect(isDeny(participantDecision(active({ role: 'accountant' })))).toBe(true);
    expect(isDeny(participantDecision(active({ role: 'support' })))).toBe(true);
  });

  test('not_participant (no row) → deny (deny-by-default; no implicit access)', () => {
    expect(isDeny(participantDecision({ status: 'not_participant' }))).toBe(true);
  });

  test('inactive (revoked row) → deny', () => {
    expect(isDeny(participantDecision({ status: 'inactive' }))).toBe(true);
  });

  test('missing status → deny', () => {
    expect(isDeny(participantDecision({ filing_case_id: 'fc-1', participant_sub: 'sub-1', role: 'owner' }))).toBe(true);
  });

  test('unknown status → deny', () => {
    expect(isDeny(participantDecision(active({ status: 'pending' })))).toBe(true);
    expect(isDeny(participantDecision(active({ status: 'ACTIVE' })))).toBe(true);
  });

  test('active with unknown / missing role → deny', () => {
    expect(isDeny(participantDecision(active({ role: 'hacker' })))).toBe(true);
    expect(isDeny(participantDecision(active({ role: undefined })))).toBe(true);
    const { role, ...noRole } = active() as Record<string, unknown>;
    void role;
    expect(isDeny(participantDecision(noRole))).toBe(true);
  });

  test('active but partial (missing/blank filing_case_id or participant_sub) → deny', () => {
    expect(isDeny(participantDecision(active({ filing_case_id: undefined })))).toBe(true);
    expect(isDeny(participantDecision(active({ filing_case_id: '' })))).toBe(true);
    expect(isDeny(participantDecision(active({ participant_sub: undefined })))).toBe(true);
    expect(isDeny(participantDecision(active({ participant_sub: '' })))).toBe(true);
    expect(isDeny(participantDecision(active({ filing_case_id: 123 })))).toBe(true);
  });

  test('malformed envelope (null / non-object / array / string) → deny', () => {
    for (const bad of [null, undefined, 42, 'active', [], [{ status: 'active' }], true]) {
      expect(isDeny(participantDecision(bad as unknown))).toBe(true);
    }
  });

  test('EVERY input yields a well-formed Decision and never an accidental allow', () => {
    const inputs: unknown[] = [
      active(), active({ role: 'accountant' }), active({ role: 'support' }),
      active({ role: 'hacker' }), active({ status: 'pending' }), { status: 'inactive' },
      { status: 'not_participant' }, {}, null, [], 'x', 7,
    ];
    for (const i of inputs) {
      const d = participantDecision(i);
      expect(isDecision(d)).toBe(true);
      // The single allow is a well-formed active owner; everything else must NOT grant access.
      const isActiveOwner =
        !!i && typeof i === 'object' && !Array.isArray(i) &&
        (i as Record<string, unknown>).status === 'active' &&
        (i as Record<string, unknown>).role === 'owner';
      expect(grantsAccess(d)).toBe(isActiveOwner);
    }
  });

  test('helper output composes with the PDP deny contract (reuses authz.ts invariants)', () => {
    // A deny from the helper is indistinguishable in shape from a direct deny('forbidden').
    expect(participantDecision({ status: 'inactive' })).toEqual(deny('forbidden'));
  });
});

// ---------------------------------------------------------------------------
// F1 — dedicated participant.resolve service-token purpose.
// ---------------------------------------------------------------------------

describe('participant.resolve service-token purpose (sec-gate F1)', () => {
  test('participant.resolve is in TOKEN_PURPOSES', () => {
    expect((TOKEN_PURPOSES as readonly string[]).includes('participant.resolve')).toBe(true);
  });

  test('participant.resolve is a service_principal-class-ONLY purpose', () => {
    expect(isPurposeAllowedForClass('service_principal', 'participant.resolve')).toBe(true);
    for (const cls of TOKEN_CLASSES) {
      if (cls === 'service_principal') continue;
      expect(isPurposeAllowedForClass(cls, 'participant.resolve')).toBe(false);
    }
    // It appears in exactly one matrix row (service_principal).
    const rowsContaining = TOKEN_CLASSES.filter(cls =>
      (TOKEN_CLASS_PURPOSE_MATRIX[cls] as readonly string[]).includes('participant.resolve'),
    );
    expect(rowsContaining).toEqual(['service_principal']);
  });

  test('participant.resolve is DISTINCT from introspection (both service_principal-only, neither implies the other)', () => {
    const row = TOKEN_CLASS_PURPOSE_MATRIX.service_principal as readonly string[];
    expect(row).toContain('introspection');
    expect(row).toContain('participant.resolve');
    // Two separate purpose values — a participant-lookup authority is not an introspection authority.
    expect('participant.resolve').not.toEqual('introspection');
    // introspection is unchanged and still service_principal-only.
    expect(isPurposeAllowedForClass('service_principal', 'introspection')).toBe(true);
  });

  test('participant.resolve is excluded from ActorTokenPurpose (compile-time + runtime)', () => {
    // Compile-time: participant.resolve must NOT be assignable to ActorTokenPurpose.
    type _ExcludedFromActor = Assert<'participant.resolve' extends ActorTokenPurpose ? false : true>;
    // And it remains a member of the full TokenPurpose union.
    type _StillATokenPurpose = Assert<'participant.resolve' extends TokenPurpose ? true : false>;
    const _a: _ExcludedFromActor = true;
    const _b: _StillATokenPurpose = true;
    expect(_a && _b).toBe(true);
    // Runtime: no actor token class can carry it (it appears only on the service_principal row).
    const actorClasses = TOKEN_CLASSES.filter(c => c !== 'service_principal');
    for (const cls of actorClasses) {
      expect(isPurposeAllowedForClass(cls, 'participant.resolve')).toBe(false);
    }
  });

  test('participant.resolve is not a one-time-use purpose', () => {
    expect(isOneTimeUsePurpose('participant.resolve')).toBe(false);
  });

  // sec-gate F1 fix: the dedicated purpose must be in the service-principal purpose
  // VOCABULARY/type surface (so Stage 2 can type a verified participant.resolve service
  // context), not just the class matrix — while staying distinct from introspection.
  test('participant.resolve is in the service-principal purpose vocabulary, alongside introspection', () => {
    // d065 retired `connections.issue` from this vocabulary (vault → session-derived B1 exchange);
    // the Admin Console FX read slice added `authz.snapshot` (console authz-feed read).
    expect(set(SERVICE_PRINCIPAL_TOKEN_PURPOSES)).toEqual(
      set(['introspection', 'participant.resolve', 'authz.snapshot']),
    );
    expect(isServiceTokenPurpose('participant.resolve')).toBe(true);
    expect(isServiceTokenPurpose('introspection')).toBe(true);
  });

  test('isIntrospectionCaller stays introspection-only — a participant.resolve service ctx denies', () => {
    const baseCtx: VerifiedServiceContext = {
      principal: { serviceId: 'svc-firstlot-suite', audience: 'auth-gateway', purpose: 'introspection' },
      audience: 'auth-gateway',
      tokenClass: 'service_principal',
      purpose: 'introspection',
      source: 'gateway',
      verifiedAt: '2026-06-20T00:00:00Z',
    };
    // introspection purpose + accepted id → accepted (control).
    expect(isIntrospectionCaller(baseCtx, ['svc-firstlot-suite'])).toBe(true);
    // participant.resolve purpose, same known+accepted id → DENIED (purpose narrowing).
    const resolveCtx: VerifiedServiceContext = {
      ...baseCtx,
      purpose: 'participant.resolve',
      principal: { ...baseCtx.principal, purpose: 'participant.resolve' },
    };
    expect(isIntrospectionCaller(resolveCtx, ['svc-firstlot-suite'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additive guard (plan §Tests) — forbidden-claim list unchanged.
// ---------------------------------------------------------------------------

describe('additive guard', () => {
  test('filingCaseId stays on FORBIDDEN_ACTOR_CLAIM_KEYS (case id never rides in a token)', () => {
    expect((FORBIDDEN_ACTOR_CLAIM_KEYS as readonly string[]).includes('filingCaseId')).toBe(true);
  });
});
