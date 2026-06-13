# Platform Tax Calculation Engine — Design

Status: DECIDED — D3 (co-located .NET sidecar), owner steer 2026-06-13
Date: 2026-06-13
Owner: tax-calc-engine
Scope: how every FirstLot app obtains tax computation from one shared engine

> **Decision (owner steer, 2026-06-13):** Direction **D3** — the .NET engine
> runs in the **live path** as a co-located sidecar (localhost), giving
> decimal-authoritative computation now, reached through a no-regret contract +
> adapter + parity-gate core that is identical across D1/D2/D3. Driver: **first
> principles, accuracy, and compliance** — not "it's already built." Decision
> rule: **flip up to D1** (standalone externally-exposed service) when a real
> non-Node / external consumer contract appears; **D2** (TS-live, .NET-oracle)
> is explicitly rejected because it keeps the less-precise decimal.js path in
> the live filing numbers. Arrived at via two-model design council (Claude +
> Codex); Codex independently moved D2→D3 when forced to weigh decimal
> correctness and contract-boundary forcing. See Council Decision Record.

---

## 1. Decision being recorded

`tax-calc-engine` is the **platform-wide tax calculation engine** — not a
CGT-only engine. It runs in the live path as a **co-located .NET sidecar**
(D3): authoritative tax numbers are computed in native .NET `decimal`, never
JS floats. Changing this direction requires explicit discussion with the owner.

Its consumers are the **data-owning apps** — the apps that hold the raw facts a
tax computation needs: cgt-app (investment transactions → CGT), income-app
(income → FTC/income), property-app (property events). The filing hub
(firstlot-suite) and other lightweight apps are **not** engine consumers; they
read each child app's already-computed *results* via the existing filing
contracts (`platform-contracts/investment-tax.ts`, `income-tax.ts`). No app
re-owns tax-calculation semantics. (See Review Finding 1 — the engine has a few
data-rich callers, not many lightweight ones.)

This is already the stated intent in `tax-calc-engine/PORT_PLAN.md`:

> "tax-calc-engine should be treated as the platform-owned domain engine for
> tax calculation. cgt-app remains a child app/workflow layer and must not
> become the long-term owner of tax-calculation semantics."

This design turns that intent into a concrete consumption architecture and a
release path.

---

## 2. Why now — the forcing function (facts)

- **Duplication already caused a production-visible bug.** The positions
  surface maintained its own cost-basis model in parallel with `computeUkCgt`.
  The copies diverged: a migrated holding showed transfer-date value instead
  of carried Section 104 cost. Root-fixed 2026-06-13 by making positions
  consume the engine (cgt-app `d636a93`). Every parallel copy of tax logic is
  a latent version of this bug.
- **Consumers are multiplying.** `platform-contracts/src/` already defines
  `investment-tax.ts` and `income-tax.ts`; `firstlot-suite` is the filing hub;
  income-app exists. Each new app that re-implements tax math is a new
  divergence surface.
- **The engine is parity-proven but unused.** `UkCgtEngine` passes 155 .NET
  tests including field-for-field parity against 70 TS fixtures and real-data
  shadow runs (3 accounts, 1,203 txns). `CorporateActionsEngine` and
  `FtcCalculator` exist. A compute API (`POST /api/cgt/compute`) returns
  TS-shaped JSON. **But cgt-app still runs the live TypeScript `computeUkCgt`
  — the .NET engine is not mounted or consumed anywhere.**

So: the engine is ready, the duplication is biting, and the consumer count is
about to grow. This is the moment to fix the consumption architecture.

---

## 3. Constraints (decided, not up for review)

1. One engine owns all tax-calculation semantics (CGT, dividends/FTC, income,
   property, allowances, loss offset, rate bands).
2. Engine consumers are the data-owning apps (they hold the input facts and
   send them per call). Result consumers (suite, lightweight apps) read
   published child-app output via filing contracts and never call the engine.
