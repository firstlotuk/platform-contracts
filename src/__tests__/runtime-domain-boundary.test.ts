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
    expect(mod.sha256CanonicalJson).toBeUndefined();
    expect(mod.computeContributionPayloadHash).toBeUndefined();
  });

  test('./browser does not load Node-only hashing helpers', () => {
    jest.resetModules();
    require('../browser');
    const loadedNodeHashModule = Object.keys(require.cache).some((id) => id.includes('filing-contribution-pack-node'));
    expect(loadedNodeHashModule).toBe(false);
  });

  // d067 S1 — person-core joins the browser barrel as pure types; it must never
  // drag Ajv (or any runtime dep) in with it.
  test('requiring ./person-core alone loads no ajv and no node_modules runtime dep', () => {
    jest.resetModules();
    require('../person-core');
    const loadedIds = Object.keys(require.cache);
    const loadedAjv = loadedIds.some((id) => /[\\/]node_modules[\\/]ajv([\\/]|$)/.test(id));
    expect(loadedAjv).toBe(false);
  });

  test('./browser exposes the person-core surface without breaking the Ajv-free boundary', () => {
    jest.resetModules();
    const mod = require('../browser');
    expect(mod.ACCOUNT_TYPES).toBeDefined();
    expect(mod.isPersonKind('platform_user')).toBe(true);
    const loadedAjv = Object.keys(require.cache).some((id) => /[\\/]node_modules[\\/]ajv([\\/]|$)/.test(id));
    expect(loadedAjv).toBe(false);
  });

  test('./index (server entry) still exposes the validator for server-side consumers', () => {
    const mod = require('../index');
    expect(typeof mod.validateFilingContributionPack).toBe('function');
    expect(typeof mod.assertFilingContributionPack).toBe('function');
  });
});
