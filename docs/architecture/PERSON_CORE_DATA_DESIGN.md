# Person-Core Data — Platform Design

Status: COUNCIL-APPROVED (PCORE-1, 2026-06-13) + owner-ratified §10 = A.
  Structure approved against the GTM spec; 5 hardening requirements added (§14);
  the home decision is RESOLVED to A (dedicated sub-keyed L1 service).
Date: 2026-06-13
Scope: where shared person-level facts live, who owns them, how services
integrate, who runs the CRUD, and the (now-resolved) core's home.
Authority: GTM security spec §2/§5, D0.5, D0.6; GTM 00_INDEX (Stage-1 topology).
Council package: <workspace>/design-councils/person-core/implementation/0.1.0/ (Designer
  claude/opus + Reviewer codex, 10 turns, all 8 issues closed).
Supersedes: the earlier suite-owned draft (wrong — see §1).

---

## 1. Correction against the authority doc

The earlier draft said the **suite** owns person-core. That is wrong per the
security spec, and the spec is the authority here:

- **Identity authority is the GATEWAY**, not the suite. It mints the stable
  FirstLot `sub` and owns sessions. The suite "has no user table by design — it
  rides cgt" (D0.5 #2). So the canonical "one id across all apps" record is the
  gateway `sub`; the gateway is the hub, every other store is keyed off it.
