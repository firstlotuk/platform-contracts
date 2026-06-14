/**
 * 0.5.5 D-009 Phase C — action-vocabulary reconciliation invariant
 * (PLATFORM_SECURITY_BASELINE §10 / AUTHORIZATION_MODEL §4). Pins that every SENSITIVE_OPERATION maps
 * to ONE canonical PermissionAction or is deliberately service_only, with no orphans — so the dms.*
 * and document.* lists provably cannot drift. SYNTHETIC values.
 */
import {
  PERMISSION_ACTIONS,
  SENSITIVE_OPERATIONS,
  SENSITIVE_OPERATION_ACTION_MAP,
  SERVICE_ONLY,
  isPermissionAction,
  isSensitiveOperation,
  sensitiveOperationAction,
  isServiceOnlyOperation,
  findOrphanedSensitiveOperation,
} from '../auth';

describe('D-009 Phase C — action vocab extension', () => {
  test('canonical document.* actions are registered (dms.* reconcile to these)', () => {
    for (const a of ['document.download', 'document.export', 'document.evidence_share']) {
      expect(isPermissionAction(a)).toBe(true);
    }
  });

  test('cgt-app worked-example actions are registered (read vs export vs submit; admin year grant)', () => {
    for (const a of ['cgt.return.read', 'cgt.return.export', 'cgt.return.submit', 'cgt.year.grant']) {
      expect(isPermissionAction(a)).toBe(true);
    }
  });

  test('isPermissionAction fails closed on an unknown action', () => {
    expect(isPermissionAction('cgt.return.delete')).toBe(false);
    expect(isPermissionAction('')).toBe(false);
  });

  test('the canonical action set has no duplicates (one list, never forked)', () => {
    expect(new Set(PERMISSION_ACTIONS).size).toBe(PERMISSION_ACTIONS.length);
  });
});

describe('D-009 Phase C — reconciliation invariant', () => {
  test('the map is TOTAL over SENSITIVE_OPERATIONS (one entry per op)', () => {
    for (const op of SENSITIVE_OPERATIONS) {
      expect(SENSITIVE_OPERATION_ACTION_MAP[op]).toBeDefined();
    }
    expect(Object.keys(SENSITIVE_OPERATION_ACTION_MAP).sort()).toEqual([...SENSITIVE_OPERATIONS].sort());
  });

  test('every sensitive op maps to a registered PermissionAction OR is service_only — no orphans', () => {
    for (const op of SENSITIVE_OPERATIONS) {
      const mapped = SENSITIVE_OPERATION_ACTION_MAP[op];
      const ok = mapped === SERVICE_ONLY || isPermissionAction(mapped);
      expect(ok).toBe(true);
    }
    expect(findOrphanedSensitiveOperation()).toBeNull();
  });

  test('dms.* sensitive ops reconcile to the canonical document.* actions', () => {
    expect(sensitiveOperationAction('dms.decrypt')).toBe('document.decrypt_for_extraction');
    expect(sensitiveOperationAction('dms.download')).toBe('document.download');
    expect(sensitiveOperationAction('dms.export')).toBe('document.export');
    expect(sensitiveOperationAction('dms.evidence_share')).toBe('document.evidence_share');
  });

  test('gateway/auth-domain ops are explicitly service_only (no resource action)', () => {
    for (const op of ['auth.password_change', 'auth.break_glass', 'session.revoke_all', 'profile.identity_change'] as const) {
      expect(isServiceOnlyOperation(op)).toBe(true);
    }
  });

  test('filing mutations reconcile to filing.write', () => {
    expect(sensitiveOperationAction('filing.submit')).toBe('filing.write');
    expect(sensitiveOperationAction('filing.amend')).toBe('filing.write');
    expect(sensitiveOperationAction('filing.withdraw')).toBe('filing.write');
  });

  test('sensitiveOperationAction fails closed (null) for an unknown operation', () => {
    expect(sensitiveOperationAction('made.up.op')).toBeNull();
    expect(isSensitiveOperation('made.up.op')).toBe(false);
  });
});
