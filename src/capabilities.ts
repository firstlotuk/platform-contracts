/** Accounts-owned commercial capability vocabulary (FL-19). */
export const PLATFORM_CAPABILITIES = [
  'suite.prepare',
  'suite.submit',
  'cgt.lite',
  'income.lite',
] as const;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

export function isPlatformCapability(value: string): value is PlatformCapability {
  return (PLATFORM_CAPABILITIES as readonly string[]).includes(value);
}

export const CAPABILITY_SOURCES = [
  'account',
  'enrollment',
  'subscription',
  'filing_credit',
] as const;

export type CapabilitySource = (typeof CAPABILITY_SOURCES)[number];

export interface CapabilityScope {
  /** Full tax-year key, for example `2025-2026`. Required for `suite.submit`. */
  taxYear?: string;
}

export interface CapabilityCheckRequest {
  canonicalSubject: string;
  capability: PlatformCapability;
  scope?: CapabilityScope;
}

export interface EffectiveCapabilityDecision {
  canonicalSubject: string;
  capability: PlatformCapability;
  allowed: boolean;
  sources: CapabilitySource[];
  scope?: CapabilityScope;
  checkedAt: string;
}

/** Stable 2xx wire response from Accounts' private capability-check endpoint. */
export interface CapabilityCheckResponse {
  status: 'ok';
  decision: EffectiveCapabilityDecision;
}
