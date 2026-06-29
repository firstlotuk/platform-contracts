/**
 * Stage 0 / D-004 — contract-shape gate.
 *
 * Every fixture under `fixtures/headroom/` MUST validate against the Headroom
 * contract shape, so a fixture that drifts from `headroom.ts` fails CI. The
 * structural validators below are written as `asserts x is T`, so they are also
 * compile-time bound to the exported interfaces — if a check contradicts the
 * interface, ts-jest fails to compile this file.
 */

import fs from 'fs';
import path from 'path';
import type {
  HeadroomBaselineInput,
  HeadroomScenarioInput,
  HeadroomResult,
  HeadroomTrace,
  BandMovement,
} from '../headroom';
import { TAX_YEAR_PATTERN } from '../headroom';

const FIXTURES_ROOT = path.join(__dirname, '..', '..', 'fixtures', 'headroom');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertDecimalString(v: unknown, where: string): asserts v is string {
  if (typeof v !== 'string') {
    throw new Error(`${where}: expected DecimalString (string), got ${typeof v}: ${JSON.stringify(v)}`);
  }
  // Wire money/quantity is a string; reject JSON numbers explicitly.
  if (v.trim() === '' || Number.isNaN(Number(v))) {
    throw new Error(`${where}: DecimalString "${v}" is not a parseable decimal`);
  }
}

function assertTaxYear(v: unknown, where: string): asserts v is string {
  if (typeof v !== 'string' || !TAX_YEAR_PATTERN.test(v)) {
    throw new Error(`${where}: expected canonical YYYY-YY TaxYear, got ${JSON.stringify(v)}`);
  }
}

function assertBaselineInput(v: unknown, where: string): asserts v is HeadroomBaselineInput {
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  assertTaxYear(v.taxYear, `${where}.taxYear`);
  for (const k of [
    'employmentIncome',
    'selfEmploymentProfit',
    'otherNonSavingsIncome',
    'ukInterest',
    'foreignInterest',
    'ukDividends',
    'foreignDividends',
    'existingGiftAidPaid',
    'existingPersonalPensionPaid',
  ] as const) {
    assertDecimalString(v[k], `${where}.${k}`);
  }
}

function assertScenarioInput(v: unknown, where: string): asserts v is HeadroomScenarioInput {
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  assertBaselineInput(v.baseline, `${where}.baseline`);
  assertDecimalString(v.additionalPersonalPensionContribution, `${where}.additionalPersonalPensionContribution`);
}

const BANDS = new Set([
  'personalAllowance',
  'basicRate',
  'higherRate',
  'additionalRate',
  'dividendAllowance',
  'savingsPSA',
]);

function assertBandMovement(v: unknown, where: string): asserts v is BandMovement {
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  if (typeof v.band !== 'string' || !BANDS.has(v.band)) {
    throw new Error(`${where}.band: invalid HeadroomBand ${JSON.stringify(v.band)}`);
  }
  for (const k of ['rate', 'amountBefore', 'amountAfter', 'taxBefore', 'taxAfter'] as const) {
    assertDecimalString(v[k], `${where}.${k}`);
  }
}

function assertTrace(v: unknown, where: string): asserts v is HeadroomTrace {
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  assertTaxYear(v.taxYear, `${where}.taxYear`);
  if (typeof v.rulesetVersion !== 'string') throw new Error(`${where}.rulesetVersion: not a string`);
  for (const k of [
    'taperThreshold',
    'paZeroPoint',
    'adjustedNetIncomeBefore',
    'adjustedNetIncomeAfter',
    'personalAllowanceBefore',
    'personalAllowanceAfter',
  ] as const) {
    assertDecimalString(v[k], `${where}.${k}`);
  }
  if (!Array.isArray(v.bandMovements)) throw new Error(`${where}.bandMovements: not an array`);
  v.bandMovements.forEach((m, i) => assertBandMovement(m, `${where}.bandMovements[${i}]`));
  if (v.notes !== undefined) {
    if (!Array.isArray(v.notes) || v.notes.some((n) => typeof n !== 'string')) {
      throw new Error(`${where}.notes: expected string[]`);
    }
  }
}

function assertResult(v: unknown, where: string): asserts v is HeadroomResult {
  if (!isObj(v)) throw new Error(`${where}: not an object`);
  assertTaxYear(v.taxYear, `${where}.taxYear`);
  if (typeof v.rulesetVersion !== 'string') throw new Error(`${where}.rulesetVersion: not a string`);
  for (const k of [
    'adjustedNetIncomeBefore',
    'adjustedNetIncomeAfter',
    'personalAllowanceBefore',
    'personalAllowanceAfter',
    'incomeTaxBefore',
    'incomeTaxAfter',
    'taxSaved',
    'contributionGrossedUp',
  ] as const) {
    assertDecimalString(v[k], `${where}.${k}`);
  }
  // Zero-contribution result contract: effectiveReliefRate is DecimalString | null.
  if (v.effectiveReliefRate !== null) {
    assertDecimalString(v.effectiveReliefRate, `${where}.effectiveReliefRate`);
  }
  assertTrace(v.trace, `${where}.trace`);
}

describe('headroom contract fixtures (D-004 contract-shape gate)', () => {
  const vectorFiles = listJson(path.join(FIXTURES_ROOT, 'vectors'));
  const resultFiles = listJson(path.join(FIXTURES_ROOT, 'result'));

  test('at least one vector and one result fixture exist', () => {
    expect(vectorFiles.length).toBeGreaterThan(0);
    expect(resultFiles.length).toBeGreaterThan(0);
  });

  test.each(vectorFiles)('vector fixture %s satisfies HeadroomScenarioInput', (file) => {
    const fixture = readJson(file) as Record<string, unknown>;
    assertScenarioInput(fixture.scenario, `${path.basename(file)}.scenario`);
    // expected is a partial of HeadroomResult scalar fields (compute target).
    expect(isObj(fixture.expected)).toBe(true);
  });

  test('baseline-identity vector pins the zero-contribution contract (effectiveReliefRate: null)', () => {
    const file = vectorFiles.find((f) => path.basename(f) === 'baseline-identity.json');
    expect(file).toBeDefined();
    const fixture = readJson(file!) as { scenario: { additionalPersonalPensionContribution: string }; expected: Record<string, unknown> };
    expect(fixture.scenario.additionalPersonalPensionContribution).toBe('0');
    expect(fixture.expected.effectiveReliefRate).toBeNull();
  });

  test.each(resultFiles)('result fixture %s satisfies HeadroomResult', (file) => {
    const fixture = readJson(file);
    assertResult(fixture, path.basename(file));
  });
});
