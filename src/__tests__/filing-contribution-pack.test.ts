import type { FilingContributionPackEnvelope, PackPayload } from '..';
import {
  FILING_CONTRIBUTION_PACK_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_SCHEMA_ID,
  assertFilingContributionPack,
  canonicalizeContributionJson,
  computeContributionPayloadHash,
  isCanonicalDecimalAtScale,
  sha256CanonicalJson,
  validateFilingContributionPack,
} from '..';

const HASH_A = `sha256:${'a'.repeat(64)}` as const;
const HASH_B = `sha256:${'b'.repeat(64)}` as const;
const GENERATED_AT = '2026-08-03T19:00:00Z';

function payload(overrides: Partial<PackPayload> = {}): PackPayload {
  return {
    contract: {
      schemaId: FILING_CONTRIBUTION_PACK_SCHEMA_ID,
      schemaVersion: '1.0.0',
      schemaHash: FILING_CONTRIBUTION_PACK_SCHEMA_HASH,
    },
    producer: 'income-app',
    taxYear: '2025-26',
    formDefinitionSetId: 'uk-sa/2025-26@1.0.0',
    permittedScopeId: 'uk-sa/2025-26/income@1.0.0',
    readiness: { state: 'ready', reviewSignals: [] },
    values: [{
      semanticId: 'income.uk_interest.untaxed.total',
      value: { state: 'value', value: '123' },
      provenance: { sourceRevisionHash: HASH_A, normalizationRuleId: 'hmrc.stage1-3.per-source-pound-down@1' },
    }],
    producerProvenance: {
      producerBuild: { moduleVersion: '0.6.9', buildDigest: HASH_B },
      rulesets: [{ id: 'uk-sa/2025-26@1.0.0', hash: HASH_B }],
      engine: null,
      sourceRevisionHash: HASH_A,
    },
    ...overrides,
  };
}

function pack(payloadOverrides: Partial<PackPayload> = {}): FilingContributionPackEnvelope {
  const packPayload = payload(payloadOverrides);
  return {
    packId: '01J00000000000000000000000',
    version: 1,
    generatedAt: GENERATED_AT,
    packPayload,
    contentHash: computeContributionPayloadHash(packPayload),
  };
}

