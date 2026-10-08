# Changelog

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
