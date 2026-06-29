/**
 * Consent-authority V1 contract tests (0.5.x-consent-authority-v1 Part C).
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB. Covers all 9 acceptance
 * items from the approved plan §11:
 *
 *  1. record/serve/revoke/expire lifecycle — append-only structural invariant
 *  2. PDP status() contract — four-outcome ConsentStatusResult; deny-by-default
 *  3. Revocation SLA — CONSENT_CACHE_SLA reuses AUTH_TOKEN_POLICY (no drift)
 *  4. Attestation-vs-consent — legal_attestation is not revocable; third_party_share is
 *  5. Purpose-bound scope — hasBoundScope() rejects empty scope
 *  6. Append-only evidence — ConsentEvent has no mutable status/revokedAt; revoke is a new event
 *  7. No-clawback semantics — ConsentProjection + isRevocable() model; no retraction
 *  8. internal_preference is type-only — no code path in the contract enables a gate
 *  9. d019 seam shape — SubjectDataHandler interface + DataTag union exported
 *
 * Out of scope here: the consent-authority service implementation (own DB/schema, API
 * endpoints, projection store) — those are the service build, not the contract module.
 */

import {
  // §3.1 closed vocabularies + validators
  CONSENT_KINDS,        isConsentKind,
  CONSENT_ACTIONS,      isConsentAction,
  CONSENT_AUTH_LEVELS,  isConsentAuthLevel,
  CONSENT_RESOURCE_KINDS,
  CONSENT_AUDIT_EVENTS,
  CONSENT_STATUSES,
  // §3.3 event-kind vocab
  CONSENT_EVENT_KINDS,
  // §3.5 SLA reference
  CONSENT_CACHE_SLA,
  // G-002: total reconciliation map (all CONSENT_ACTIONS covered)
  CONSENT_ACTION_RECONCILIATION_MAP,
  // semantic helpers
  isRevocable,
  hasBoundScope,
  // SLA source of truth (reuse check)
  AUTH_TOKEN_POLICY,
} from '../index';

import type {
  ConsentKind,
  ConsentAction,
  ConsentAuthLevel,
  ConsentResourceKind,
  ConsentAuditEvent,
  ConsentStatus,
  ConsentEventKind,
  ConsentEvent,
  ConsentProjection,
  ConsentScope,
  ConsentStatusQuery,
  ConsentStatusResult,
  LegalArtifactRef,
  ConsentEvidence,
  ConsentEventEnvelope,
  DataTag,
  ExportItem,
  ExportBundle,
  EraseMode,
  EraseResult,
  InventoryReport,
  SubjectDataHandler,
} from '../index';

// ---------------------------------------------------------------------------
// §3.1 Closed vocabularies
// ---------------------------------------------------------------------------

describe('CONSENT_KINDS — closed vocabulary + fail-closed validator', () => {
  test('exactly the three V1 record kinds', () => {
    expect(new Set(CONSENT_KINDS)).toEqual(
      new Set(['third_party_share', 'legal_attestation', 'internal_preference']),
    );
  });

  test('isConsentKind is fail-closed: known values pass, everything else fails', () => {
    for (const k of CONSENT_KINDS) expect(isConsentKind(k)).toBe(true);
    for (const bad of ['share', 'CONSENT', 'internal_gate', '', undefined, null, 0, {}]) {
      expect(isConsentKind(bad)).toBe(false);
    }
  });
});

describe('CONSENT_ACTIONS — closed vocabulary + fail-closed validator', () => {
  test('exactly the four V1 consent/attestation acts', () => {
    expect(new Set(CONSENT_ACTIONS)).toEqual(
      new Set(['accountant.share', 'filing.submit', 'filing.amend', 'filing.withdraw']),
    );
  });

  test('isConsentAction is fail-closed: known values pass, everything else fails', () => {
    for (const a of CONSENT_ACTIONS) expect(isConsentAction(a)).toBe(true);
    for (const bad of ['submit', 'filing', 'accountant', '', undefined, null, 1]) {
      expect(isConsentAction(bad)).toBe(false);
    }
  });
});

