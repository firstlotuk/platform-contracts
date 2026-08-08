// FIR-579/FIR-584 — regression guard for the client/edge-safe runtime-domain boundary.
//
// The universal entry point (./browser, exported as the `./browser` package subpath) must
// never transitively require Ajv or the Ajv-backed validator module. This structural
// separation is what enforces the boundary: any future export added to ./browser that
// reaches back into ./filing-contribution-pack-validate would re-introduce the EvalError this
// package split fixes for every client/edge consumer (cgt-app, income-app, myaccount-app).
describe('runtime-domain boundary: ./browser stays Ajv-free', () => {
  test('requiring ./browser never loads ajv or the Ajv-backed validator module', () => {
    jest.resetModules();
    require('../browser');

    const loadedIds = Object.keys(require.cache);
    const loadedAjv = loadedIds.some((id) => /[\\/]node_modules[\\/]ajv([\\/]|$)/.test(id));
    const loadedValidateModule = loadedIds.some((id) => id.includes('filing-contribution-pack-validate'));

    expect(loadedAjv).toBe(false);
    expect(loadedValidateModule).toBe(false);
  });

  test('./browser does not export the Ajv-backed validator/assert functions', () => {
    const mod = require('../browser');
    expect(mod.validateFilingContributionPack).toBeUndefined();
    expect(mod.assertFilingContributionPack).toBeUndefined();
  });

  test('./index (server entry) still exposes the validator for server-side consumers', () => {
    const mod = require('../index');
    expect(typeof mod.validateFilingContributionPack).toBe('function');
    expect(typeof mod.assertFilingContributionPack).toBe('function');
  });
});
