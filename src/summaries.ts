/**
 * @deprecated CgtFactSummary is a temporary alias for InvestmentTaxFactSummary
 * (defined in ./investment-tax). The investment-tax fact summary is the
 * canonical shape — it covers SA108 disposals plus dividend/interest income
 * plus SA106. Once consumers are switched over, this alias and file will be
 * removed.
 *
 * Source of truth: INVESTMENT_TAX_APP_CONTRACT.md
 */

import type { InvestmentTaxFactSummary } from './investment-tax';

export type CgtFactSummary = InvestmentTaxFactSummary;
