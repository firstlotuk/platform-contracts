import { isPermissionAction, isSensitiveOperation, sensitiveOperationAction, findMissingOrMalformedStepUpClaim } from '../auth';

it('registers permanent income cutover as its own reconciled sensitive resource action', () => {
  const operation = 'cgt.income_cutover.authorize';
  expect(isPermissionAction(operation)).toBe(true);
  expect(isSensitiveOperation(operation)).toBe(true);
  expect(sensitiveOperationAction(operation)).toBe(operation);
  expect(findMissingOrMalformedStepUpClaim({
    iss: 'auth-gateway', aud: 'cgt-app', sub: 'admin-1', iat: 1000, exp: 1300,
    jti: 'step-up-1', purpose: 'step_up', email: 'synthetic@example.test', roles: ['admin'],
    sessionJti: 'session-1', authTime: '2026-10-29T00:00:00Z', operation,
  })).toBeNull();
});
