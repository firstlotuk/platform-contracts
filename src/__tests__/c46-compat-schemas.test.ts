// C46-COMPAT schema coverage.
//
// schemas/stateless-calculation-{request,result}, schemas/pdf-box-mapping, and
// schemas/reviewed-pdf-renderer-build (all 1.0.0) were authored (d619ddb, PR #26) as a
// "proposal only" -- not wired into scripts/generate-contribution-pack.mjs, no generated TS
// types, no exported validator. That is a deliberate, documented scope boundary (owner
// ratification is a separate step) -- but it also meant these files had ZERO test coverage:
// `npm test` stayed green whether the schema files held their authored shape or were emptied
// to `{}`. Found via a Fable+Grok adversarial review (2026-09-03).
//
// This file closes that gap WITHOUT crossing the scope boundary the PR drew: it pins the
// schemas' actual current shape (so an accidental edit/deletion fails CI) using a plain Ajv
// compile against the raw JSON on disk, exactly the same library/draft this repo already uses
// for filing-contribution-pack (see filing-contribution-pack-validate.ts). It does not add
// generated types, does not export a validator from src/, and does not touch the compatibility
// registry -- that ratification decision stays with the owner, unchanged.
//
// 2026-09-04 (schema versioning, PR #35 corrected -- see #36): stateless-calculation-{request,
// result} ARE referenced by a RATIFIED compatibility manifest (rule-packs
// uk-sa/2025-26/1.0.0/compatibility-manifests.json, resolutionPolicy exact_id_and_hash_only,
// engineImplementation.{request,result}SchemaHash) -- the "not yet referenced" language above
// was true for pdf-box-mapping/reviewed-pdf-renderer-build but WRONG for these two, and an
// earlier commit on this PR edited the 1.0.0 files in place, silently invalidating that
// ratified hash. Reverted: 1.0.0 is FROZEN (both `frozen1_0_0*` describe blocks below pin its
// exact original shape, including the pre-widening bucket/rateJurisdiction enums, so an
// accidental in-place edit fails CI). The Scottish-inclusive widening lives at 1.1.0 instead
// -- a new version directory, not a mutation -- exactly the discipline `resolutionPolicy:
// exact_id_and_hash_only` exists to enforce. 1.1.0 is not yet referenced by any ratified
// manifest entry; that ratification is a separate, later step, same as 1.0.0's was.
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { canonicalize } from 'json-canonicalize';
import Ajv2020 from 'ajv/dist/2020';

