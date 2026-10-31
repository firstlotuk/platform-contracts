import { IBKR_FLEX_RECIPE as recipe } from '../ibkr-flex-recipe';
import { IBKR_FLEX_RECIPE as browserRecipe } from '../browser';

describe('IBKR Flex support recipe', () => {
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