- **Identity ≠ person-core.** The spec splits two layers (§5: "resource access
  is separate from identity"):
  - **L0 Identity (gateway, exists):** minimal, auth-centric — `sub`, email
    (join fallback only), verified state, coarse platform role, sessions. NOT a
    rich person record.
  - **L1 Resource / customer / taxpayer core (deferred, home OPEN per D0.6):**
    the rich person facts — name, billing, KYC, taxpayer entities, residency,
    domicile. Keyed by `sub`, sitting **beside** the apps, never above the
    gateway. Its home is an explicit open decision (§10).

So a person-core can exist, but as the L1 resource layer keyed by `sub` — it
never becomes the identity authority and never displaces the gateway.

## 2. God view — the layered platform

```
                ONE stable join key: gateway sub  (everything hangs off it)

 L0  IDENTITY AUTHORITY ── GATEWAY (exists, Stage 1)
     sub · email · verified · coarse role(token) · sessions     "who you are"

 L1  RESOURCE / CUSTOMER LAYER  (keyed by sub, BESIDE apps, never above gateway)
     ┌──────────────────────────────┐     ┌────────────────────────────┐
     │ Customer / Taxpayer Core      │◄───►│ DMS — document-service     │
     │ (DEFERRED, Stage 2, home TBD) │ link│ (exists)                   │
     │ residency timeline · identity │     │ person-uploaded docs /     │
     │ · domicile · billing · KYC    │     │ evidence (visa, SRT, …)    │
     └──────────────────────────────┘     └────────────────────────────┘
        ▲ writer: residency tracker (future)   ▲ residency.evidence_location → here

 L2  APP DOMAIN DATA  (per-app, keyed by sub)
     cgt: txns/elections   income: income/employment/SA109   property: events
     (today each ALSO holds its own slice of L1 until the core consolidates)

 L3  ENGINES (stateless): tax-calc · residency-requirement — consume L1+L2 as input

 ACCESS LAYER (§9 spec, deferred): scoped owner/accountant/viewer grants —
     resource access, separate from the L0 platform role.
```

## 3. Is person-core a separate service?

- **Today (Stage 1): no.** No consolidated store exists. Person data is
  fragmented across per-app slices keyed by `sub` (cgt holds full_name/Stripe/
  residency timeline; income holds taxpayer details + per-year residency status).
  In-scope and correct for Stage 1.
- **Consolidated (Stage 2): yes — a separate L1 resource service** (or
  DMS-adjacent), keyed by `sub`. NOT the suite, NOT the gateway, NOT inside any
  one app. Which exact form is the open decision in §10.

The platform's real pattern already proves this shape: the gateway and the DMS
are both standalone, `sub`-keyed services beside the apps. The customer core
would be another one.

## 4. What the customer core holds (and the inclusion test)

A fact belongs in L1 customer core ONLY if: person-level + needed by ≥2 domains
+ stable.

- IN: identity-link (`sub`), personal details (dob, name, address, marital),
  domicile, residency timeline, billing/KYC.
- OUT: domain data (txns, **employment/income lines**, property events, **CGT
  rebasing elections** — residency-*triggered* but a CGT choice → stays in cgt's
  L2); auth/roles (L0 gateway, token); computed results (engine output, never
  stored).

## 5. One source, derived views (the residency reconciliation)

Residency is held ONCE as the **period timeline** (the computation-grade shape).
Everything else derives from it — never a second stored copy:
- income-app's per-year SA109 status enum = the timeline classified per year.
- cgt-app's per-disposal taxability = the timeline classified per disposal.

**The two live models must reconcile (the real Stage-2 work):**
- cgt-app `user_residency_periods` = rich period timeline → **canonical**.
- income-app `taxpayer.residency_status` + per-year config = coarse enum →
  becomes a **derived view**.
- **Asymmetry (the crux):** timeline → enum is derivable; the reverse is LOSSY
  (a coarse year enum can't reconstruct period dates). So the core sources from
  the rich timeline; users with only coarse data supply detail when CGT needs it.

## 6. The DMS relationship

The DMS (`document-service`, exists) is an L1 peer: person-uploaded documents /
evidence, keyed by `sub`. It LINKS to the structured core by reference — e.g. a
residency period's `evidence_location` points at the visa / SRT-determination
doc in the DMS (`evidence_type` ∈ EMPLOYMENT_CONTRACT, VISA, SRT_DETERMINATION).
Structured facts in the core; their proof in the DMS; joined by `sub` + pointer.

## 7. Residency tracker (future product)

An L1 resource service keyed by `sub`. It computes the residency timeline from
day-level presence (SRT) + ILR/citizenship tracking, and becomes the
**authoritative writer of the residency slice** of the customer core. It "links
to person-core" = it shares the `sub` key and owns that slice; it does not
duplicate identity.

## 8. Integration mechanics (the gateway-role discipline, applied to L1)

1. **Join** — everything keys by gateway `sub`.
2. **Read** — apps get a launch-time snapshot via `FilingContext` + an on-demand
   read endpoint.
3. **Write** — single writer per slice; apps write through the owner's API,
   never directly (see §9).
4. **Derive** — apps derive their views (taxability, SA109 status, NRCGT) from
   the canonical timeline.
5. **Invalidate** — a core change emits an event that busts downstream computed
   caches within an SLA (the residency-election → cache-bust already shipped is
   the first instance). The domain analog of the gateway's "role → revoke-all."

Channel split vs auth: roles are tiny/security/every-request → token + revoke-all
(L0). Customer-core facts are larger/PII/occasional-read → on-demand fetch +
data-change invalidation (L1). Don't put residency timelines or NINO in tokens.

## 9. CRUD & orchestration — where the write logic runs

**Principle: CRUD logic lives with the data OWNER, behind an API. The
user-facing app ORCHESTRATES a flow across owners; it does not OWN data outside
its own layer.** So "where does the logic sit" = "which layer is the data."

| What's written | Owner | Where the CRUD logic runs |
|---|---|---|
| A document (SA302 PDF, broker file, visa) | DMS | DMS API |
| Employment / income figures, dividends | income-app (L2) | income-app |
| Transactions, CGT elections | cgt-app (L2) | cgt-app |
| Residency timeline, identity, domicile | person-core owner | the owner's API (today the app's slice; Stage 2 the L1 service) |

**The write reaches an owner via one of several ENTRY ROUTES — document upload
is only one, not the model.** Whatever the route, the same rule holds: the fact
is written by its owner; the app orchestrates.

- **(a) Direct edit — the common case.** User updates employment in a form →
  income-app writes its own L2 directly. User edits a residency period in the
  residency UI → the app calls the person-core owner's API. No document, no
  extraction. Most CRUD is this.
- **(b) Document upload + extraction — one route.** A doc (SA302, broker
  statement, visa) is stored in the DMS, parsed by an ingestion-style extractor,
  and the *extracted facts* route to their owners — exactly as in (a), just with
  a doc + parse step in front and a provenance link back to the DMS.
- **(c) Bulk import — one route.** A broker file → firstlot-ingestion → cgt L2.
  Same: parsed facts written by their owner.

So the routes differ only in how facts ARRIVE; they converge on the same
owner-writes / app-orchestrates rule. Illustrating route (b), the busiest fan-out:

```
"upload SA302" (income-app)  — ONE route, not the general model
   ├─▶ DMS: store the PDF, return doc id                ← DMS owns doc CRUD
   ├─▶ extract structured facts (ingestion-style parser)
   ├─▶ income figures (employment, tax paid) ─▶ income-app L2 CRUD   ← income owns
   ├─▶ IF a person fact changed (e.g. residency) ─▶ person-core owner's API
   └─▶ link extracted facts → DMS doc id (provenance)
```

income-app **drives** the flow but writes the document *through the DMS* and
person-core *through its owner's API*; it writes only its own income tables
directly. That orchestration-vs-ownership line is what keeps layers clean — and
it's identical whether the fact arrived by a form edit, a doc, or an import.

**Why this is the strongest argument for the L1 service:** person-core CRUD is
not just shared *data*, it's shared *write logic*.
- **Today (Stage 1):** the write logic is **duplicated per app** — cgt has
  "create residency period" (rich period validation); income has "set residency
  status" (coarse enum). Two implementations, two validations, drifting.
- **Stage 2 (L1 service):** the write logic **consolidates** — one "create
  residency period", one validation, one rule set; apps call its API. Even if
  two apps only ever *read* residency, the fact that both currently *write* it
  with divergent validation is the bug the L1 service fixes.

## 10. RESOLVED — the customer-core home (D0.6) = A

Owner-ratified 2026-06-13 (council recommended A; owner picked A):

- **A) Dedicated `sub`-keyed L1 resource service — CHOSEN.** Clean single-writer
  ownership of the residency + identity slices, an API that consolidates the
  divergent write logic (the real D-002/D-003 fix), matching the platform's
  proven shape (gateway + DMS are both standalone `sub`-keyed services).