3. The engine is .NET and the apps are Node/Next.js, so consumption is over
   HTTP (a Node app cannot `file:`-import a .NET library). This language
   boundary — not the consumer count — is what makes the engine a service.
4. For release, cgt-app should consume the .NET engine for CGT (stop being the
   live owner of share-matching semantics).
5. The TypeScript source of truth (`uk-share-matcher.ts`) and the fixture +
   shadow parity gates remain canonical during transition. The .NET engine
   earns each consumer by proving parity, not by assertion.
6. Modular-monolith posture holds for the *apps* (per cgt-app
   `MICROSERVICES_ANALYSIS.md`). This design adds exactly ONE new deployable —
   the tax engine — not a fleet.

---

## 4. Architecture

### 4.1 Shape

```
 data-owning apps          localhost (same pod)        results consumers
 ┌─────────────┐  client   ┌───────────────────────┐   ┌──────────────┐
 │  cgt-app    │──────────▶│ .NET sidecar           │   │ firstlot-    │
 │  income-app │  @firstlot│  UkCgtEngine           │   │  suite       │
 │ property-app│ /tax-     │  CorporateActionsEngine│   │ (reads child │
 └─────────────┘  engine-  │  FtcCalculator         │   │  app RESULTS │
        │         client   │  TaxComputation (P6)   │   │  via filing  │
        │  publish results │  decimal in/out        │   │  contracts)  │
        └──────────────────┴───────────────────────┘──▶└──────────────┘
```

- **The engine runs as a co-located sidecar** (a second container in each
  data-owning app's pod, or one shared engine pod on the same K3s VM —
  localhost only, never publicly exposed). Stateless; all inputs per request;
  no DB of its own. Not a separately-scaled, separately-on-call network service
  — that is D1, reached only when an external consumer forces it.
- **The contract is the real product**, versioned in `platform-contracts`
  (new `tax-engine.ts`): request shapes (transactions, elections, residency,
  income lines) and response shapes (disposals, holdings, tax-year totals,
  FTC, allowances applied). **Accuracy-critical: all monetary/quantity fields
  cross the wire as decimal strings or scaled integers, NEVER JSON numbers** —
  a JS `number` at the boundary silently re-introduces the float imprecision
  the whole .NET-`decimal` choice exists to eliminate. The contract is the line
  the decimal must survive.
- **Each app holds a thin adapter** (`@firstlot/tax-engine-client`) that wraps
  the localhost call behind a typed function. Apps never hand-roll the request
  or parse the response. Result consumers (suite) do not hold this client.

### 4.2 The adapter makes the runtime placement a reversible flip

The adapter interface is the seam. Behind it:

- **local** — in-process TS `computeUkCgt` (today's cgt-app behaviour, wrapped).
- **sidecar** — the co-located .NET engine over localhost (the D3 live target).
- **service** — a standalone externally-exposed .NET service (D1, future).

cgt-app ships the adapter with `local` now (no visible change), then flips
`local → sidecar` per consumer behind the shadow guard (§7). Because the seam
is one interface, moving `sidecar → service` later (D1) is a config change, not
a rewrite. This is tax-calc-engine/PORT_PLAN's "replace by adapter, not flag day."

**Decided: D3 (sidecar) is the live target; D1 (service) is the upgrade.** The
driver is first-principles accuracy and compliance — filing numbers must be
computed in audited .NET `decimal`, not decimal.js-over-JS-doubles (parity-equal
to 1e-9 today, but accuracy-first means the authoritative path is the exact one,
and the contract carries decimals losslessly per §4.1). **D2 (TS-live,
.NET-oracle) is rejected** for keeping the less-precise path in live filing
numbers. **Flip to D1** when a real non-Node / external consumer (accountant
tooling, partner API, engine-as-product) needs a publicly-exposed,
independently-scaled service.

---

## 5. What moves to the engine vs. what stays in apps

The dividing line is the one the positions bug taught us: **tax semantics →
engine; bookkeeping, valuation, presentation, persistence → app.**

| Logic | Lands in | Status |
|---|---|---|
| Share matching, CA, FTC | engine | ✅ built (.NET) |
| **Tax computation: AEA, loss offset (same-year → carried-forward), rate bands** | engine (Phase 6) | ❌ scattered in cgt-app routes — **port next** |
| **Rebasing / split-year overlay** | engine (Phase 9) | TS-only in cgt-app — port |
| **s.144 option-assignment matching** | engine | TS in import passes — port |
| Dividend/foreign-income classification | engine (front-end to `FtcCalculator`) | SQL-native in cgt-app — see §8 boundary Q |
| Portfolio quantity/position state + valuation/unrealized P&L | **app** (pure module, takes cost from engine) | inline in 3 fat routes — extract |
| SA108/SA106 box mapping | app / forms layer | inline in export routes |
| Market price fetch, caching, persistence, auth, UX | app | ✅ stays |

Net: cgt-app's three fattest routes (positions 849, tax-summary 879,
computation 766 LOC) drain toward thin HTTP + one portfolio-valuation module;
all tax math consolidates behind the engine contract.

