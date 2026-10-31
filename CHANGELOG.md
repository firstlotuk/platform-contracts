# Changelog

## 0.29.1 — 2026-10-31

- Correct delta-sync fallback guidance; classify Statement of Funds and Currency Rates as unread and explain HMRC monthly conversion.

## 0.29.0 — 2026-10-31

- Add shared FirstLot Flex setup guide content, supported settings and troubleshooting.


## 0.28.0 (2026-10-31)

- Extend the shared IBKR Flex recipe with required Account Information, sections not read separately, and current computed, pass-through and unsupported asset classes.

## 0.27.1 (2026-10-30, integration only)

- Reserve a distinct integration version for the SOURCE-PASSED Income capability reasons; wire schemas and compatibility registry are unchanged.

## 0.27.0 (2026-10-30)

- Type Income's unsupported-year, not-yet-exported and export-not-ready refusals, and the actionable UK-security coupon reconciliation reason. The existing closed classifier and minimized review references remain the wire boundary.

## 0.26.0 (2026-10-30, integration release reconciliation)

- Publish broker-facts wire 1.9.0 with coupon evidence and reset-generation / producer identity binding, plus the sensitive income-cutover action. Use a new minor because D233 already shipped 0.25.0. Producer and consumer deployments must move together.

## 0.25.0 (2026-10-29)

- Add shared platform terms receipt contracts and browser-safe IBKR Flex instructions.

## 0.24.0 (2026-10-29, broker-interest treatment assumption)

- Broker-facts **1.8.0** requires `interestTaxTreatmentAssumption` on every fact. The closed
  `uk_untaxed_no_relief.v1` marker declares proven broker credit interest in full as UK untaxed
  savings when the debtor/source is unknown, explicitly as an assumption. `issuerCountry` stays
  null; no foreign-tax credit, FIG/remittance or foreign-source exclusion follows from the marker.
- The shared grammar rejects missing/unknown and contradictory markers, known countries,
  withholding, relief, nonpositive/withdrawn/legacy facts and security-bearing income. The producer
  must additionally prove the original broker-credit type; bond coupons and dividends are unchanged.
- This is a coordinated lockstep wire bump, not backwards-compatible extra keys. Consumer 1.8.0
  re-reads the historical feed on upgrade; 1.7.0 and 1.8.0 must not be mixed. Published schemas and
  historical packets remain immutable.

## 0.23.0 (2026-10-27, D232 two-year filing contract evidence)

- Tests exercise the existing contribution-pack v2 decoder with matching 2024–25 and
  2025–26 definition/scope identities, all four Income semantics (including AOI12) and
  27 CGT semantics, tri-state values, canonical decimals and cross-year/producer/hash refusals.
  Semantic permissions and normalization remain annual rule-packs policy, not a global wire enum.
  Both the historical 2024–25 definition 1.0.0 and new-workflow successor 1.0.1 are
  exercised without relabeling sealed historical payloads or changing producer scope IDs.
- Published stateless request/result and separate unpinned SA302 schemas are exercised for both
  years, with immutable canonical hash pins and unchanged safe GET/HEAD route purposes.
  These are schema fixtures, not new live engine captures or annual arithmetic approval.
- No runtime exports, generated types or published schema bytes change.
  Existing `cgt.explicitCgt51AdjustmentGbp` carries the caller-stated signed adjustment
  required by the engine-owned 30 October 2024 seam analysis; both-year schema tests cover
  it without inventing disposal dates or automatically deriving an adjustment.
- Publish a new immutable `reviewed-pdf-renderer-build/1.2.0/manifest.json` for Suite's
  annual renderer and mapping sources, digest
  `sha256:6e382e94e1cd3d1308514fb083c874aa4839ceebc904a51b933c9abc54bc1f48`.
  Fonts and the locked dependency closure are unchanged; 1.0.0 and 1.1.0 remain frozen.
  This render-build artifact is not a new wire schema or compatibility approval.

## 0.22.1 (2026-10-26, RX4-O1-S6A)

- Broker-facts feed **1.7.0** requires `incomeCharacter` on every fact. `ordinary` covers legacy,
  interest and other non-stock treatment; `uk_stock_dividend` is restricted to confirmed settlement
  `DIVIDEND` results proven by the live epoch's `scrip.recorded` seal. The shared
  `isBrokerFactIncomeCharacterConsistent` guard rejects missing/unknown and contradictory markers.
  Stock amounts use the recorded cash equivalent and the ITTOIA 2005 s410(6) required-issue date;
  fingerprints bind the determination, confirmation and epoch. Reopen/rebuild withdraws or replaces
  the result through the existing newer-`updatedAt` lifecycle. Producer and consumer must move in
  lockstep; neither 1.6.0 nor 1.7.0 readers accept the other's wire shape.