describe('CONSENT_AUTH_LEVELS — closed vocabulary + fail-closed validator', () => {
  test('exactly password/mfa/sca/step_up', () => {
    expect(new Set(CONSENT_AUTH_LEVELS)).toEqual(new Set(['password', 'mfa', 'sca', 'step_up']));
  });

  test('isConsentAuthLevel is fail-closed: known values pass, unknown treated as weakest (false)', () => {
    for (const l of CONSENT_AUTH_LEVELS) expect(isConsentAuthLevel(l)).toBe(true);
    for (const bad of ['otp', 'biometric', 'SCA', '', undefined, null, true]) {
      expect(isConsentAuthLevel(bad)).toBe(false);
    }
  });
});

describe('Other closed vocabularies', () => {
  test('CONSENT_RESOURCE_KINDS is exactly the five resource kinds', () => {
    expect(new Set(CONSENT_RESOURCE_KINDS)).toEqual(
      new Set(['app', 'filing_case', 'tax_year', 'document', 'mandate']),
    );
  });

  test('CONSENT_AUDIT_EVENTS is exactly the five compliance-trail event names', () => {
    expect(new Set(CONSENT_AUDIT_EVENTS)).toEqual(
      new Set(['granted', 'revoked', 'expired', 'superseded', 'queried']),
    );
  });

  test('CONSENT_STATUSES has exactly three projected statuses (derived view only)', () => {
    expect(new Set(CONSENT_STATUSES)).toEqual(new Set(['granted', 'revoked', 'expired']));
  });

  test('CONSENT_EVENT_KINDS has exactly four append-only event kinds', () => {
    expect(new Set(CONSENT_EVENT_KINDS)).toEqual(
      new Set(['grant', 'revoke', 'expire', 'supersede']),
    );
  });
});

// ---------------------------------------------------------------------------
// §3.5 Acceptance item 3 — Revocation/cache SLA reuses auth.ts (no drift)
// ---------------------------------------------------------------------------

