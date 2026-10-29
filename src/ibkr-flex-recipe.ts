/** Shared upload/Web Service query recipe. Parser support is recorded in the D233 consumer audit. */
export const IBKR_FLEX_RECIPE = {
  version: '1',
  sections: [
    { label: 'Trades', level: 'Executions', purpose: 'Trades, fees and option activity. Keep Transaction ID and Open/Close Indicator.' },
    { label: 'Cash Transactions', level: 'Detail', purpose: 'All types, including dividends, interest, taxes, deposits and withdrawals. Include cash evidence even when cash tools are off.' },
    { label: 'Corporate Actions', level: 'Detail', purpose: 'Keep every action leg and its identifiers.' },
    { label: 'Transfers', level: 'All activity rows', purpose: 'Security movements and acquisition-history reviews.' },
    { label: 'Open Positions', level: 'Summary', purpose: 'Position evidence. Broker position values do not establish UK pooled costs.' },
    { label: 'Change in Dividend Accruals', level: 'All activity rows', purpose: 'Dividend-event and entitlement evidence.' },
  ],
  additionalSections: [
    { label: 'Statement of Funds', purpose: 'Include for foreign-exchange activity. The importer consumes supported funds rows and avoids counting base-currency dividend views twice.' },
    { label: 'Stock Grant Activities', purpose: 'Include if you have employee stock grants. Supported grant activity is imported; additional cost evidence may still be needed.' },
    { label: 'Financial Instrument Information', purpose: 'Optional supporting metadata; this separate section is not currently parsed. Keep security identifiers and contract details on the activity rows themselves.' },
  ],
  fields: 'Select the available fields in each included section. Keep account and statement dates, trade date, report date, asset category, transaction IDs, security identifiers, quantities, currency, prices, commissions and taxes. Options need contract details and Open/Close Indicator. Summaries alone are insufficient.',
  history: 'Broker history availability is limited. Download earlier acquisitions and the 30 days after disposals, including dates after 5 April, in multiple reports where necessary. A missing section differs from one explicitly reporting no activity.',
  instructionsUrl: 'https://www.ibkrguides.com/orgportal/performanceandstatements/activityflex.htm',
} as const;