- Filing contribution schemas **1.0.0 and 2.0.0 remain immutable**. Their semantic IDs use a string
  grammar, not a closed enum, so `income.uk_stock_dividend.aoi12.total` needs no 2.1.0 schema or new
  generated export. The new annual definition `uk-sa/2025-26@1.3.0` and income scope `@1.1.0` own
  AOI12 routing and scale-0 aggregate rounding; old annual manifests still resolve unchanged.

## 0.22.0 (2026-10-25, D210 P3)

- `BROKER_FACT_UNCONFIRMED_REASONS` gains `reconciliation_pending`, `issuer_component_system_pending`,
  `capital_distribution_evidence_pending` and `in_specie_value_pending` (issuer-component classification holds, design
  v12 section 2c.5). Additive; `isBrokerFactUnconfirmedReason` rejects unknown reasons at ingestion, so deploy order is
  contracts -> income-app (and any other consumer) -> cgt-app. Consumers reinstall with `--install-links`.

## 0.21.0 (RX4 step 6, X5a)

- `POOL_COST_ADJUSTMENT` row kind and the pool-adjustment ordering enum (`after_acquisitions_before_disposals` default;
  `at_close_of_date`, ratified in doc49 D.1) in `src/pool-cost-adjustment.ts`, exported from the browser barrel.
  Additive; no existing export changes. Contract text (CGT_ENGINE_INPUT_CONTRACT section 4 row, section 5.2 `s122_4`
  refusal) ratified by the owner 2026-10-20. Consumers (engine, cgt-app) reinstall with `--install-links`.

## 0.20.2 (d188 step 3 fix round)

- `INCOME_BLOCKING_CODES` gains `RESIDENCY_UNRESOLVED`, `RESIDENCE_PAGES_OUTSIDE_SLICE` and `TEMPORARY_NON_RESIDENCE_OUTSIDE_SLICE`
  (income-app 0.11.0 step 0 refusals), each dispositioned `blocked`, so a consumer shows a specific state instead of
  `unknown_child_error`. Additive; no other export changes. Suite follow-up: render these three states.

## 0.20.1 (d188 step 3)

- `RESIDENCY_TAX_YEARS_PATH` is now `/api/internal/residency/years`, the path cgt-app 0.13.1 serves (the internal
  service-to-service route, INGRESS_AND_BFF_TOPOLOGY section 2a D188 exception). No other export changes.

## 0.20.0 (d188, 0.9.x-d188-srt-residency step 1)

- `residency-tax-years` 1.0.0: the per-tax-year UK residency contract (`src/residency-tax-years.ts`, exported from the
  universal/browser barrel): years (status, effective status, revision, `tnr_candidate`, split dates, review reason),
  history declaration, s.1A(3) attestations (own `revision`, `withdrawn` and `retired` kept distinct) and per-issuer
  company-residence ranges (`issuer_revision`). `parseResidencyTaxYears` accepts exactly this version and fails closed.
- `classifyDateResidency` / `classifyDateResidencyDetail`: the one date classifier (resident, non_resident,
  split_uk_part, split_overseas_part, needs_review) with `splitDatesFromSplitDay` (design §4.3 mapping per Case).
- `incomeResidencyScope`: the one income rule (design §5.0), with `issuerCompanyResidenceOn` and `readS1a3Attestation`.
- Auth: purpose `residency.read` (`service_handshake` class, B1 exchange `via` shape, like `broker_facts.read`) and
  PDP action `cgt.residency.read`.
- Fail-closed parser/readers (fix round): `provisional_expired` cannot keep `effective_status = split_year`; `years: []` only
  with the empty-default history and no attestations/issuer rows; a live s.1A(3) attestation in a resident year or UK
  part is refused; `declared_at` must be a string or null; dates are strict `YYYY-MM-DD` (malformed classifies
  `needs_review`, never throws); `readS1a3Attestation` reads `unknown` for a missing/non-boolean flag; an issuer country
  must be an assigned ISO 3166-1 alpha-2 code (else unknown source). Module JSDoc: use `classifyDateResidencyDetail`.
- Additive: no existing export changes. Temporary-non-residence detection (design §7) is NOT here; it stays in cgt-app.
