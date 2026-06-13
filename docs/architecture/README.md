# MOVED → specs/platform/

The platform-architecture design docs that briefly lived here have moved to the
workspace spec corpus, where cross-repo platform docs belong (see
`specs/governance/SPECS_STRUCTURE.md`):

- `PERSON_CORE_DATA_DESIGN.md`  → `specs/platform/` (id: `person-core-data-design`)
- `TAX_ENGINE_PLATFORM_DESIGN.md` → `specs/platform/` (id: `tax-engine-platform-design`)
- `RULE_ENGINE_PLATFORM_DESIGN.md` → `specs/platform/` (id: `rule-engine-platform-design`)

This `docs/architecture/` directory is retired — a code package is not the home
for platform architecture. The shared contract *types* still live in
`platform-contracts/src/`; only the design docs moved.