---

## 6. Contract sketch (`platform-contracts/src/tax-engine.ts`)

```ts
// One request envelope; engine dispatches by `compute`.
// Per-domain endpoints (/cgt, /ftc, /income, /property) share one service and
// one envelope, but each keeps its own request/response type so they version
// independently — avoid a single mega-endpoint whose `inputs` union becomes a
// god-object (Finding 4).
interface TaxEngineRequest {
  compute: 'cgt' | 'ftc' | 'income' | 'property';
  taxYear: string;                 // "2024-2025"
  rulesetYear: string;             // pins which year's RULES to apply — distinct
                                   // from taxYear so amendments recompute a prior
                                   // year with that year's rules (Finding 5).
  inputs: CgtInputs | FtcInputs | IncomeInputs | PropertyInputs;
  options?: { residencyStartDate?: string; /* … */ };
}
interface CgtInputs {
  transactions: RawCgtTransaction[];   // already the engine's input shape
  rebasingElections?: RebasingElection[];
  carriedForwardLosses?: number;
  annualExemption?: number;
  rateBands?: RateBand[];
}
interface CgtResult {
  disposals: DisposalComputation[];
  holdings: Record<string, HoldingBreakdown>;
  taxYearTotals: Record<string, TaxYearTotals>;
  taxComputation?: { taxableGain; lossesApplied; lossesCarriedForward;
                     taxDue; effectiveRate; breakdown };   // Phase 6
  warnings: string[];
  engine: { version: string; ruleset: string };
}
```

The CGT request/response already exist in byte-compatible form
(`CgtComputeController` + `TsResultJson`); this just versions them in
platform-contracts and adds the Phase-6 `taxComputation` block.

---

## 7. Release path (phased, each gated by parity)

> **Cost reality (Finding 2):** a compute call ships the user's whole assembled
> history — measured 278 KB for a 599-txn account, MBs for heavy users — and
> `computeUkCgt` is called from 11 routes incl. hot pages. A localhost
> .NET round-trip is **~15-40 ms, not sub-millisecond.** So the results cache
> is a **prerequisite of P1, not a later nicety**: without it, flipping to the
> service regresses hot-page latency.

**P0a — Results cache (prerequisite).**
Extend `cgt_realized_summary_cache` to persist the `holdings` map (the recompute
path already computes and discards it). Hot routes read the cache; the engine
runs once per data-change, not per page load. Staleness detection already
exists. This must land before P1.

**P0b — Contract + client (no behaviour change).**
Add `tax-engine.ts` to platform-contracts (per-domain request/response types;
decimals as strings/scaled integers per §4.1). Build
`@firstlot/tax-engine-client` with `local` (wraps existing TS `computeUkCgt`) +
`sidecar` (localhost HTTP) impls. cgt-app routes call the client's `local` impl.
Ship. Zero risk.

