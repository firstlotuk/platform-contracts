# reviewed-pdf-renderer-build/1.1.0 — provenance

`manifest.json` is the renderer build a reviewed pre-submission PDF pins, and the only build that
may regenerate it once expired (D046 plan S9; design pass §8.3; d063 C46-S9 item 4). 1.0.0 stays
frozen as history: it is the pin for `compatibility-manifests.json` in rule-packs
`uk-sa/2025-26/1.0.0`, and a ratified pin is never edited in place.

## What changed from 1.0.0, and why

1.0.0 pinned `reviewerSource`: the hash of the whole of firstlot-suite `src/lib/filing/review.ts`
at `0b6cc6c`. That file also holds snapshot assembly, persistence, authorization and audit, so
every non-render edit changed it; by 2026-09-26 it had drifted through 11 commits with nothing
detecting it (d063 `C46-S9-ITEM4-REGEN-AUDIT`). The owner decided on 2026-09-26 (d063) that the
pin covers **render-affecting code only**: the renderer, the field mapping, and fonts/assets.

The Suite now keeps that code in one module, `src/lib/filing/reviewed-pdf/renderer.ts`, and
computes the digest from the files it ships (`src/lib/filing/reviewed-pdf/renderer-build.ts`).
A Suite unit test holds the computed manifest equal to this one, so a render-affecting edit fails
CI until a new version of this manifest is ratified.

| Component | 1.0.0 | 1.1.0 |
|---|---|---|
| source | `reviewerSource`: all of `review.ts` | `rendererSource`: `src/lib/filing/reviewed-pdf/renderer.ts` only (field mapping, layout, font embedding) |
| fonts | Noto Sans, Noto Sans SC | unchanged: same two files, same hashes |
| libraries | not pinned | `packages`: pdfkit and fontkit and their full dependency closure, as package-lock.json resolves them |

The libraries are new. They are render-affecting code: an upgrade of pdfkit, fontkit or a
transitive dependency (`restructure` parses the font tables, `linebreak`, `unicode-properties`,
and so on) can change the bytes without touching Suite source, and without this entry such an
upgrade would regenerate under a newer renderer, which §8.3 forbids.

## Composition

The method is unchanged from 1.0.0. Each file component is plain `sha256:` + hex(SHA-256(raw file
bytes)). Each package is `{ version, integrity }` exactly as the Suite's `package-lock.json`
records it, keyed by lockfile path. A package is resolved the way npm resolves it: the nearest
`node_modules/<name>` above its dependent, so nested copies such as
`node_modules/unicode-trie/node_modules/pako` are pinned in their own right. The composite
`rendererBuildDigest` is `sha256:` + hex(SHA-256(JCS(manifest.json))), where JCS is RFC 8785.

Composite `rendererBuildDigest`:
`sha256:133d39395507f998b8dd2106cc3e5ea2cd8f33f1b6e968e916ebab5d1883924f`

## Sources

firstlot-suite branch `feat/c46-regen` (C46-S9 item 4), based on `origin/main` `379e837`:

| Component | Path | SHA-256 (raw bytes) |
|---|---|---|
| `rendererSource` | `src/lib/filing/reviewed-pdf/renderer.ts` | `ce45ca2c75349eb93cff5797158461cd908135a1e5a59e55309be2c5ba6bfbdf` |
| `fonts["NotoSans-Regular.ttf"]` | `src/lib/filing/fonts/NotoSans-Regular.ttf` | `f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5` |
| `fonts["NotoSansSC-Regular.otf"]` | `src/lib/filing/fonts/NotoSansSC-Regular.otf` | `faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9` |
| `packages` | `package-lock.json`: the closure of `pdfkit` 0.17.2 and `fontkit` 2.0.4 | 21 entries, see `manifest.json` |

Reproduce: `shasum -a 256` the three files; read the `packages` entries from the Suite's
`package-lock.json`; assemble and JCS-hash as above. In the Suite, `computeRendererBuild()` does
exactly this.

## Not in this manifest

- The rule-packs compatibility registries for `uk-sa/2025-26@1.1.0` and `@1.2.0` have no approved
  entry, so no `reviewedPdf.rendererBuildDigest` references this build yet. Approving one is a
  separate registry step (D049), as it was for 1.0.0.
- The runtime and toolchain the pinned code runs on are not pinned. They are:
  - **Node.js**: production runs the Suite image `FROM node:24-alpine`, an unpinned tag.
  - **The compile toolchain**: `next build` (Next.js 16.2.7, Turbopack with SWC transforms)
    compiles `renderer.ts` into the server bundle. The Suite `tsconfig.json` sets `target` ES2017,
    and Jest uses ts-jest. The digest hashes the TypeScript source, not the emitted JavaScript.
  - **ICU collation tables**: the renderer orders fields with `localeCompare(…, 'en-US')`, which
    uses the ICU data bundled with the Node binary.

  The renderer writes uncompressed content streams, and pdfkit derives the document /ID with
  crypto-js MD5 (pinned above). The byte-identity evidence covers Bun 1.3.14 and Node v22.23.1
  (ICU 78.2; d063 audit and C46-S9 item 4 tests, 2026-09-26). It does **not** yet cover the Node 24
  image production runs. Each reviewed PDF records `process.versions.node` and
  `process.versions.icu` in its `rendererBuild.runtime` metadata. These are for diagnosis only and
  are outside the digest. A runtime change that altered the bytes would not change the digest, but
  regeneration still fails closed: the regenerated sha256 must equal the original pdfHash
  (`regenerated_hash_mismatch`).
- **Before deploying a new Suite base image** (a `node:24-alpine` refresh or a Node or ICU
  upgrade), re-run the byte-identity fixture on the new image: the Suite's
  `pdf-regeneration.itest.ts` and `reviewed-pdf-renderer-build.test.ts`. That catches a runtime
  change before it makes existing reviewed PDFs unregenerable.
