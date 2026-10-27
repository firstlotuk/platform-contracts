import type { FilingContributionPackEnvelopeV2, PackPayloadV2 } from '..';
import {
  FILING_CONTRIBUTION_PACK_V2_SCHEMA_HASH,
  FILING_CONTRIBUTION_PACK_V2_SCHEMA_ID,
  assertFilingContributionPack,
  computeContributionPayloadHash,
  sha256CanonicalJson,
  validateFilingContributionPack,
} from '..';

// Fixture identities and semantic inventory: rule-packs main 1b4eb537, annual/uk-sa/.
// This is wire evidence, not annual semantic authorization: rule-packs owns the latter.
const ANNUAL_FIXTURES = [
  {
    taxYear: '2024-25',
    definitionId: 'uk-sa/2024-25@1.0.0',
    definitionHash: 'sha256:bd1f7d34746a27fb7f8eaafe8830ec6265f55e23d42466ddc22f145f7efe51c6',
    incomeScope: 'uk-sa/2024-25/income@1.0.0',
    cgtScope: 'uk-sa/2024-25/cgt@1.0.0',
  },
  {
    taxYear: '2025-26',
    definitionId: 'uk-sa/2025-26@1.3.0',
    definitionHash: 'sha256:392556cc17c0cb3a1d8155599db0d95cb3975b5bf9f05b7d017acbc83d9cee60',
    incomeScope: 'uk-sa/2025-26/income@1.1.0',
    cgtScope: 'uk-sa/2025-26/cgt@1.0.0',
  },
] as const;
const SECTIONS = ['residential-property', 'cryptoassets', 'other', 'shares-listed', 'shares-unlisted'];
const SECTION_VALUES = ['disposal-count', 'proceeds', 'allowable-costs', 'gains-before-losses', 'losses-in-year'];
const PRODUCERS = ['income-app', 'cgt-app'] as const;
type AnnualFixture = typeof ANNUAL_FIXTURES[number];
type Producer = typeof PRODUCERS[number];

function annualPack(annual: AnnualFixture, producer: Producer): FilingContributionPackEnvelopeV2 {
  const sourceRevisionHash = sha256CanonicalJson({ taxYear: annual.taxYear, producer, revision: 1 });
  const semantics = producer === 'income-app'
    ? [
      ['income.uk_interest.untaxed.total', '123', 'hmrc.mtr.c2.15-box-pound-down@1'],
      ['income.uk_dividend.company.total', '10.60', 'hmrc.raw-box-value@1'],
      ['income.uk_dividend.other.total', '10', 'hmrc.mtr.c3.11-box-pound-down@1'],
      ['income.uk_stock_dividend.aoi12.total', '21', 'hmrc.mtr.c3.12-box-pound-down@1'],
    ]
    : [
      ...SECTIONS.flatMap(section => SECTION_VALUES.map(member => [
        `cgt.section.${section}.${member}`,
        member === 'disposal-count' ? '1' : '0',
        member === 'proceeds' || member === 'allowable-costs'
          ? 'hmrc.sa108.aggregate-box-scale-0@1' : 'hmrc.raw-box-value@1',
      ])),
      ['cgt.losses.brought_forward.used_in_year', '0', 'hmrc.raw-box-value@1'],
      ['cgt.losses.available_to_carry_forward', '0', 'hmrc.sa108.aggregate-box-scale-0@1'],
    ];
  const packPayload: PackPayloadV2 = {
    contract: {
      schemaId: FILING_CONTRIBUTION_PACK_V2_SCHEMA_ID,
      schemaVersion: '2.0.0',
      schemaHash: FILING_CONTRIBUTION_PACK_V2_SCHEMA_HASH,
    },
    taxYear: annual.taxYear,
    formDefinitionSetId: annual.definitionId,
    permittedScopeId: producer === 'income-app' ? annual.incomeScope : annual.cgtScope,
    ...(producer === 'income-app'
      ? { producer: 'income-app' as const, employmentPresence: 'absent' as const }
      : { producer: 'cgt-app' as const }),
    readiness: { state: 'ready', reviewSignals: [] },
    values: semantics.map(([semanticId, value, normalizationRuleId]) => ({
      semanticId,
      value: { state: 'value', value },
      provenance: { sourceRevisionHash, normalizationRuleId },
    })),
    producerProvenance: {
      producerBuild: { moduleVersion: '1.0.0', buildDigest: sha256CanonicalJson({ fixture: producer }) },
      rulesets: [{ id: annual.definitionId, hash: annual.definitionHash }],
      engine: null,
      sourceRevisionHash,
    },
  };
  return {
    packId: '01J00000000000000000000000',
    version: 1,
    generatedAt: '2026-10-27T00:00:00Z',
    packPayload,
    contentHash: computeContributionPayloadHash(packPayload),
  };
}