**P1 — Mount the sidecar; flip cgt-app CGT to `sidecar`, one consumer at a time.**
Run the .NET engine as a localhost sidecar. Shadow-compare guard: cgt-app runs
both `local` and `sidecar` and logs diffs (the shadow harness already exists).
**Flip per call-site (positions first, then computation, tax-summary, …), not
all 11 at once** — bounded blast radius.
**Exit criteria per consumer:** the real-account shadow corpus (3 accounts,
1,203 txns) plus any new ones; diffs triaged to zero or documented.
**Accuracy-first reframe of the gate:** the .NET `decimal` result is the *more
correct* one, so the shadow compare is hunting **behavioral divergence** (logic
bugs), not last-digit equality. A >1e-9 disagreement is a TS bug to fix, not a
reason to hold the .NET flip; sub-1e-9 differences resolve in favour of .NET.
Compare semantic fields (holdings, disposals, taxComputation), not raw ordering
or float noise. This is the "use the .NET CGT engine for release" milestone.

**P2 — Port Phase 6 (tax computation) into the engine.**
AEA, loss offset, rate bands move from cgt-app routes into the engine behind
`taxComputation`. cgt-app deletes the scattered route math.

**P3 — Port rebasing (Phase 9) + residency/split-year + s.144 into the engine.**
Removes the last TS-only tax semantics from cgt-app.

> **Compliance-accuracy gap found 2026-06-13 (residency/split-year):** the live
> CGT path (`computeUkCgt`, cache, positions, tax-summary) determines residency
> taxability with a **single `residencyStartDate`** = `MIN(period_start_date)`,
> which only excludes disposals before first UK arrival. It is **wrong** for
> departures (counts non-resident-period disposals as taxable), split-year
> arrivals (uses `period_start`, not `uk_part_start_date`, so overseas-part
> disposals get included), and re-arrivals (multiple periods collapse to one
> date); and it does not model temporary non-residence claw-back (TCGA s.10A).
> Harmless no-op for resident-throughout users (the common case); wrong tax for
> the residency-complex minority.
> The compliance-grade logic already exists but is **orphaned**:
> `is_disposal_taxable_in_uk(user, date, is_uk_asset)` (per-disposal,
> status-aware, split-year UK-part boundaries) is called only by the standalone
> `/api/residency/disposal-taxability` route, never by the gains path; and the
> `user_residency_periods` table already holds the full timeline (8 split-year
> cases, uk_part dates).
> **Required in P3:** the engine residency input is the **full timeline**
> (periods with start/end + resident status + split-year case + uk_part dates +
> UK-asset flag), not a single date; residency taxability moves *into* the
> engine (it is tax semantics), replacing both the crude `residencyStartDate`
> filter and the orphaned SQL function with one determination. Decide TNR
> (s.10A) scope explicitly. This is a first-principles accuracy item, not a
> nice-to-have.

**P4 — New consumers.**
income-app / property-app / suite call the `service` client directly. No
`local` impl is ever built for them.

**Parallel, app-side: portfolio-valuation module** (pure TS in cgt-app) — drain
quantity/valuation math out of the fat routes. Independent of P0–P4.

---

## 7b. Engine lifecycle & source of truth (decided 2026-06-13)

The single-source-of-truth question is orthogonal to runtime placement (§4) and
must be answered explicitly, or "two engines kept in sync by a test gate"
silently becomes the steady state — the exact divergence liability that caused
the positions cost-basis bug.

**End state: ONE live engine — .NET. The oracle is the fixtures, not a second
engine.**

```
   TODAY            TRANSITION (one release)         STEADY STATE
 ┌─────────┐      ┌──────────────────────────┐     ┌──────────────────────┐
 │ TS live │  →   │ finish Phase 6+rebasing   │  →  │ .NET live (sidecar)   │
 │ (all    │      │ +s.144 ports; fixtures    │     │ fixtures = oracle     │
 │  logic) │      │ generated from TS; full   │     │ dev runs .NET         │
 │ .NET    │      │ shadow-prove; ONE clean   │     │ TS = CI-proven        │
 │ partial │      │ cutover (no split-brain)  │     │   emergency backup    │
 └─────────┘      └──────────────────────────┘     └──────────────────────┘
```

