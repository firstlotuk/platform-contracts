# Platform Architecture Docs

Cross-repo, platform-level design docs live here. `platform-contracts` is the
established cross-repo boundary repo (it owns the stable contracts that cross
runtime boundaries), so the architecture docs that govern those boundaries sit
beside them.

**Rule of thumb:** a design doc lives here if it spans more than one repo /
service. A doc that governs a single engine or app lives in that repo's own
`docs/`.

## In this directory

| Doc | Scope |
| --- | --- |
| `PERSON_CORE_DATA_DESIGN.md` | Platform person/identity data architecture — L0 gateway identity vs L1 customer-core (residency, identity, domicile). Council-approved; §10 home = A (dedicated `sub`-keyed L1 service), §14 hardening requirements binding. |
| `TAX_ENGINE_PLATFORM_DESIGN.md` | How the platform consumes the tax-calc engine — D3 sidecar, source-of-truth lifecycle, phases P0–P4. Spans cgt-app / income-app / property-app / suite. |

## Related docs that live with their owner (not here)

| Doc | Where | Why there |
| --- | --- | --- |
| `RESIDENCY_TAXABILITY_DESIGN.md` | `tax-calc-engine/docs/` | Engine tax semantics (classify-don't-filter residency determination); it's engine logic, P3 moves it into the .NET engine. |
| `PORT_PLAN.md` | `tax-calc-engine/` | Engine-internal TS→.NET port plan. |
| Person-core council package | `<workspace>/design-councils/person-core/implementation/0.1.0/` | Point-in-time council run record (Designer + Reviewer trace, issue register). |
