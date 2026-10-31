import { isAccruedIncomeEvidence } from '../browser';

const transfer={id:'U1:1',isin:'synthetic-security',country:'GB',tradeDate:'2024-08-01',settlementDate:'2024-08-02',
  nextInterestDate:'2024-09-07',currency:'GBP',accruedCash:'-87.5'};
const evidence={sourceHash:`sha256:${'a'.repeat(64)}`,complete:true,transfers:[transfer],nominalObservations:[{date:'2024-07-31',nominalGbp:'10000'}],smallHoldingsProvenYears:[]};
test('accepts signed accrued cash and distinguishes unknown from source zero',()=>{
  expect(isAccruedIncomeEvidence(evidence)).toBe(true);
  for(const accruedCash of [null,'0','12.75']) expect(isAccruedIncomeEvidence({...evidence,transfers:[{...transfer,accruedCash}]})).toBe(true);
});
test('rejects duplicate identities, malformed dates, extra keys and non-evidenced values',()=>{
  expect(isAccruedIncomeEvidence({...evidence,transfers:[transfer,transfer]})).toBe(false);
  expect(isAccruedIncomeEvidence({...evidence,transfers:[{...transfer,tradeDate:'2024-02-31'}]})).toBe(false);
  expect(isAccruedIncomeEvidence({...evidence,assumed:true})).toBe(false);
  expect(isAccruedIncomeEvidence({...evidence,transfers:[{...transfer,accruedCash:'NaN'}]})).toBe(false);
});
test('accepts optional source windows and contractual periods without inferring coverage from absence',()=>{
  expect(isAccruedIncomeEvidence({...evidence,coverage:[{from:'2024-03-08',through:'2024-09-07'}],
    interestPeriods:[{isin:'synthetic-security',from:'2024-03-08',through:'2024-09-07'}]})).toBe(true);
  expect(isAccruedIncomeEvidence({...evidence,coverage:[],interestPeriods:[]})).toBe(true);
});
test.each([
  {coverage:[{from:'2024-09-07',through:'2024-03-08'}]},
  {coverage:[{from:'2024-02-31',through:'2024-09-07'}]},
  {coverage:[{from:'2024-03-08',through:'2024-09-07',assumed:true}]},
  {coverage:null},
  {interestPeriods:[{isin:'',from:'2024-03-08',through:'2024-09-07'}]},
  {interestPeriods:[{isin:'synthetic-security',from:'2024-09-07',through:'2024-03-08'}]},
  {interestPeriods:null},
])('rejects malformed or inferred interval evidence: %j',extra=>{
  expect(isAccruedIncomeEvidence({...evidence,...extra})).toBe(false);
});
