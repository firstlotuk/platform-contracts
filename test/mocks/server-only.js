// Stub for the `server-only` marker package under plain Jest/Node execution.
//
// The real `server-only` package throws unconditionally on `require()` — it only becomes a
// no-op when a bundler (Next.js webpack/turbopack) aliases it for a server compilation target.
// Jest runs under plain Node, so without this mapping every test that imports
// ./filing-contribution-pack-validate (which starts with `import 'server-only'`) would crash.
// See jest.config.js moduleNameMapper and src/filing-contribution-pack-validate.ts.
module.exports = {};