1. **Full port then clean cutover (next release).** Phase 6 (AEA/loss/rate
   bands), rebasing/split-year, and s.144 are ported into the engine *before*
   cgt-app flips live. No split-brain where one filing number is co-produced by
   .NET (matching) and TS (rebasing pre-pass / s.144 / AEA) — that would be
   temporarily worse for single-source-of-truth than today's all-TS state, and
   it half-defeats the accuracy driver.

2. **Fixtures are the oracle, not the TS code.** Fixtures are language-neutral
   golden outputs. During transition they are generated from TS and the .NET
   engine must match them (proving the port introduced no logic bug). At
   cutover, canonical authority transfers **one-directionally** to .NET:
   fixtures are regenerated from .NET and thereafter .NET is the only place tax
   logic is authored or changed. (Status: matching/CA/FTC fixtures already
   ported + green, 155 tests; each remaining port brings its own fixtures.)

3. **Dev runs .NET.** After release, local dev runs the sidecar container — same
   engine as prod, same numbers. No TS dev path. (dev/prod parity > convenience)

4. **TS survives ONLY as an availability-triggered emergency backup — and only
   under three conditions, or it is backup theatre:**
   - **(a) CI keeps both engines green on every change.** The fixture gate runs
     against .NET *and* TS forever, not just through cutover. An
     unused-except-emergencies engine rots silently; continuous proof is what
     makes the parachute real.
   - **(b) The DR trigger is *availability*, not *correctness*.** Fall back to
     TS when the sidecar is unreachable (crash/OOM/bad deploy). A live
     correctness bug is undetectable in real time, so it is not a fallback
     trigger.
   - **(c) DR-mode files decimal.js-precision numbers — a conscious
     availability-over-accuracy reversal, for outages only.** This overrides the
     §8.4 default ("sidecar down → cached + 'unavailable', never compute with
     the lesser engine"). "Aligned" means behaviorally identical (same rules,
     same matching), never bit-identical (decimal.js ≠ native decimal,
     parity-equal only to 1e-9).

   If any of (a)-(c) is not held, TS should be **frozen** (git tag, stop
   aligning) or **deleted**, not maintained-in-alignment — "aligned but unused"
   pays the full double-authoring cost for zero runtime benefit.

---

## 8. Decisions (resolved in eng review, 2026-06-13)

1. **Income/foreign-income ownership — RESOLVED.** The engine exposes per-domain
   compute kinds; each is called by the app that *owns* that domain's data
   (cgt-app → `cgt`; income-app → `ftc`/`income`; property-app → `property`).
   cgt-app does not compute income tax. Ties to Finding 1.
2. **One service, per-domain endpoints — RESOLVED.** One deployable, but
   `/cgt`, `/ftc`, `/income`, `/property` each keep their own request/response
   type so they version independently (no `inputs` god-object).
3. **Versioning — RESOLVED.** Request pins `rulesetYear` (not just
   response-embedded version) so amendments recompute prior years under the
   right rules. Contract semver in platform-contracts.
4. **Latency — RESOLVED.** Network round-trip is ~15-40 ms (not sub-ms), so the
   results cache (P0a) is a prerequisite, not optional. Revisit an in-process
   .NET sidecar only if cached-path latency proves insufficient.
5. **TS retirement — RESOLVED.** Frozen-as-oracle. Delete trigger: `.NET`
   `service` has been default for 2 full tax years with zero shadow diffs.

**Held for discussion (not decided):** TS-shared-library alternative to the
.NET service (Finding 3). Direction is .NET per owner; reopening requires
explicit discussion.

---

## 9. Non-goals

- Splitting the *apps* into microservices (explicitly rejected by
  `MICROSERVICES_ANALYSIS.md` at current scale). This adds one deployable: the
  engine.
- Rewriting cgt-app's portfolio/valuation/UX. Only tax semantics consolidate.
- Changing the TS→.NET parity discipline. The gates stay; consumers migrate
  behind them.

