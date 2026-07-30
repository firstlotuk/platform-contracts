import {
  PLATFORM_CAPABILITIES,
  isPlatformCapability,
  type CapabilityCheckRequest,
  type CapabilityCheckResponse,
  type EffectiveCapabilityDecision,
} from '../capabilities';

describe('commercial capability contract', () => {
  test('keeps the initial vocabulary closed and pricing-neutral', () => {
    expect(PLATFORM_CAPABILITIES).toEqual([
      'suite.prepare',
      'suite.submit',
      'cgt.lite',
      'income.lite',
    ]);
    expect(isPlatformCapability('suite.submit')).toBe(true);
    expect(isPlatformCapability('cgt.pro')).toBe(false);
  });

  test('supports a tax-year-scoped live submission decision', () => {
    const request: CapabilityCheckRequest = {
      canonicalSubject: 'sub-1',
      capability: 'suite.submit',
      scope: { taxYear: '2025-2026' },
    };
    const decision: EffectiveCapabilityDecision = {
      ...request,
      allowed: true,
      sources: ['filing_credit'],
      checkedAt: '2026-07-30T21:00:00.000Z',
    };
    expect(decision.scope?.taxYear).toBe('2025-2026');
  });

  test('defines the stable 2xx wire response', () => {
    const response: CapabilityCheckResponse = {
      status: 'ok',
      decision: {
        canonicalSubject: 'sub-1',
        capability: 'suite.prepare',
        allowed: true,
        sources: ['account'],
        checkedAt: '2026-07-30T21:00:00.000Z',
      },
    };
    expect(response.status).toBe('ok');
  });
});
