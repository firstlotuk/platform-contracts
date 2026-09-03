// C46-COMPAT schema coverage.
//
// schemas/stateless-calculation-{request,result}, schemas/pdf-box-mapping, and
// schemas/reviewed-pdf-renderer-build (all 1.0.0) were authored (d619ddb, PR #26) as a
// "proposal only" -- not wired into scripts/generate-contribution-pack.mjs, no generated TS
// types, no exported validator, not yet referenced by the compatibility registry. That is a
// deliberate, documented scope boundary (owner ratification is a separate step) -- but it also
// meant these files had ZERO test coverage: `npm test` stayed green whether the schema files
// held their authored shape or were emptied to `{}`. Found via a Fable+Grok adversarial review
// (2026-09-03).
//
// This file closes that gap WITHOUT crossing the scope boundary the PR drew: it pins the
// schemas' actual current shape (so an accidental edit/deletion fails CI) using a plain Ajv
// compile against the raw JSON on disk, exactly the same library/draft this repo already uses
// for filing-contribution-pack (see filing-contribution-pack-validate.ts). It does not add
// generated types, does not export a validator from src/, and does not touch the compatibility
// registry -- that ratification decision stays with the owner, unchanged.
import fs from 'fs';
import path from 'path';
import Ajv2020 from 'ajv/dist/2020';

function loadSchema(relativePath: string): Record<string, unknown> {
  const file = path.join(__dirname, '..', '..', 'schemas', relativePath);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const requestSchema = loadSchema('stateless-calculation-request/1.0.0/schema.json');
const resultSchema = loadSchema('stateless-calculation-result/1.0.0/schema.json');
const pdfBoxMapping = loadSchema('pdf-box-mapping/1.0.0/mapping.json') as {
  boxes: Array<{ boxId: string; engineInputField: string }>;
};
const rendererManifest = loadSchema('reviewed-pdf-renderer-build/1.0.0/manifest.json') as {
  reviewerSource: string;
  fonts: Record<string, string>;
};

function compile(schema: Record<string, unknown>) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(schema);
}

// Exactly the 12 keys firstlot-suite's ENGINE_INPUT_NAMES (calculation.ts:50-57) constructs and
// tax-calc-engine's StatelessCalculationController.RequiredInputNames requires. Hardcoded (not
// read from the sibling repo -- this repo's own tests never cross-read sibling source, matching
// every other test file here) so a schema edit that silently drops/renames one of these fails
// THIS test, not just an integration test days later.
const ENGINE_INPUT_NAMES = [
  'employmentGbp', 'selfEmploymentProfitGbp', 'otherIncomeGbp', 'ukInterestGbp',
  'foreignInterestGbp', 'ukDividendsGbp', 'foreignDividendsGbp', 'giftAidGbp',
  'pensionContributionGbp', 'payeDeductedGbp', 'foreignTaxCreditGbp', 'taxedUkInterestNetGbp',
] as const;

function validRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const formInputs = Object.fromEntries(ENGINE_INPUT_NAMES.map((name) => [name, 0]));
  return {
    taxYear: '2025-26',
    rateJurisdiction: 'rUK',
    rulesetVersion: 'tax-calc-engine/2025-26@0.9.0',
    formInputs,
    ...overrides,
  };
}

function moneyBucket(bucket: string, taxable: string, rate: number, tax: string) {
  return { bucket, taxable, rate, tax };
}

function validResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    result: {
      totalGrossIncome: '50000.00',
      engine: { name: 'FirstLot.TaxCalcEngine', version: '0.9.0' },
      rateJurisdiction: 'rUK',
      personalAllowance: '12570.00',
      taxableIncome: '37430.00',
      taperApplied: false,
      bands: {
        nonSavings: [moneyBucket('basic', '37430.00', 0.20, '7486.00')],
        savings: [],
        dividends: [],
      },
      nonSavingsTax: '7486.00',
      savingsTax: '0.00',
      dividendTax: '0.00',
      totalIncomeTax: '7486.00',
      payeDeducted: '0.00',
      foreignTaxCredit: '0.00',
      taxDeductedOnSavings: '0.00',
      netIncomeTaxDue: '7486.00',
    },
    warnings: [],
    specials: [],
    exclusions: [],
    engineVersion: '0.9.0',
    rulesetVersion: 'tax-calc-engine/2025-26@0.9.0',
    inputHash: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  };
}

