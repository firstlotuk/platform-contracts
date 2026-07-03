/**
 * Headroom Engine V1 — contract seam (D-014 ARCH-1, Stage 0 / D-004 … D-006).
 *
 * This is the stable cross-package seam between the *transitional* income-tax
 * compute owner (income-app today) and the long-term owner
 * (`tax-calc-engine` post-Phase-6). It is pinned to the field level so both
 * producers interpret the same payload identically — that is what makes the
 * A-prime swap clean.
 *
 * Wire rules (pinned):
 *  - Every money / quantity wire field is a `DecimalString` — a string, never a
 *    JSON number. Decimal precision is the engine's concern post-Phase-6; the
 *    boundary is decimal-string regardless of the producer's internal arithmetic.
 *  - `TaxYear` is canonical `YYYY-YY` (hyphen). The product's `YYYY/YY` slash is
 *    presentation-only (D-005).
 *  - Baseline inputs carry GROSS income components only. PA, taxable income, and
 *    every post-allowance figure are DERIVED and live only in `HeadroomResult`.
 *  - Pension / Gift-Aid contribution fields carry the NET cash the taxpayer paid
 *    (out of pocket). Grossing-up (×100/80 for basic-rate RAS / Gift Aid) happens
 *    ONCE, inside the compute, never at this boundary.
 */

// ---------------------------------------------------------------------------
// Wire primitives
// ---------------------------------------------------------------------------

declare const decimalStringBrand: unique symbol;
/**
 * Branded wire primitive: a decimal money/quantity value serialised as a string.
 * No JSON numbers cross the Headroom boundary. Construct via {@link asDecimal}.
 */
export type DecimalString = string & { readonly [decimalStringBrand]: 'DecimalString' };

/** Narrow a raw string to the `DecimalString` wire type. */
export const asDecimal = (s: string): DecimalString => s as DecimalString;

declare const taxYearBrand: unique symbol;
/** Canonical tax-year wire form, `YYYY-YY` (hyphen). Slash form is presentation-only. */
export type TaxYear = string & { readonly [taxYearBrand]: 'TaxYear' };

/** Canonical `YYYY-YY` matcher (e.g. `2024-25`). */
export const TAX_YEAR_PATTERN = /^\d{4}-\d{2}$/;

/** True iff `s` is a canonical `YYYY-YY` tax year. */
export const isTaxYear = (s: string): s is TaxYear => TAX_YEAR_PATTERN.test(s);

/** Narrow a raw string to the `TaxYear` wire type (throws on bad format). */
export const asTaxYear = (s: string): TaxYear => {
  if (!isTaxYear(s)) {
    throw new Error(`Invalid tax year "${s}". Expected canonical YYYY-YY (e.g. 2024-25).`);
  }
  return s as TaxYear;
};

// ---------------------------------------------------------------------------
// Inputs — gross-in, derived-out
// ---------------------------------------------------------------------------

/**
 * Gross income inputs the ANI + taper run off. Carries NO post-allowance figure
 * (PA / taxable income are derived → `HeadroomResult`). Field list mirrors
 * income-app `IncomeInputs` minus credits.
 */
export interface HeadroomBaselineInput {
  taxYear: TaxYear;
  // Gross income components (pre-allowance).
  employmentIncome: DecimalString;
  selfEmploymentProfit: DecimalString;
  otherNonSavingsIncome: DecimalString;
  ukInterest: DecimalString;
  foreignInterest: DecimalString;
  ukDividends: DecimalString;
  foreignDividends: DecimalString;
  // Reliefs already in place THIS year — NET cash paid (gross-up happens in compute).
  existingGiftAidPaid: DecimalString;
  existingPersonalPensionPaid: DecimalString; // relief-at-source (RAS), net cash
}

/** Baseline + one mechanical counterfactual (the single V1 lever). */
export interface HeadroomScenarioInput {
  baseline: HeadroomBaselineInput;
  /** Additional personal pension contribution — RAS, NET cash paid. */
  additionalPersonalPensionContribution: DecimalString;
}

// ---------------------------------------------------------------------------
// Trace — factual "show the working" (no advice / recommendation)
// ---------------------------------------------------------------------------

export type HeadroomBand =
  | 'personalAllowance'
  | 'basicRate'
  | 'higherRate'
  | 'additionalRate'
  | 'dividendAllowance'
  | 'savingsPSA';

export interface BandMovement {
  band: HeadroomBand;
  /** Band rate applied, as a decimal fraction. Allowance bands report `"0"`. */
  rate: DecimalString;
  amountBefore: DecimalString; // income taxed in this band before the contribution
  amountAfter: DecimalString;  // …after
  taxBefore: DecimalString;
  taxAfter: DecimalString;
}