function errorCodes(input: unknown): string[] {
  const result = validateFilingContributionPack(input);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe('D049 filing contribution pack contract', () => {
  test('the generated type and runtime schema accept the same closed ready envelope', () => {
    expect(validateFilingContributionPack(pack())).toEqual({ ok: true, value: pack() });
  });

  test('RFC 8785 hashing is key-order invariant and payload-sensitive', () => {
    expect(sha256CanonicalJson({ b: 2, a: 1 })).toBe(sha256CanonicalJson({ a: 1, b: 2 }));
    expect(sha256CanonicalJson({ a: 1, b: 2 })).toBe(
      'sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    );
    expect(sha256CanonicalJson({ a: 1 })).not.toBe(sha256CanonicalJson({ a: 2 }));
  });

  test.each([
    ['non-finite number', { value: Number.POSITIVE_INFINITY }],
    ['undefined property', { value: undefined }],
    ['bigint', { value: BigInt(1) }],
  ])('rejects non-I-JSON canonicalization input: %s', (_label, value) => {
    expect(() => sha256CanonicalJson(value)).toThrow(TypeError);
  });

  test('rejects circular I-JSON and impossible decimal scales', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => canonicalizeContributionJson(circular)).toThrow('circular');
    expect(isCanonicalDecimalAtScale('1', -1)).toBe(false);
    expect(isCanonicalDecimalAtScale('1', 19)).toBe(false);
    expect(isCanonicalDecimalAtScale('1', 1.5)).toBe(false);
  });

  test.each([
    ['0', 0, true],
    ['123', 0, true],
    ['0.00', 2, true],
    ['-12.30', 2, true],
    ['-0', 0, false],
    ['-0.00', 2, false],
    ['01', 0, false],
    ['1.2', 2, false],
    ['1e2', 0, false],
    ['+1', 0, false],
    ['1,000', 0, false],
  ])('validates canonical decimal %s at scale %i', (value, scale, expected) => {
    expect(isCanonicalDecimalAtScale(value as string, scale as number)).toBe(expected);
  });

  test.each([
    { state: 'blank' },
    { state: 'not_applicable' },
    { state: 'value', value: '0' },
  ])('preserves the distinct tagged value state %#', (value) => {
    expect(validateFilingContributionPack(pack({ values: [{
      semanticId: 'income.uk_interest.untaxed.total',
      value: value as PackPayload['values'][number]['value'],
      provenance: { sourceRevisionHash: HASH_A, normalizationRuleId: 'rule@1' },
    }] })).ok).toBe(true);
  });

  test.each([
    ['JSON number', { state: 'value', value: 1 }],
    ['negative zero', { state: 'value', value: '-0.00' }],
    ['exponent', { state: 'value', value: '1e2' }],
    ['nullable scalar', null],
  ])('rejects non-canonical value representation: %s', (_label, value) => {
    const candidate = pack() as unknown as { packPayload: { values: Array<{ value: unknown }> } };
    candidate.packPayload.values[0].value = value;
    expect(errorCodes(candidate)).toContain('SCHEMA_INVALID');
  });

  test('rejects raw child-domain or discovery metadata in immutable bytes', () => {
    const candidate = pack() as FilingContributionPackEnvelope & { sourceRows?: unknown; state?: string };
    candidate.sourceRows = [{ accountNumber: 'secret' }];
    candidate.state = 'active';
    expect(errorCodes(candidate)).toContain('SCHEMA_INVALID');
  });

  test('rejects a stale content hash and any mutable payload change', () => {
    const candidate = pack();
    candidate.packPayload.values[0].value = { state: 'value', value: '999' };
    expect(errorCodes(candidate)).toContain('CONTENT_HASH_MISMATCH');
  });

  test('keeps content identity stable when only envelope generation time changes', () => {
    const first = pack();
    const reexport = { ...first, generatedAt: '2026-08-03T20:00:00Z' };
    expect(reexport.contentHash).toBe(first.contentHash);
    expect(validateFilingContributionPack(reexport)).toEqual({ ok: true, value: reexport });
  });

  test('assertion wrapper returns valid packs and throws with typed error evidence', () => {
    const valid = pack();
    expect(assertFilingContributionPack(valid)).toBe(valid);
    const invalid = pack();
    invalid.contentHash = HASH_A;
    expect(() => assertFilingContributionPack(invalid)).toThrow('CONTENT_HASH_MISMATCH');
  });

  test('rejects schema, annual and producer-scope identity drift', () => {
    const wrongSchema = pack();
    wrongSchema.packPayload.contract.schemaHash = HASH_A;
    wrongSchema.contentHash = computeContributionPayloadHash(wrongSchema.packPayload);
    expect(errorCodes(wrongSchema)).toContain('SCHEMA_IDENTITY_MISMATCH');

    expect(errorCodes(pack({ taxYear: '2024-25' }))).toContain('ANNUAL_IDENTITY_MISMATCH');
    expect(errorCodes(pack({ permittedScopeId: 'uk-sa/2025-26/cgt@1.0.0' }))).toContain('PRODUCER_SCOPE_MISMATCH');
  });

  test('rejects duplicate semantics, rulesets and source-revision substitution', () => {
    const base = payload();
    expect(errorCodes(pack({ values: [...base.values, base.values[0]] }))).toContain('DUPLICATE_SEMANTIC_ID');
    expect(errorCodes(pack({
      producerProvenance: {
        ...base.producerProvenance,
        rulesets: [base.producerProvenance.rulesets[0], base.producerProvenance.rulesets[0]],
      },
    }))).toContain('DUPLICATE_RULESET_ID');
    expect(errorCodes(pack({
      values: [{ ...base.values[0], provenance: { ...base.values[0].provenance, sourceRevisionHash: HASH_B } }],
    }))).toContain('SOURCE_REVISION_MISMATCH');
  });

  test('ready has no review signals; incomplete requires at least one typed signal', () => {
    const readyWithSignal = pack() as unknown as { packPayload: { readiness: unknown } };
    readyWithSignal.packPayload.readiness = {
      state: 'ready',
      reviewSignals: [{ code: 'REVIEW_REQUIRED', messageKey: 'income.review.required', affectedSemanticIds: [] }],
    };
    expect(errorCodes(readyWithSignal)).toContain('SCHEMA_INVALID');

    const incomplete = pack({
      readiness: {
        state: 'incomplete',
        reviewSignals: [{
          code: 'INCOME_CLASSIFICATION',
          messageKey: 'income.classification.required',
          affectedSemanticIds: ['income.uk_interest.untaxed.total'],
          pendingAmount: { state: 'value', value: '42' },
        }],
      },
      values: [],
    });
    expect(validateFilingContributionPack(incomplete).ok).toBe(true);
  });
});

describe('FIR-498 — ajv schema compilation is lazy, not eager at module load', () => {
  // ajv.compile() JIT-generates the validator via `new Function(...)`, which needs the
  // `unsafe-eval` CSP source. Compiling it at module scope broke every client-bundled importer
  // of the package barrel (e.g. myaccount-app importing only BFF_CSRF_COOKIE) under a strict
  // no-unsafe-eval CSP, even though those importers never call validateFilingContributionPack.
  //
  // FIR-579/FIR-584: the lazy-compile fix alone wasn't enough — the Ajv validator now also
  // lives in its own module (./filing-contribution-pack-validate), exported only from ./index and
  // physically separate from the pure ./filing-contribution-pack module and never reachable
  // from ./browser, so client/edge bundlers cannot pull it in even via barrel (no-tree-shaking) imports.
  test('importing the module does not compile the schema; the first validation call does, and only once', () => {
    jest.resetModules();
    const AjvModule = require('ajv/dist/2020').default;
    const compileSpy = jest.spyOn(AjvModule.prototype, 'compile');
    try {
      const mod = require('../filing-contribution-pack-validate');
      expect(compileSpy).not.toHaveBeenCalled();

      mod.validateFilingContributionPack({});
      expect(compileSpy).toHaveBeenCalledTimes(1);

      mod.validateFilingContributionPack({});
      expect(compileSpy).toHaveBeenCalledTimes(1);
    } finally {
      compileSpy.mockRestore();
    }
  });
});