describe('C46-COMPAT stateless-calculation-request schema', () => {
  const validate = compile(requestSchema);

  test('is a compilable draft 2020-12 schema', () => {
    expect(requestSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(typeof validate).toBe('function');
  });

  test('accepts a well-formed request', () => {
    const ok = validate(validRequest());
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  test('accepts every closed rateJurisdiction value', () => {
    for (const rateJurisdiction of ['rUK', 'scottish', 'welsh']) {
      expect(validate(validRequest({ rateJurisdiction }))).toBe(true);
    }
  });

  test.each(['taxYear', 'rateJurisdiction', 'rulesetVersion', 'formInputs'])(
    'rejects a request missing required field %s',
    (field) => {
      const request = validRequest();
      delete request[field];
      expect(validate(request)).toBe(false);
    },
  );

  test('rejects an unknown rateJurisdiction (closed vocabulary)', () => {
    expect(validate(validRequest({ rateJurisdiction: 'england' }))).toBe(false);
  });

  test('rejects a malformed taxYear', () => {
    expect(validate(validRequest({ taxYear: '2025' }))).toBe(false);
    expect(validate(validRequest({ taxYear: '25-26' }))).toBe(false);
  });

  test('rejects an empty rulesetVersion', () => {
    expect(validate(validRequest({ rulesetVersion: '' }))).toBe(false);
  });

  test('rejects any additional top-level property', () => {
    expect(validate(validRequest({ extra: true }))).toBe(false);
  });

  test('rejects any additional formInputs property', () => {
    const request = validRequest();
    (request.formInputs as Record<string, unknown>).unexpectedField = 0;
    expect(validate(request)).toBe(false);
  });

  test.each(ENGINE_INPUT_NAMES)('requires formInputs.%s specifically', (name) => {
    const request = validRequest();
    delete (request.formInputs as Record<string, unknown>)[name];
    expect(validate(request)).toBe(false);
  });

  test('formInputs has exactly the 12 engine input names, in the exact set ENGINE_INPUT_NAMES declares', () => {
    const properties = (requestSchema.$defs as Record<string, { properties: object }>).formInputs.properties;
    expect(Object.keys(properties).sort()).toEqual([...ENGINE_INPUT_NAMES].sort());
    expect(Object.keys(properties)).toHaveLength(12);
  });

  test('rejects a non-numeric form input', () => {
    expect(validate(validRequest({ formInputs: { ...(validRequest().formInputs as object), employmentGbp: '1000' } }))).toBe(false);
  });
});

describe('C46-COMPAT stateless-calculation-result schema', () => {
  const validate = compile(resultSchema);

  test('is a compilable draft 2020-12 schema', () => {
    expect(resultSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(typeof validate).toBe('function');
  });

  test('accepts a well-formed result envelope', () => {
    const ok = validate(validResult());
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  test('accepts welsh but rejects scottish (result-side jurisdiction is a strict subset of the request-side one)', () => {
    const result = validResult();
    (result.result as Record<string, unknown>).rateJurisdiction = 'welsh';
    expect(validate(result)).toBe(true);

    const scottishResult = validResult();
    (scottishResult.result as Record<string, unknown>).rateJurisdiction = 'scottish';
    expect(validate(scottishResult)).toBe(false);
  });

  test.each(['result', 'warnings', 'specials', 'exclusions', 'engineVersion', 'rulesetVersion', 'inputHash'])(
    'rejects an envelope missing required field %s',
    (field) => {
      const result = validResult();
      delete result[field];
      expect(validate(result)).toBe(false);
    },
  );

  test('rejects an inputHash that is not a sha256:<64 hex> string', () => {
    expect(validate(validResult({ inputHash: 'not-a-hash' }))).toBe(false);
    expect(validate(validResult({ inputHash: `sha256:${'g'.repeat(64)}` }))).toBe(false);
    expect(validate(validResult({ inputHash: `sha256:${'a'.repeat(63)}` }))).toBe(false);
  });

  test('rejects a raw number where the wire contract requires a 2dp money string', () => {
    const result = validResult();
    (result.result as Record<string, unknown>).totalGrossIncome = 50000;
    expect(validate(result)).toBe(false);
  });

  test.each(['50000', '50000.0', '50000.000', '-0.00abc'])(
    'rejects a money string not shaped exactly ^-?[0-9]+\\.[0-9]{2}$: %s',
    (bad) => {
      const result = validResult();
      (result.result as Record<string, unknown>).totalGrossIncome = bad;
      expect(validate(result)).toBe(false);
    },
  );

  test('accepts a negative money string (netIncomeTaxDue etc. can legitimately be negative pre-clamp)', () => {
    expect(validate(validResult({ result: { ...validResult().result as object, totalGrossIncome: '-1.23' } }))).toBe(true);
  });

  test('rejects an unknown bucket vocabulary entry', () => {
    const result = validResult();
    (result.result as { bands: { nonSavings: unknown[] } }).bands.nonSavings = [
      moneyBucket('made-up-bucket', '1.00', 0.2, '1.00'),
    ];
    expect(validate(result)).toBe(false);
  });

  test.each(['starter', 'psa', 'allowance', 'basic', 'higher', 'additional'])(
    'accepts every closed bucket vocabulary entry: %s',
    (bucket) => {
      const result = validResult();
      (result.result as { bands: { nonSavings: unknown[] } }).bands.nonSavings = [
        moneyBucket(bucket, '1.00', 0.2, '1.00'),
      ];
      expect(validate(result)).toBe(true);
    },
  );

  test('rejects any additional top-level or nested property', () => {
    expect(validate(validResult({ extra: true }))).toBe(false);
    const result = validResult();
    (result.result as Record<string, unknown>).extra = true;
    expect(validate(result)).toBe(false);
  });

  test('warnings/specials/exclusions accept arbitrary array item shapes (intentionally unconstrained)', () => {
    expect(validate(validResult({ warnings: [{ anything: 'goes' }], specials: [1, 2], exclusions: ['x'] }))).toBe(true);
  });

  test('warnings/specials/exclusions still must be arrays', () => {
    expect(validate(validResult({ warnings: 'not-an-array' }))).toBe(false);
  });
});

describe('C46-COMPAT pdf-box-mapping fixture', () => {
  test('every mapped engine input field is a real field in the request schema (cross-reference, not free text)', () => {
    const formInputNames = new Set(
      Object.keys((requestSchema.$defs as Record<string, { properties: object }>).formInputs.properties),
    );
    for (const box of pdfBoxMapping.boxes) {
      expect(formInputNames.has(box.engineInputField)).toBe(true);
    }
  });

  test('carries the 5 known INC boxes with the exact box ids the mapping was derived from', () => {
    const boxIds = pdfBoxMapping.boxes.map((b) => b.boxId).sort();
    expect(boxIds).toEqual(['INC1', 'INC2', 'INC3', 'INC4', 'INC5']);
  });

  test('carries source provenance (not an anonymous drop)', () => {
    expect(pdfBoxMapping).toMatchObject({
      formCode: 'SA100',
      sourceRepo: 'firstlot-suite',
      sourceSymbol: 'BOX_TO_ENGINE_INPUT',
    });
    expect(typeof (pdfBoxMapping as unknown as { sourceCommit: string }).sourceCommit).toBe('string');
    expect((pdfBoxMapping as unknown as { sourceCommit: string }).sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('C46-COMPAT reviewed-pdf-renderer-build fixture', () => {
  test('reviewerSource and every font pin are sha256:<64 hex>', () => {
    const shaPattern = /^sha256:[0-9a-f]{64}$/;
    expect(rendererManifest.reviewerSource).toMatch(shaPattern);
    expect(Object.keys(rendererManifest.fonts).length).toBeGreaterThan(0);
    for (const hash of Object.values(rendererManifest.fonts)) {
      expect(hash).toMatch(shaPattern);
    }
  });

  test('pins the two known font files this manifest was authored against', () => {
    expect(Object.keys(rendererManifest.fonts).sort()).toEqual(['NotoSans-Regular.ttf', 'NotoSansSC-Regular.otf']);
  });
});
