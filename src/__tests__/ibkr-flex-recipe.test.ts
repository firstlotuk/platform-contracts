import { IBKR_FLEX_RECIPE as recipe, IBKR_FLEX_SETUP as guide } from '../ibkr-flex-recipe';
import { IBKR_FLEX_RECIPE as browserRecipe } from '../browser';

describe('IBKR Flex support recipe', () => {
  it('describes delta sync and the saved-period fallback without promising funds imports', () => {
    expect(guide.configuration.find(item => item.setting === 'Period saved on the query')?.reason).toContain('only when no usable delta window can be derived');
    expect(guide.sync.join(' ')).toContain('including a first sync without usable coverage');
    expect(recipe.notRead.find(item => item.label === 'Statement of Funds')?.purpose).toContain('No transaction or cash records are imported');
    expect(recipe.notRead.find(item => item.label === 'Currency Rates (Include Currency Rates)')?.purpose).toContain('same series in CGT and Income');
    expect(guide.configuration.find(item => item.setting === 'Include currency rates')?.value).toBe('No');
    expect(guide.configuration.find(item => item.setting === 'Include currency rates')?.reason).toContain('HMRC does not prescribe what reference point should be used for the exchange rate. It is, however, expected that a reasonable and consistent method is used.');
    expect(guide.sources.some(source => source.url === 'https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg78310')).toBe(true);
  });
  it('covers required fields and every requested error code', () => {
    expect(Object.keys(guide.fieldGuidance).sort()).toEqual(recipe.sections.map(section => section.label).sort());
    expect(guide.troubleshooting.map(error => error.code).sort()).toEqual(['1003', '1012', '1013', '1014', '1015', '1018', '1019', '1025']);
    expect(guide.configuration.find(item => item.setting === 'Date format')?.value).toBe('yyyyMMdd');
    expect(guide.configuration.find(item => item.setting === 'Time format')?.value).toBe('HHmmss');
    expect(guide.troubleshooting.find(item => item.code === '1025')?.action).toContain('Replacing a token does not establish that the broker restriction has lifted.');
  });
  it('requires account lifecycle evidence and keeps unread sections separate', () => {
    expect(browserRecipe).toBe(recipe);
    expect(recipe.sections.find(section => section.label === 'Account Information')?.purpose).toMatch(/open and close dates/);
    const read = [...recipe.sections, ...recipe.additionalSections].map(section => section.label);
    expect(recipe.notRead.every(section => !read.includes(section.label as typeof read[number]))).toBe(true);
    expect(recipe.notRead.find(section => section.label === 'Financial Instrument Information')?.purpose).toMatch(/not currently parsed/);
  });

  it('states the limits of asset support without promising a guessed treatment', () => {
    expect(recipe.assetClasses.find(asset => asset.label === 'Cash and fees')?.purpose).toMatch(/Passed through/);
    expect(recipe.assetClasses.find(asset => asset.label === 'Other or unknown asset classes')?.purpose).toMatch(/excluded from CGT calculations.*never guesses/);
  });
});