describe('CONSENT_CACHE_SLA — reuses AUTH_TOKEN_POLICY, no copy', () => {
  test('standardReadMaxStalenessSeconds equals AUTH_TOKEN_POLICY.permissionCachePropagationSlaSeconds', () => {
    expect(CONSENT_CACHE_SLA.standardReadMaxStalenessSeconds).toBe(
      AUTH_TOKEN_POLICY.permissionCachePropagationSlaSeconds,
    );
  });

  test('revokeInvalidationSlaSeconds equals AUTH_TOKEN_POLICY.revocationCachePropagationSlaSeconds', () => {
    expect(CONSENT_CACHE_SLA.revokeInvalidationSlaSeconds).toBe(
      AUTH_TOKEN_POLICY.revocationCachePropagationSlaSeconds,
    );
  });

  test('sensitiveReadMode is live_only (sensitive ops never cache-only)', () => {
    expect(CONSENT_CACHE_SLA.sensitiveReadMode).toBe('live_only');
  });

  test('SLA concrete values match the ratified policy (30 s revoke / 60 s permission)', () => {
    // Pinned here so a CONTRACT change (not just a failing test) is needed to change them.
    expect(CONSENT_CACHE_SLA.revokeInvalidationSlaSeconds).toBe(30);
    expect(CONSENT_CACHE_SLA.standardReadMaxStalenessSeconds).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// §3.3 Acceptance items 1, 6 — Append-only invariant: ConsentEvent structure
// ---------------------------------------------------------------------------

describe('ConsentEvent — append-only structural invariant (acceptance items 1 + 6)', () => {
  const envelope: ConsentEventEnvelope = {
    envelopeVersion: 1,
    eventId: 'evt-001',
    correlationId: 'corr-001',
    occurredAt: '2026-06-29T10:00:00Z',
  };

  const artifact: LegalArtifactRef = {
    version: 'v1.0',
    contentHash: 'sha256-abc123',
    locale: 'en-GB',
  };

  const evidence: ConsentEvidence = {
    sessionJti: 'jti-123',
    authLevel: 'mfa',
    at: '2026-06-29T10:00:00Z',
  };

  const grantEvent: ConsentEvent = {
    envelope,
    eventKind: 'grant',
    kind: 'third_party_share',
    principalSub: 'sub-abc',
    actorSub: 'sub-def',
    action: 'accountant.share',
    scope: { filingCaseId: 'fc-001', taxYear: '2025-26' },
    artifact,
    evidence,
    expiresAt: '2027-06-29T00:00:00Z',
  };

  test('ConsentEvent compiles + serializes without status or revokedAt fields', () => {
    const json = JSON.parse(JSON.stringify(grantEvent));
    expect(json).not.toHaveProperty('status');
    expect(json).not.toHaveProperty('revokedAt');
    expect(json.eventKind).toBe('grant');
  });

  test('a revoke is a NEW event linked by causationId — not a mutation of the grant', () => {
    const revokeEvent: ConsentEvent = {
      envelope: {
        envelopeVersion: 1,
        eventId: 'evt-002',
        correlationId: 'corr-001',
        causationId: 'evt-001', // links back to the grant
        occurredAt: '2026-06-29T11:00:00Z',
      },
      eventKind: 'revoke',
      kind: 'third_party_share',
      principalSub: 'sub-abc',
      actorSub: 'sub-abc',
      action: 'accountant.share',
      scope: { filingCaseId: 'fc-001', taxYear: '2025-26' },
      artifact,
      evidence,
      reason: 'Principal withdrew consent',
    };

    // Both events are standalone — neither mutates the other's fields.
    expect(grantEvent.eventKind).toBe('grant');
    expect(revokeEvent.eventKind).toBe('revoke');
    expect(revokeEvent.envelope.causationId).toBe(grantEvent.envelope.eventId);
    expect(grantEvent).not.toHaveProperty('status');
    expect(revokeEvent).not.toHaveProperty('status');
    expect(revokeEvent).not.toHaveProperty('revokedAt');
  });

  test('ConsentProjection carries status/revokedAt and is the ONLY place these fields exist', () => {
    const projection: ConsentProjection = {
      status: 'revoked',
      principalSub: 'sub-abc',
      action: 'accountant.share',
      scope: { filingCaseId: 'fc-001', taxYear: '2025-26' },
      grantedAt: '2026-06-29T10:00:00Z',
      revokedAt: '2026-06-29T11:00:00Z',
      latestEventId: 'evt-002',
    };
    // Projection has the derived fields.
    expect(projection).toHaveProperty('status');
    expect(projection).toHaveProperty('revokedAt');
    // The grant ConsentEvent never has them.
    expect(grantEvent).not.toHaveProperty('status');
    expect(grantEvent).not.toHaveProperty('revokedAt');
  });
});

// ---------------------------------------------------------------------------
// Acceptance item 4 — Attestation-vs-consent: legal_attestation is not revocable
// ---------------------------------------------------------------------------

describe('isRevocable — acceptance item 4 (legal_attestation forbids revoke transition)', () => {
  test('third_party_share is revocable (GDPR consent, L1)', () => {
    expect(isRevocable('third_party_share')).toBe(true);
  });

  test('legal_attestation is NOT revocable (non-withdrawable authorization, L2 lean)', () => {
    expect(isRevocable('legal_attestation')).toBe(false);
  });

  test('internal_preference is revocable (type-only record; no V1 gate)', () => {
    expect(isRevocable('internal_preference')).toBe(true);
  });

  test('every ConsentKind has a defined revocability ruling (no orphans)', () => {
    for (const kind of CONSENT_KINDS) {
      const result = isRevocable(kind);
      expect(typeof result).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// Acceptance item 5 — Purpose-bound scope: hasBoundScope rejects blanket-role records
// ---------------------------------------------------------------------------

describe('hasBoundScope — acceptance item 5 (D-006, L1: no blanket-role consent)', () => {
  test('an empty scope (all fields absent) fails — no blanket consent permitted', () => {
    expect(hasBoundScope({})).toBe(false);
  });

  test('a scope with undefined/missing bindings fails', () => {
    expect(hasBoundScope({ capabilities: [], dataClasses: [] })).toBe(false);
  });

  test('filingCaseId alone satisfies the scope binding', () => {
    expect(hasBoundScope({ filingCaseId: 'fc-001' })).toBe(true);
  });

  test('taxYear alone satisfies the scope binding', () => {
    expect(hasBoundScope({ taxYear: '2025-26' })).toBe(true);
  });

  test('resourceKind alone is NOT sufficient — it is a taxonomy label, not a concrete binding', () => {
    // Approved plan §4: every record names party/account/purpose/tax-year; resourceKind is just
    // a taxonomy classifier (e.g. 'document'), not the specific instance the consent covers.
    expect(hasBoundScope({ resourceKind: 'document' })).toBe(false);
  });

  test('resourceId/resourceKind is NOT a V1 bound scope (G-010 Option A — resource-level consent deferred)', () => {
    // V1 scope identity is case/year level only ({filingCaseId, taxYear}); resourceKind/resourceId
    // (resource-level consent) are deferred (Option B) and are NOT servable by the status() query
    // contract, so they do not satisfy a V1 bound scope. record() additionally rejects them.
    expect(hasBoundScope({ resourceId: 'doc-001' })).toBe(false);
    expect(hasBoundScope({ resourceKind: 'document', resourceId: 'doc-001' })).toBe(false);
  });

  test('a fully-scoped record (all binding fields present) passes', () => {
    const scope: ConsentScope = {
      filingCaseId: 'fc-001',
      taxYear: '2025-26',
      resourceKind: 'filing_case',
      resourceId: 'fc-001',
      capabilities: ['read'],
      dataClasses: ['tax_return'],
    };
    expect(hasBoundScope(scope)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Acceptance item 2 — PDP status() contract (ConsentStatusResult + deny-by-default)
// ---------------------------------------------------------------------------

describe('ConsentStatusResult — acceptance item 2 (PDP query contract + deny-by-default)', () => {
  test('four discriminated-union variants compile and serialize', () => {
    const granted: ConsentStatusResult = { status: 'granted' };
    const revoked: ConsentStatusResult = { status: 'revoked' };
    const expired: ConsentStatusResult = { status: 'expired' };
    const none:    ConsentStatusResult = { status: 'none' };

    expect(granted.status).toBe('granted');
    expect(revoked.status).toBe('revoked');
    expect(expired.status).toBe('expired');
    expect(none.status).toBe('none');
  });

  test('deny-by-default: none (no record) is a valid result (must map to consent_required)', () => {
    // 'none' means no record exists — the service must emit this rather than throwing / returning
    // undefined, so the PDP can map it to deny('consent_required') (deny-by-default).
    const result: ConsentStatusResult = { status: 'none' };
    expect(result.status).toBe('none');
  });

  test('ConsentStatusQuery compiles with the CLOSED action vocab + sensitivity flag', () => {
    const query: ConsentStatusQuery = {
      principalSub: 'sub-abc',
      action: 'filing.submit',
      scope: { filingCaseId: 'fc-001', taxYear: '2025-26' },
      sensitivity: 'sensitive',
    };
    expect(isConsentAction(query.action)).toBe(true);
    expect(query.sensitivity).toBe('sensitive');
  });
});

// ---------------------------------------------------------------------------
// Acceptance item 7 — No-clawback semantics (L10): revoke stops future auth only
// ---------------------------------------------------------------------------

describe('No-clawback semantics — acceptance item 7 (L10)', () => {
  test('ConsentProjection has no retraction field — revoke sets revokedAt, does not delete shared copies', () => {
    const projection: ConsentProjection = {
      status: 'revoked',
      principalSub: 'sub-abc',
      action: 'accountant.share',
      scope: { filingCaseId: 'fc-001' },
      grantedAt: '2026-06-01T00:00:00Z',
      revokedAt: '2026-06-29T00:00:00Z',
      latestEventId: 'evt-002',
    };
    // The model records WHEN the revoke happened; it has no clawback/retraction field.
    // The shared copies to the accountant / lodged with HMRC are not technically pulled back (L10).
    expect(projection.revokedAt).toBeDefined();
    expect(projection).not.toHaveProperty('clawback');
    expect(projection).not.toHaveProperty('retracted');
    expect(projection).not.toHaveProperty('deletedSharedCopies');
  });

  test('isRevocable returns false for legal_attestation — HMRC lodged copy cannot be pulled back', () => {
    // This aligns with L10: a submitted return cannot be unsubmitted. A correction is a
    // new filing event, not a retraction of the prior legal attestation.
    expect(isRevocable('legal_attestation')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Acceptance item 8 — internal_preference is type-only, no runtime gate
// ---------------------------------------------------------------------------

describe('internal_preference type-only — acceptance item 8 (D-007, L8 conservative lean)', () => {
  test('internal_preference is a valid ConsentKind (designed-in as a type)', () => {
    expect(isConsentKind('internal_preference')).toBe(true);
  });

  test('the contract module exports NO function named enableInternalGate or gateInternal*', () => {
    // Verify the contract module surface does not expose any function that could be used
    // to gate a core internal flow on an internal_preference record.
    // We check the exported names from the consent module directly.
    const consentExports = Object.keys(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../consent'),
    );
    const gatingFns = consentExports.filter(
      name => name.toLowerCase().includes('internalgate') ||
              name.toLowerCase().includes('gateinternal') ||
              name.toLowerCase().includes('requireconsent'),
    );
    expect(gatingFns).toHaveLength(0);
  });

  test('internal_preference is revocable at the type level but has no V1 service gate', () => {
    // The revocability is a type property; there is no V1 gate to block internal flows.
    expect(isRevocable('internal_preference')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Acceptance item 9 — d019 seam shape exported at contract level
// ---------------------------------------------------------------------------

describe('d019 handler seam — acceptance item 9 (§10)', () => {
  test('DataTag union is exactly content|metadata', () => {
    // Compile-time: ensure both tags are assignable to DataTag.
    const content: DataTag = 'content';
    const metadata: DataTag = 'metadata';
    expect([content, metadata].sort()).toEqual(['content', 'metadata']);
  });

  test('ExportItem carries tag + recordRef + payload', () => {
    const item: ExportItem = {
      tag: 'content',
      recordRef: 'consent-evt-001',
      payload: { kind: 'third_party_share' },
    };
    expect(item.tag).toBe('content');
    expect(item.recordRef).toBe('consent-evt-001');
  });

  test('ExportBundle groups items by sub', () => {
    const bundle: ExportBundle = {
      sub: 'sub-abc',
      items: [
        { tag: 'content', recordRef: 'ref-1', payload: {} },
        { tag: 'metadata', recordRef: 'ref-2', payload: {} },
      ],
    };
    expect(bundle.sub).toBe('sub-abc');
    expect(bundle.items).toHaveLength(2);
  });

  test('EraseMode is exactly closure|erasure', () => {
    const modes: EraseMode[] = ['closure', 'erasure'];
    expect(modes).toHaveLength(2);
  });

  test('EraseResult has failClosed: true literal (no silent-delete guarantee)', () => {
    const result: EraseResult = {
      removed: ['ref-1'],
      retained: ['ref-2'],
      failClosed: true,
    };
    expect(result.failClosed).toBe(true);
    expect(result.removed).toContain('ref-1');
    expect(result.retained).toContain('ref-2');
  });

  test('InventoryReport classifies held items by resourceKind + tag', () => {
    const report: InventoryReport = {
      sub: 'sub-abc',
      held: [
        { resourceKind: 'filing_case', count: 2, tag: 'content' },
        { resourceKind: 'mandate', count: 1, tag: 'metadata' },
      ],
    };
    expect(report.held).toHaveLength(2);
    expect(report.held[0].resourceKind).toBe('filing_case');
  });

  test('SubjectDataHandler interface shape compiles (export/erase/classify signatures)', () => {
    // A concrete stub satisfying the interface proves the signatures are correct.
    const stub: SubjectDataHandler = {
      export: async (sub, _scope) => ({ sub, items: [] }),
      erase:  async (_sub, _mode) => ({ removed: [], retained: [], failClosed: true }),
      classify: async (sub) => ({ sub, held: [] }),
    };
    // The stub is valid TypeScript — the test just needs to compile + run without error.
    expect(typeof stub.export).toBe('function');
    expect(typeof stub.erase).toBe('function');
    expect(typeof stub.classify).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Shape compilation tests — ConsentEvent envelope + ConsentEvidence
// ---------------------------------------------------------------------------

describe('Type shape compilation guards', () => {
  test('ConsentEvidence compiles with CLOSED authLevel', () => {
    const evidence: ConsentEvidence = {
      sessionJti: 'jti-xyz',
      authLevel: 'sca',
      at: '2026-06-29T10:00:00Z',
    };
    expect(isConsentAuthLevel(evidence.authLevel)).toBe(true);
  });

  test('LegalArtifactRef compiles with version/contentHash/locale', () => {
    const ref: LegalArtifactRef = {
      version: 'v2.1',
      contentHash: 'sha256-deadbeef',
      locale: 'en-GB',
    };
    expect(Object.keys(ref).sort()).toEqual(['contentHash', 'locale', 'version']);
  });

  test('ConsentEventEnvelope version is pinned to 1', () => {
    const env: ConsentEventEnvelope = {
      envelopeVersion: 1,
      eventId: 'evt-abc',
      correlationId: 'corr-abc',
      occurredAt: '2026-06-29T00:00:00Z',
    };
    expect(env.envelopeVersion).toBe(1);
  });

  test('ConsentResourceKind values are all in CONSENT_RESOURCE_KINDS', () => {
    const kinds: ConsentResourceKind[] = ['app', 'filing_case', 'tax_year', 'document', 'mandate'];
    for (const k of kinds) {
      expect((CONSENT_RESOURCE_KINDS as readonly string[]).includes(k)).toBe(true);
    }
  });

  test('ConsentAuditEvent values are all in CONSENT_AUDIT_EVENTS', () => {
    const evts: ConsentAuditEvent[] = ['granted', 'revoked', 'expired', 'superseded', 'queried'];
    for (const e of evts) {
      expect((CONSENT_AUDIT_EVENTS as readonly string[]).includes(e)).toBe(true);
    }
  });

  test('ConsentEventKind values are all in CONSENT_EVENT_KINDS', () => {
    const kinds: ConsentEventKind[] = ['grant', 'revoke', 'expire', 'supersede'];
    for (const k of kinds) {
      expect((CONSENT_EVENT_KINDS as readonly string[]).includes(k)).toBe(true);
    }
  });

  test('ConsentStatus values are all in CONSENT_STATUSES', () => {
    const statuses: ConsentStatus[] = ['granted', 'revoked', 'expired'];
    for (const s of statuses) {
      expect((CONSENT_STATUSES as readonly string[]).includes(s)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// G-002: CONSENT_ACTIONS total reconciliation — every action (including
// accountant.share) maps to a SENSITIVE_OPERATIONS entry. The map is exported
// from consent.ts so this conformance check holds as a build-time invariant:
// Record<ConsentAction, SensitiveOp> forces exhaustiveness on every new action.
// ---------------------------------------------------------------------------

describe('CONSENT_ACTION_RECONCILIATION_MAP — total reconciliation to SENSITIVE_OPERATIONS (G-002)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SENSITIVE_OPERATIONS } = require('../auth');
  const sensitiveSet = new Set(SENSITIVE_OPERATIONS as readonly string[]);

  test('map is TOTAL: every ConsentAction has an entry (no orphans)', () => {
    const mapKeys = new Set(Object.keys(CONSENT_ACTION_RECONCILIATION_MAP));
    for (const action of CONSENT_ACTIONS) {
      expect(mapKeys.has(action)).toBe(true);
    }
  });

  test('every map target is a valid SENSITIVE_OPERATIONS member', () => {
    for (const [action, target] of Object.entries(CONSENT_ACTION_RECONCILIATION_MAP)) {
      expect(sensitiveSet.has(target)).toBe(
        true,
      );
      void action; // referenced for exhaustiveness
    }
  });

  test('accountant.share reconciles to access.grant (SENSITIVE_OPERATIONS member)', () => {
    expect(CONSENT_ACTION_RECONCILIATION_MAP['accountant.share']).toBe('access.grant');
    expect(sensitiveSet.has('access.grant')).toBe(true);
  });

  test('filing.* consent actions reconcile to themselves in SENSITIVE_OPERATIONS', () => {
    const filingActions = CONSENT_ACTIONS.filter(a => a.startsWith('filing.'));
    for (const action of filingActions) {
      const target = CONSENT_ACTION_RECONCILIATION_MAP[action];
      expect(sensitiveSet.has(target)).toBe(true);
    }
  });

  test('map has no extra entries beyond CONSENT_ACTIONS', () => {
    const actionSet = new Set(CONSENT_ACTIONS as readonly string[]);
    for (const key of Object.keys(CONSENT_ACTION_RECONCILIATION_MAP)) {
      expect(actionSet.has(key)).toBe(true);
    }
  });
});