---

## GSTACK REVIEW REPORT

Review: plan-eng-review (engineering/architecture lens), 2026-06-13.
Mode: prose-steered (owner steers in prose, not the question tool). Outcome: D3 decided.

| # | Finding | Severity | Confidence | Disposition |
|---|---------|----------|-----------|-------------|
| 1 | "Lightweight consumers call the engine" is a category error — they hold no input data; they read published results via filing contracts. Engine callers are data-owning apps. | P1 | 8/10 | Folded into §1, §3, §4.2, §8.1 |
| 2 | "stateless/no-DB" hides a fat payload (278 KB / 599 txns) over 11 call sites; "sub-millisecond" is wrong (~15-40 ms). Results cache is a prerequisite. | P1 | 9/10 | Folded into §7 (P0a prerequisite) + §8.4 |
| 3 | .NET-as-service breaks the platform's shared-library pattern (ingestion/contracts/verifier are libs). Real driver is the language split, not consumer count. | P2 | 8/10 | Direction held (.NET) per owner; TS-lib alternative parked for discussion (§4.2, §8) |
| 4 | One mega-endpoint `inputs` union becomes a god-object. | P2 | 7/10 | Folded into §6 (per-domain endpoints) + §8.2 |
| 5 | Versioning must pin `rulesetYear` for amendments, not just report engine version. | P2 | 7/10 | Folded into §6 + §8.3 |

VERDICT: Direction sound and parity discipline strong. Two structural
corrections were required and are now folded in: (1) re-scope consumers
(data-owning apps call the engine; suite reads results), (2) results cache is a
P1 prerequisite and the latency claim was corrected. The .NET service boundary
is accepted as the cost of the committed .NET direction — justified by the
Node/.NET language split, not by lightweight consumers. No direction change made.

CROSS-MODEL: not run (single-lens eng review at owner's request).
UNRESOLVED: none blocking. Parked-for-discussion: TS-shared-library alternative.

---

## Council Decision Record (2026-06-13)

**Council:** Claude (eng/architecture lens) + Codex (adversarial, 2 rounds).
**Method:** independent review → adversarial pass → forced steel-man of the
committed direction + middle option → owner steer.

**Convergence:** Both models independently found no *technical* forcing function
for a full network service (D1) at current Node-only consumer topology. Round 2,
forced to steel-man D1 and weigh the sidecar, Codex moved D2→D3. Claude landed
D3 as the reconciliation of the owner's stated ".NET live" intent with the
technical facts. Genuine convergence, not groupthink (different routes).

**Owner steer:** driver is **first principles, accuracy, compliance** → D3.

**Decision:** D3 (co-located .NET sidecar, decimal-authoritative live path).
- D2 rejected: keeps decimal.js in live filing numbers.
- D1 deferred: flip when a real external/non-Node consumer contract appears.

**Operational findings folded in (apply under D3, Codex round 1+2):**
1. Decimals cross the wire as strings/scaled integers, never JSON numbers (§4.1)
   — the single most accuracy-critical detail.
2. Cache invalidation must key on EVERY input dimension (txns, rates, elections,
   losses, residency, CA overrides, rebasing) — not just transactions. The
   "recompute once per data-change" guarantee only holds if all dependencies are
   in the invalidation graph.
3. `rulesetYear` should be a pinned ruleset **hash/revision**, not just a year —
   rule packs get hotfixed. Amendments recompute against the historical input
   snapshot + historical ruleset, not recomputed current state.
4. Sidecar lifecycle is real infra: startup ordering, health checks, restarts,
   protocol-version compat between Node client and .NET sidecar. Define a hard
   fallback policy (whole-journey, not mixed-mode per route) for sidecar-down.
5. Dual-run shadow window doubles compute cost and can flood logs — normalize/
   filter diffs to semantic fields or operational blindness results.

**First step (no-regret, identical across D1/D2/D3):** P0a results cache +
P0b contract + adapter with `local` impl. Runtime placement (sidecar) is a
later reversible flip behind the adapter.