- B) DMS-adjacent — rejected as the target (acceptable fallback only if a new
  deployable can't be justified; "beside, not inside" the DMS).
- C) Per-app federation — rejected long-term (it is today's fragmentation).

**Trigger (testable):** build the L1 service at the **first of** — (i) income-app
entering a deployment topology (it leaves "out of Stage 1"), or (ii) the first
cross-app *read* of residency in production (a real second consumer of the
slice). Until a trigger fires, Stage 1 stays per-app slices keyed by `sub` —
building L1 now is a deployable for zero consumers with a guessed shape.

## 11. Stage boundaries

- **Stage 1 (now):** gateway (L0) + cgt-app, two DBs (GTM 00_INDEX). Person data
  is per-app slices keyed by `sub`. No consolidated core, no suite DB. cgt-first
  deploy unaffected (gateway + cgt + Postgres).
- **Stage 2:** consolidate L1 customer core (per §10), residency canonical with
  the tracker as writer, DMS-linked. Nothing in Stage 1 blocks it — the stable
  `sub` is the join key from day one (GTM launches fresh, no identity migration).

## 12. Confirmed unchanged

- **Admin/platform role decisions stand** — `gateway_users.role` → token claim is
  exactly the spec's coarse platform role; scoped resource roles are §9-spec/L1,
  deferred.
- **cgt-first deploy unchanged** — gateway + cgt + Postgres; residency stays in
  cgt's slice keyed by `sub`.
- **Step 1 residency work is consistent** — `fetchResidencyTimeline` reads cgt's
  slice keyed by user/`sub`; the typed seam makes the future L1 extraction a
  source-swap, not a rewrite.

## 13. Design rationale (for review)

The reasoning behind each decision, so the council pressure-tests the *why*, not
just the conclusion. Each lists the decision, the rationale, and what was rejected.

1. **Identity authority = gateway, not the suite.**
   *Why:* the security spec names the gateway as the identity/session authority
   and states the suite has no user table by design (D0.5 #2). The stable `sub`
   is minted once at the auth boundary and is the universal join key.
   *Rejected:* suite-owned identity (contradicts spec + Stage-1 topology — there
   is no suite DB); per-app identity (the fragmentation being removed).

2. **Person-core is L1 (resource layer), separate from L0 identity.**
   *Why:* the spec separates resource access from identity (§5). Identity is
   minimal/security-critical (token, revoke-all); the rich person record is
   larger/PII/occasional-read and must not bloat tokens or leak PII into them.
   *Rejected:* rich person facts on the gateway identity (scope creep on a
   security component; PII in tokens).

3. **Not built now; consolidated at Stage 2; home is open (A/B/C).**
   *Why:* boring-by-default / forcing-function — add a deployable when a real
   second consumer needs it. income-app is that consumer (it already stores a
   divergent residency slice), so Stage 2 is justified; the *form* (dedicated vs
   DMS-adjacent vs federation) needs the council + income-app's real needs to
   decide well.
   *Rejected:* building the L1 service now for zero current consumers, with a
   guessed shape; perpetual per-app federation (today's divergence).

4. **Residency timeline canonical; other views derived; reconciliation is lossy-reverse.**
   *Why:* the timeline is the computation-grade shape that every view (CGT
   taxability, SA109 status) derives from — one source, no re-stored copies.
   timeline→enum is derivable; enum→timeline is not, so the core must source the
   rich timeline.
   *Rejected:* storing residency in three shapes (the current bug); canonicalizing
   on income's coarse enum (loses the dates CGT needs).

5. **CRUD logic lives with the owner; apps orchestrate.**
   *Why:* keeps layers clean and makes the L1 service a *write-logic*
   consolidation, not just a data move — one validation for residency/identity
   instead of one per app. Holds across all entry routes (direct edit, doc
   upload, import) — they differ only in how the fact arrives, not in who writes
   it. Direct form edits are the common case; document upload is one route.
   *Rejected:* apps writing person-core tables directly (re-creates divergent
   validation, the very fragmentation L1 fixes).

6. **Invalidation by data-change events, not token revoke-all, for L1.**
   *Why:* same discipline as the gateway role (authoritative, beats TTL) but a
   different channel — domain facts are too big/PII for tokens, and a residency
   change is a data-freshness event, not a security revocation. The shipped
   election→cache-bust is the first instance.
   *Rejected:* putting residency/NINO in tokens; relying on TTL expiry for
   freshness (stale tax numbers survive too long).

## 14. Hardening requirements (design-council, PCORE-1 — binding for Part C)

Gaps the council found under-specified. These are design requirements the L1
build (Stage 2) MUST satisfy; recorded now so they aren't lost.

1. **Cross-owner write consistency / saga (D-002).** The user-facing app owns the
   saga (no owner service orchestrates across peers). Ordering: **durable anchor
   first** — persist the DMS doc, get its id, structured facts carry it as
   provenance. **Idempotency key mandatory per owner write** (retry = no-op).
   **Compensation is reconcile-forward, never delete-back** (deleting another
   owner's row crosses the layer boundary). No fact reported final until its
   slice write confirms — partial state shows "in progress".

2. **Single-writer enforceability for residency (D-003).** Stage 1 has two
   writers. **cgt's `user_residency_periods` is the designated canonical writer;
   income's per-year enum is a non-authoritative local cache** with a
   divergence-reconciliation check. At Stage-2, the L1 service is sole writer;
   income's enum write path is **retired, not bridged** (GTM D8 no-bridge).

3. **Lossy-reverse migration (D-004).** Never fabricate period dates from a
   coarse enum. Tag every residency fact with **`source: rich_timeline |
   coarse_enum_derived`**. **Enrich-on-demand UX** — prompt for period detail
   only when a domain that needs it engages, with a reason, never a blocking
   migration wall, never a silent upgrade.

4. **Invalidation contract (D-005).** At-least-once delivery + idempotent
   consumers, keyed by `sub` + slice + a **monotonic version** (no out-of-order
   stale resurrection). A **bounded written staleness SLA**. Derived figures are
   provisional within the stale window, never **filed** as final until the bust +
   recompute completes. Channel separation reaffirmed (roles → token; L1 →
   data-change event, never token).

5. **FilingContext snapshot staleness (D-006).** The launch-time snapshot carries
   the slice version; a long session must re-read before producing a final/filed
   figure.

**Gate to Part C:** human ratification of §10 (DONE — A) + a Part-C plan that
demonstrably satisfies §14.1–14.5. Confirmed items (the L0/L1 structure) + §14
are the design contract Part C must honor.