function loadSchema(relativePath: string): Record<string, unknown> {
  const file = path.join(__dirname, '..', '..', 'schemas', relativePath);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function canonicalSha256(schema: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(canonicalize(schema), 'utf8').digest('hex')}`;
}

const requestSchemaV1 = loadSchema('stateless-calculation-request/1.0.0/schema.json');
const resultSchemaV1 = loadSchema('stateless-calculation-result/1.0.0/schema.json');
const requestSchemaV1_1 = loadSchema('stateless-calculation-request/1.1.0/schema.json');
const resultSchemaV1_1 = loadSchema('stateless-calculation-result/1.1.0/schema.json');
const resultSchemaV1_2 = loadSchema('stateless-calculation-result/1.2.0/schema.json');
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
    rulesetVersion: 'tax-calc-engine/2025-26@0.9.5',
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
      engine: { name: 'FirstLot.TaxCalcEngine', version: '0.9.5' },
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
    engineVersion: '0.9.5',
    rulesetVersion: 'tax-calc-engine/2025-26@0.9.5',
    inputHash: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  };
}

describe('C46-COMPAT stateless-calculation-request schema 1.0.0 (frozen -- ratified compatibility-manifest hash)', () => {
  const validate = compile(requestSchemaV1);

  test('canonical hash exactly matches the ratified compatibility manifest (rule-packs uk-sa/2025-26@1.0.0, engineImplementation.requestSchemaHash) -- an in-place edit here breaks a live ratified contract; cut 1.1.0 instead', () => {
    expect(canonicalSha256(requestSchemaV1)).toBe(
      'sha256:7ea25b7bd4d88ad1cb332c6d4e8f621a3b10ca3faba14744b6cb05becfdfb6e5',
    );
  });

  test('is a compilable draft 2020-12 schema', () => {
    expect(requestSchemaV1.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
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
    const properties = (requestSchemaV1.$defs as Record<string, { properties: object }>).formInputs.properties;
    expect(Object.keys(properties).sort()).toEqual([...ENGINE_INPUT_NAMES].sort());
    expect(Object.keys(properties)).toHaveLength(12);
  });

  test('rejects a non-numeric form input', () => {
    expect(validate(validRequest({ formInputs: { ...(validRequest().formInputs as object), employmentGbp: '1000' } }))).toBe(false);
  });
});

describe('C46-COMPAT stateless-calculation-request schema 1.1.0 (widened, not yet ratified)', () => {
  const validate = compile(requestSchemaV1_1);

  test('is a compilable draft 2020-12 schema', () => {
    expect(requestSchemaV1_1.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(typeof validate).toBe('function');
  });

  test('accepts scottish (unchanged from 1.0.0 -- only the description was stale, no enum change)', () => {
    expect(validate(validRequest({ rateJurisdiction: 'scottish' }))).toBe(true);
  });

  test('still has exactly the 12 engine input names -- widening did not touch formInputs', () => {
    const properties = (requestSchemaV1_1.$defs as Record<string, { properties: object }>).formInputs.properties;
    expect(Object.keys(properties).sort()).toEqual([...ENGINE_INPUT_NAMES].sort());
  });
});

describe('C46-COMPAT stateless-calculation-result schema 1.0.0 (frozen -- ratified compatibility-manifest hash)', () => {
  const validate = compile(resultSchemaV1);

  test('canonical hash exactly matches the ratified compatibility manifest (rule-packs uk-sa/2025-26@1.0.0, engineImplementation.resultSchemaHash) -- an in-place edit here breaks a live ratified contract; cut 1.1.0 instead', () => {
    expect(canonicalSha256(resultSchemaV1)).toBe(
      'sha256:99542aa515bba44c9efcde34a2ccd6ed9f95db0ec60c01c8b929348fba833c25',
    );
  });

  test('is a compilable draft 2020-12 schema', () => {
    expect(resultSchemaV1.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
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

describe('C46-COMPAT stateless-calculation-result schema 1.1.0 (widened, not yet ratified)', () => {
  const validate = compile(resultSchemaV1_1);

  test('is a compilable draft 2020-12 schema', () => {
    expect(resultSchemaV1_1.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(typeof validate).toBe('function');
  });

  test('accepts a well-formed result envelope (rUK, unchanged)', () => {
    expect(validate(validResult())).toBe(true);
  });

  test('accepts scottish, with a real six-band non-savings shape (mirrors ScottishIncomeTaxTests.cs\'s own 2024-25 employment-£20,000 case)', () => {
    const result = validResult();
    (result.result as Record<string, unknown>).rateJurisdiction = 'scottish';
    (result.result as Record<string, unknown>).bands = {
      nonSavings: [
        moneyBucket('starter', '2306.00', 0.19, '438.14'),
        moneyBucket('basic', '5124.00', 0.20, '1024.80'),
        moneyBucket('intermediate', '0.00', 0.21, '0.00'),
        moneyBucket('higher', '0.00', 0.42, '0.00'),
        moneyBucket('advanced', '0.00', 0.45, '0.00'),
        moneyBucket('top', '0.00', 0.48, '0.00'),
      ],
      savings: [],
      dividends: [],
    };
    expect(validate(result)).toBe(true);
  });

  test('rejects an unrecognised rateJurisdiction', () => {
    const result = validResult();
    (result.result as Record<string, unknown>).rateJurisdiction = 'england'; // not a real value
    expect(validate(result)).toBe(false);
  });

  test('rejects an unrecognised bucket name', () => {
    const result = validResult();
    (result.result as { bands: { nonSavings: unknown[] } }).bands.nonSavings = [
      moneyBucket('nonsense', '100.00', 0.2, '20.00'),
    ];
    expect(validate(result)).toBe(false);
  });

  test.each(['starter', 'psa', 'allowance', 'basic', 'higher', 'additional', 'intermediate', 'advanced', 'top'])(
    'accepts every closed bucket vocabulary entry, including the Scottish-only ones: %s',
    (bucket) => {
      const result = validResult();
      (result.result as { bands: { nonSavings: unknown[] } }).bands.nonSavings = [
        moneyBucket(bucket, '1.00', 0.2, '1.00'),
      ];
      expect(validate(result)).toBe(true);
    },
  );
});

describe('C46-COMPAT pdf-box-mapping fixture', () => {
  test('every mapped engine input field is a real field in the request schema (cross-reference, not free text)', () => {
    const formInputNames = new Set(
      Object.keys((requestSchemaV1.$defs as Record<string, { properties: object }>).formInputs.properties),
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

// D-132: stateless-calculation-result 1.1.0.
//
// 1.0.0 described a two-jurisdiction engine emitting 15 result properties. The engine emits 28 and
// has computed Scottish since d074, so the ratified contract was being breached in production —
// found when the engine first validated its own responses against this schema, which nothing had
// ever done. 1.0.0 stays FROZEN for consumers pinned to it; 1.1.0 is a pure RELAXATION, so every
// document valid under 1.0.0 is valid under 1.1.0. These tests pin that property rather than
// trusting it.
describe('D-132 stateless-calculation-result 1.1.0', () => {
  const validate = compile(resultSchemaV1_1);
  const validateV10 = compile(resultSchemaV1);

  test('is a compilable draft 2020-12 schema', () => {
    expect(resultSchemaV1_1.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(typeof validate).toBe('function');
  });

  test('is a RELAXATION: everything 1.0.0 accepts, 1.1.0 accepts', () => {
    const base = validResult();
    expect(validateV10(base)).toBe(true);
    expect(validate(base)).toBe(true);

    const welsh = validResult();
    (welsh.result as Record<string, unknown>).rateJurisdiction = 'welsh';
    expect(validateV10(welsh)).toBe(true);
    expect(validate(welsh)).toBe(true);
  });

  test('admits scottish, which d074 made a real computation', () => {
    const scottish = validResult();
    (scottish.result as Record<string, unknown>).rateJurisdiction = 'scottish';
    expect(validateV10(scottish)).toBe(false); // 1.0.0 said scottish could never appear
    expect(validate(scottish)).toBe(true);
  });

  test('admits the Scottish six-band non-savings buckets', () => {
    for (const bucket of ['intermediate', 'advanced', 'top']) {
      const result = validResult();
      const bands = (result.result as Record<string, unknown>).bands as Record<string, unknown>;
      bands.nonSavings = [{ bucket, taxable: '1000.00', rate: 0.21, tax: '210.00' }];
      expect(validateV10(result)).toBe(false);
      expect(validate(result)).toBe(true);
    }
  });

  test.each([
    'marriageAllowanceRelief', 'lloydsUnderwritingTaxPaid', 'propertyFinanceCostsRelief',
    'partnershipTaxPaid', 'childBenefitCharge', 'otherIncomeTaxPaid',
    'ageRelatedMarriedCouplesAllowanceRelief', 'propertyIncomeTaxPaid', 'selfEmploymentTaxPaid',
    'foreignTaxDeducted', 'giftAidBasicRateRelief', 'statePensionLumpSumCharge',
    'winterFuelPaymentCharge',
  ])('permits the additive provenance field %s that 1.0.0 forbade', (field) => {
    const result = validResult();
    (result.result as Record<string, unknown>)[field] = '12.34';
    expect(validateV10(result)).toBe(false);
    expect(validate(result)).toBe(true);
  });

  test('the additive fields stay OPTIONAL — a 1.0.0-era producer is still valid', () => {
    expect(validate(validResult())).toBe(true);
  });

  test('additive fields are still 2dp money strings, not free-form', () => {
    const result = validResult();
    (result.result as Record<string, unknown>).childBenefitCharge = 1106;
    expect(validate(result)).toBe(false);
  });

  test('still closed: an unknown result property is rejected', () => {
    const result = validResult();
    (result.result as Record<string, unknown>).somethingInvented = '1.00';
    expect(validate(result)).toBe(false);
  });

  test('required set is unchanged from 1.0.0', () => {
    const req = (schema: Record<string, unknown>) =>
      ((schema.$defs as Record<string, Record<string, unknown>>).incomeTaxResult.required as string[]);
    expect(req(resultSchemaV1_1)).toEqual(req(resultSchemaV1));
  });
});

// ---------------------------------------------------------------------------
// D-132 item0 / R5 — the third state.
//
// 1.0.0 and 1.1.0 REQUIRE `exclusions` and `specials` as arrays, and the engine has
// never evaluated either registry. So every response has said `[]`, and on a filing
// surface `[]` reads as "the registry was checked and nothing applied" — a completeness
// claim nobody has ever made good on. 1.2.0 adds the flag that separates "none apply"
// from "not assessed".
// ---------------------------------------------------------------------------
describe('stateless-calculation-result 1.2.0 — exclusions/specials evaluated flags', () => {
  const validate = compile(resultSchemaV1_2);

  // Reuse the file's own canonical fixture rather than hand-rolling one — a fixture invented for
  // this test would prove the test's shape, not the schema's.
  const base = () => validResult();

  // The flags are OPTIONAL, following 1.1.0's precedent — the live producer does not emit them yet
  // and doing so is its own decision, so requiring them would publish a version nobody can satisfy.
  // What changes is that the THIRD STATE is now expressible, and absence has a defined meaning.
  test('a 1.1-shaped result stays valid — the flags are additive, not a breaking change', () => {
    expect(validate(base())).toBe(true);
  });

  test('the flags are booleans, not free text — "unknown" cannot be smuggled through as a string', () => {
    expect(validate({ ...base(), exclusionsEvaluated: 'unknown' })).toBe(false);
  });

  test('empty arrays with evaluated:false are valid — "not assessed", stated', () => {
    expect(validate({ ...base(), exclusionsEvaluated: false, specialsEvaluated: false })).toBe(true);
  });

  test('empty arrays with evaluated:true are valid — "none apply", and now a claim someone made deliberately', () => {
    expect(validate({ ...base(), exclusionsEvaluated: true, specialsEvaluated: true })).toBe(true);
  });

  test('1.1.0 stays untouched, so a ratified consumer is unaffected', () => {
    const v11 = compile(resultSchemaV1_1);
    expect(v11(base())).toBe(true);
  });
});
