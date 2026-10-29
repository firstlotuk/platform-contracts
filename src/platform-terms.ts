/** Accounts owns platform terms. A receipt is a legal fact, never an identity or permission claim. */
export const PLATFORM_TERMS_SCOPE = 'firstlot.platform' as const;

export interface PlatformTermsDocument {
  scope: typeof PLATFORM_TERMS_SCOPE;
  version: string;
  title: string;
  text: string;
  contentHash: string;
}

export interface PlatformTermsReceipt {
  scope: typeof PLATFORM_TERMS_SCOPE;
  version: string;
  contentHash: string;
  acceptedAt: string;
  mechanism: 'signup' | 'review';
}

export interface PlatformTermsStatus {
  document: Omit<PlatformTermsDocument, 'text'>;
  receipt: PlatformTermsReceipt | null;
  current: boolean;
}

export function isPlatformTermsStatus(value: unknown): value is PlatformTermsStatus {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const d = v.document as Partial<PlatformTermsDocument> | undefined;
  if (!d || d.scope !== PLATFORM_TERMS_SCOPE || typeof d.version !== 'string' || !d.version ||
      typeof d.title !== 'string' || !d.title || !/^[a-f0-9]{64}$/.test(String(d.contentHash)) || typeof v.current !== 'boolean') return false;
  if (v.receipt === null) return !v.current;
  const r = v.receipt as Partial<PlatformTermsReceipt> | undefined;
  if (!r || r.scope !== PLATFORM_TERMS_SCOPE || typeof r.version !== 'string' || !r.version ||
      !/^[a-f0-9]{64}$/.test(String(r.contentHash)) || typeof r.acceptedAt !== 'string' ||
      !Number.isFinite(Date.parse(r.acceptedAt)) || !['signup', 'review'].includes(String(r.mechanism))) return false;
  return v.current === (r.version === d.version && r.contentHash === d.contentHash);
}
