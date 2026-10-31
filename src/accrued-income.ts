/** Source evidence, never a tax result. Signed accrued cash: received positive, paid negative. */
export interface AccruedIncomeTransfer {
  id: string;
  isin: string;
  country: string | null;
  tradeDate: string;
  settlementDate: string | null;
  nextInterestDate: string | null;
  currency: string;
  accruedCash: string | null;
}

export interface AccruedIncomeEvidence {
  sourceHash: string;
  /** All relevant transfers enumerated from retained statements, including explicit empty Trades. */
  complete: boolean;
  transfers: AccruedIncomeTransfer[];
  /** Positive lower bounds on total nominal holdings; absence never proves the small-holdings exemption. */
  nominalObservations: Array<{ date: string; nominalGbp: string }>;
  /** Full current/prior-year holdings coverage, including attributed holdings; false unless proven. */
  smallHoldingsProvenYears: string[];
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.prototype.hasOwnProperty.call(v,k));
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const decimal = (v: unknown): v is string => typeof v === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v);

export function isAccruedIncomeEvidence(v: unknown): v is AccruedIncomeEvidence {
  return object(v) && keys(v,['sourceHash','complete','transfers','nominalObservations','smallHoldingsProvenYears'])
    && typeof v.sourceHash === 'string' && /^sha256:[a-f0-9]{64}$/.test(v.sourceHash) && typeof v.complete === 'boolean'
    && Array.isArray(v.transfers) && v.transfers.every(t => object(t)
      && keys(t,['id','isin','country','tradeDate','settlementDate','nextInterestDate','currency','accruedCash'])
      && typeof t.id === 'string' && t.id.length > 0 && typeof t.isin === 'string' && t.isin.length > 0
      && (t.country === null || typeof t.country === 'string' && /^[A-Z]{2}$/.test(t.country))
      && date(t.tradeDate) && (t.settlementDate === null || date(t.settlementDate))
      && (t.nextInterestDate === null || date(t.nextInterestDate) && t.nextInterestDate >= t.tradeDate)
      && typeof t.currency === 'string' && /^[A-Z]{3}$/.test(t.currency) && (t.accruedCash === null || decimal(t.accruedCash)))
    && new Set(v.transfers.map(t => t.id)).size === v.transfers.length
    && Array.isArray(v.nominalObservations) && v.nominalObservations.every(o => object(o)
      && keys(o,['date','nominalGbp']) && date(o.date) && decimal(o.nominalGbp) && !o.nominalGbp.startsWith('-'))
    && Array.isArray(v.smallHoldingsProvenYears) && v.smallHoldingsProvenYears.every(y => typeof y === 'string' && /^\d{4}-\d{2}$/.test(y));
}
