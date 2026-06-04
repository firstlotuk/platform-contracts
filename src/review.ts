/**
 * Shared structured review item (filing hub ↔ child apps).
 *
 * A review item is portable across the filing hub, rule engine, and accountant
 * workflow — not just a UI banner. Relocated here from `investment-tax.ts` in
 * 0.5.4 Stage 3D-1 so both cgt-app and income-app producers reference one shared
 * type (the barrel `@firstlot/platform-contracts` re-export keeps consumers stable).
 *
 * Generic over the producing app: bare `ReviewItemSummary` means "any producer";
 * each output binds its literal (e.g. `ReviewItemSummary<'cgt-app'>`,
 * `ReviewItemSummary<'income-app'>`) so an item cannot claim another app's id.
 */

import type { ChildAppId } from './filing';

export interface ReviewItemSummary<TSourceApp extends ChildAppId = ChildAppId> {
  id: string;
  /**
   * Coarse classification. The union is shared across producers; cgt-app uses
   * the disposal-oriented values, income-app uses `income_classification` /
   * `other`. Extend this union (not a per-app fork) when a new producer needs
   * a category.
   */
  category:
    | 'corporate_action'
    | 'unmatched_disposal'
    | 'missing_transaction_context'
    | 'rebasing_consistency'
    | 'income_classification'
    | 'other';
  severity: 'warning' | 'review_advised' | 'review_required' | 'blocked';
  title: string;
  reason: string;
  symbol?: string;
  eventDate?: string;
  affectsForms?: string[];
  accountantReviewRecommended: boolean;
  targetUrl?: string;
  /**
   * Producing child app, bound to the owning output's app id via the generic
   * (0.5.4 Stage 3C). `InvestmentTaxAppOutput.reviewItems` is
   * `ReviewItemSummary<'cgt-app'>[]`; `IncomeTaxAppOutput.reviewItems` is
   * `ReviewItemSummary<'income-app'>[]`.
   */
  sourceApp: TSourceApp;
}