export interface HeadroomTrace {
  taxYear: TaxYear;
  rulesetVersion: string;
  taperThreshold: DecimalString; // £100k taper start (from YAML; fail-loud if missing)
  paZeroPoint: DecimalString;    // PA-fully-tapered point (£125,140-equiv), from YAML
  adjustedNetIncomeBefore: DecimalString;
  adjustedNetIncomeAfter: DecimalString;
  personalAllowanceBefore: DecimalString;
  personalAllowanceAfter: DecimalString;
  bandMovements: BandMovement[];
  notes?: string[]; // human-readable factual annotations
}

// ---------------------------------------------------------------------------
// Result — derived position, before/after, all DecimalString
// ---------------------------------------------------------------------------

export interface HeadroomResult {
  taxYear: TaxYear;
  rulesetVersion: string; // content-addressed provenance (D-006)
  adjustedNetIncomeBefore: DecimalString;
  adjustedNetIncomeAfter: DecimalString;
  personalAllowanceBefore: DecimalString;
  personalAllowanceAfter: DecimalString;
  incomeTaxBefore: DecimalString;
  incomeTaxAfter: DecimalString;
  taxSaved: DecimalString; // incomeTaxBefore − incomeTaxAfter
  contributionGrossedUp: DecimalString; // lever × 100/80 (shown for transparency)
  /**
   * taxSaved ÷ NET contribution paid, as a decimal fraction (e.g. "0.45").
   * `null` ⇔ `additionalPersonalPensionContribution` is "0": no contribution, so
   * a relief *rate* does not exist. Deliberately NOT "0" (which would falsely read
   * as "you contributed and received 0% relief").
   */
  effectiveReliefRate: DecimalString | null;
  trace: HeadroomTrace;
}

// ---------------------------------------------------------------------------
// Planner 2 — Pay & take-home (d025). ADDITIVE types only: `HeadroomScenarioInput`
// stays pinned to exactly one RAS lever and planner-1 vectors consume it
// byte-for-byte. Planner 2 reuses `HeadroomBaselineInput` (the shared-baseline
// principle) and every pinned wire rule (DecimalString, YYYY-YY,
// gross-in/derived-out). The contract carries ANNUAL figures only — monthly is
// presentation (÷ 12), always rendered with the annual-method disclosure.
// ---------------------------------------------------------------------------

/** Planner 2 scenario: shared baseline + the salary-sacrifice lever.
 *  NOT relief-at-source: `salarySacrificeAnnual` is the annual GROSS salary given up;
 *  the FULL amount goes to the employer pension; NO ×100/80 gross-up anywhere. */
export interface HeadroomTakeHomeScenarioInput {
  baseline: HeadroomBaselineInput;
  salarySacrificeAnnual: DecimalString;   // 0 ≤ value ≤ baseline.employmentIncome
}

export type HeadroomNicBand = 'mainBand' | 'aboveUpperEarningsLimit';

/** Employee Class-1 per-band movement — the NIC analogue of `BandMovement`. */
export interface HeadroomNicBandMovement {
  band: HeadroomNicBand;
  rate: DecimalString;
  earningsBefore: DecimalString;
  earningsAfter: DecimalString;
  nicBefore: DecimalString;
  nicAfter: DecimalString;
}

export interface HeadroomTakeHomeResult {
  taxYear: TaxYear;
  rulesetVersion: string;
  // The lever, restated as fact
  salarySacrificed: DecimalString;
  pensionIn: DecimalString;               // == salarySacrificed (SS is not RAS)
  employmentIncomeBefore: DecimalString;
  employmentIncomeAfter: DecimalString;   // before − sacrificed
  // Derived — ANNUAL figures only (monthly is presentation)
  employeeNicBefore: DecimalString;
  employeeNicAfter: DecimalString;
  incomeTaxBefore: DecimalString;         // whole-baseline income tax (total-position basis, D-005)
  incomeTaxAfter: DecimalString;
  adjustedNetIncomeBefore: DecimalString;
  adjustedNetIncomeAfter: DecimalString;
  personalAllowanceBefore: DecimalString;
  personalAllowanceAfter: DecimalString;
  takeHomeAnnualBefore: DecimalString;
  takeHomeAnnualAfter: DecimalString;
  /** CONTEXT ONLY (build-goal §3.3): never added to the user's benefit. */
  employerNicBefore: DecimalString;
  employerNicAfter: DecimalString;
  employerNicSaving: DecimalString;
  // Show-the-working
  nicBandMovements: HeadroomNicBandMovement[];
  incomeTaxTrace: HeadroomTrace;          // reuse the existing income-tax vocabulary
  notes?: string[];
}