function reseal(pack: FilingContributionPackEnvelopeV2): FilingContributionPackEnvelopeV2 {
  return { ...pack, contentHash: computeContributionPayloadHash(pack.packPayload) };
}

function codes(pack: unknown): string[] {
  const result = validateFilingContributionPack(pack);
  return result.ok ? [] : result.errors.map(error => error.code);
}

describe.each(ANNUAL_FIXTURES)('D232 contribution wire $taxYear', annual => {
  test.each(PRODUCERS)('round-trips the matching annual %s fixture through the generated v2 type and decoder', producer => {
    const pack = annualPack(annual, producer);
    const decoded = assertFilingContributionPack(JSON.parse(JSON.stringify(pack)));
    expect(decoded).toEqual(pack);
    expect(decoded.packPayload.values).toHaveLength(producer === 'income-app' ? 4 : 27);
    expect(decoded.packPayload.producerProvenance.rulesets).toEqual([
      { id: annual.definitionId, hash: annual.definitionHash },
    ]);
  });

  test('carries AOI12 separately from raw INC4 without a new wire enum or schema', () => {
    const pack = annualPack(annual, 'income-app');
    expect(pack.packPayload.values.filter(value => value.semanticId.includes('aoi12'))).toEqual([{
      semanticId: 'income.uk_stock_dividend.aoi12.total',
      value: { state: 'value', value: '21' },
      provenance: {
        sourceRevisionHash: pack.packPayload.producerProvenance.sourceRevisionHash,
        normalizationRuleId: 'hmrc.mtr.c3.12-box-pound-down@1',
      },
    }]);
    expect(pack.packPayload.values[1].value).toEqual({ state: 'value', value: '10.60' });
    // No field-id escape hatch is introduced: annual mapping, not the envelope, grants AOI12.
    const fieldInjection = { ...pack, packPayload: { ...pack.packPayload, targetFieldId: 'AOI13' } };
    expect(codes(fieldInjection)).toContain('SCHEMA_INVALID');
  });

  test.each(PRODUCERS)('rejects rehashed taxYear, definition, scope and producer substitutions for %s', producer => {
    const other = ANNUAL_FIXTURES.find(candidate => candidate.taxYear !== annual.taxYear)!;
    for (const change of [
      { taxYear: other.taxYear },
      { formDefinitionSetId: other.definitionId },
      { permittedScopeId: producer === 'income-app' ? other.incomeScope : other.cgtScope },
    ]) {
      const pack = annualPack(annual, producer);
      Object.assign(pack.packPayload, change);
      expect(codes(reseal(pack))).toContain('ANNUAL_IDENTITY_MISMATCH');
    }
    const wrongScope = annualPack(annual, producer);
    wrongScope.packPayload.permittedScopeId = producer === 'income-app' ? annual.cgtScope : annual.incomeScope;
    expect(codes(reseal(wrongScope))).toContain('PRODUCER_SCOPE_MISMATCH');
    const wrongProducer = annualPack(annual, producer === 'income-app' ? 'cgt-app' : 'income-app');
    wrongProducer.packPayload.permittedScopeId = producer === 'income-app' ? annual.incomeScope : annual.cgtScope;
    expect(codes(reseal(wrongProducer))).toContain('PRODUCER_SCOPE_MISMATCH');
  });

  test.each(PRODUCERS)('binds annual %s payload and provenance hashes', producer => {
    const pack = annualPack(annual, producer);
    const other = annualPack(ANNUAL_FIXTURES.find(candidate => candidate.taxYear !== annual.taxYear)!, producer);
    expect(pack.contentHash).not.toBe(other.contentHash);
    expect(codes({ ...pack, contentHash: other.contentHash })).toContain('CONTENT_HASH_MISMATCH');
    pack.packPayload.producerProvenance.rulesets[0].hash = other.packPayload.producerProvenance.rulesets[0].hash;
    expect(codes(pack)).toContain('CONTENT_HASH_MISMATCH');
    const sourceMismatch = annualPack(annual, producer);
    sourceMismatch.packPayload.values[0].provenance.sourceRevisionHash = other.packPayload.producerProvenance.sourceRevisionHash;
    expect(codes(reseal(sourceMismatch))).toContain('SOURCE_REVISION_MISMATCH');
  });

  test.each([
    { state: 'value' as const, value: '0' },
    { state: 'blank' as const },
    { state: 'not_applicable' as const },
  ])('preserves tri-state $state independently of annual identity', value => {
    const pack = annualPack(annual, 'income-app');
    pack.packPayload.values[3].value = value;
    expect(assertFilingContributionPack(reseal(pack)).packPayload.values[3].value).toEqual(value);
  });

  test.each(['01', '-0', '1e2', '+21', '21,000'])('rejects noncanonical decimal %s after rehashing', value => {
    const pack = annualPack(annual, 'income-app');
    pack.packPayload.values[3].value = { state: 'value', value };
    expect(codes(reseal(pack))).toContain('SCHEMA_INVALID');
  });
});
