# reviewed-pdf-renderer-build/1.0.0 — provenance

`manifest.json` is the composite input for `compatibility-manifests.json`'s
`reviewedPdf.rendererBuildDigest` (schema: `repos/rule-packs/src/annual-definitions.ts:86-90`).

No combination method existed for `rendererBuildDigest` before this proposal. The method chosen
(C46-COMPAT, 2026-08-08): hash each component individually with plain SHA-256 over its raw file
bytes, assemble those hashes into the small JSON object below, then hash *that* object with the
same JCS (RFC 8785) canonicalization + SHA-256 method used everywhere else in this registry
(`sha256:` + hex(SHA-256(canonicalize(json)))). This is a mechanical design choice, not a judgment
call about tax logic — flagged to the owner as such.

`manifest.json`'s exact committed bytes are:

```json
{
  "reviewerSource": "sha256:31fdbda658cf3a3806515453884f6e0282036724037ea58bf8be83ee731f8f5f",
  "fonts": {
    "NotoSans-Regular.ttf": "sha256:f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5",
    "NotoSansSC-Regular.otf": "sha256:faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9"
  }
}
```

Component hashes are plain `sha256:` + hex(SHA-256(raw file bytes)) — **not** JCS-canonicalized,
since `review.ts` and the `.ttf`/`.otf` files are not JSON. Only the composite manifest.json above
is JCS-canonicalized.

Sources (all from `firstlot-suite` at `origin/main` commit `0b6cc6cccbdc21674c98723ee748c7db809cf791`):

| Component | Path | SHA-256 (raw bytes) |
|---|---|---|
| `reviewerSource` | `src/lib/filing/review.ts` | `31fdbda658cf3a3806515453884f6e0282036724037ea58bf8be83ee731f8f5f` |
| `fonts["NotoSans-Regular.ttf"]` | `src/lib/filing/fonts/NotoSans-Regular.ttf` | `f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5` |
| `fonts["NotoSansSC-Regular.otf"]` | `src/lib/filing/fonts/NotoSansSC-Regular.otf` | `faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9` |

`review.ts` at this commit is the version merged via PR #43 (`fix/c46-pdf-unicode-fidelity`,
merge commit `04c90b4`) implementing `C46-PDF-UNICODE` — pdfkit + fontkit-based CID subsetting
embedding real Noto Sans / Noto Sans SC glyphs, superseding the prior base-14-Helvetica-only
renderer (which substituted non-ASCII characters with `?`).

Reproduce: `git show 0b6cc6c:src/lib/filing/review.ts | shasum -a 256`, and likewise for the two
font files, then assemble and JCS-hash as above.

Composite `rendererBuildDigest` (JCS-SHA-256 of `manifest.json`):
`sha256:7f0f92e9432c8522a47d7d4486a56bb60371dcae17e15122f8a5b8b88b3a166c`
