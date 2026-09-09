// SA302 settlement schema coverage — POST /api/sa302.
//
// Authored 2026-09-10 to close the gap the D-132 register entry `R2-spec-ia-conflict` names: the
// owner decision "the engine owns full-return composition" added a production contract that lived
// only in a ticket's status.json, and firstlot-suite has since shipped a consumer against it. Same
// scope boundary as schemas/stateless-calculation-*: PROPOSAL ONLY, not referenced by any
// compatibility manifest, ratification is the owner's separate step.
//
// The point of these tests is that the schemas describe the WIRE, not a reading of the source.
// Every payload below was captured from a locally-run engine on 2026-09-10, and the pair of them
// is the evidence for the divergence the schema records: the identical body answers 400 with
// `rulesetVersion` present and 200 without it, while the Suite's TS interface declares that field
// and posts the whole object.
import fs from 'fs';
import path from 'path';
import Ajv2020 from 'ajv/dist/2020';

const root = path.join(__dirname, '..', '..');
const load = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const requestSchema = load('schemas/sa302-settlement-request/1.0.0/schema.json');
const resultSchema = load('schemas/sa302-settlement-result/1.0.0/schema.json');
const acceptedRequest = load('fixtures/sa302/accepted-request.json');
const refusedRequest = load('fixtures/sa302/refused-request-with-rulesetversion.json');
const liveResponse = load('fixtures/sa302/live-response.json');

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);

describe('sa302-settlement-request/1.0.0', () => {
  it('accepts the exact body the engine answered 200 to', () => {
    expect(validateRequest(acceptedRequest)).toBe(true);
  });

  it('refuses the body the engine answered 400 to — rulesetVersion is not a member', () => {
    // The engine's message: "The JSON property 'rulesetVersion' could not be mapped to any .NET
    // member contained in type ... Sa302SettlementRequest". A schema that allowed it would be
    // describing a request the endpoint does not accept.
    expect(validateRequest(refusedRequest)).toBe(false);
    expect(JSON.stringify(validateRequest.errors)).toContain('rulesetVersion');
  });

  it('refuses an omitted required-nullable leg, and accepts an explicit null', () => {
    const { nicDueGbp: _omitted, ...withoutNic } = acceptedRequest;
    expect(validateRequest(withoutNic)).toBe(false);
    expect(validateRequest({ ...acceptedRequest, nicDueGbp: null })).toBe(true);
    expect(validateRequest({ ...acceptedRequest, nicDueGbp: 1234.56 })).toBe(true);
  });

  it('refuses a misspelled member rather than dropping it', () => {
    // The real defect this endpoint already had once: a typo'd cgt.lossesBrouhtFowardGbp was
    // silently dropped and the route answered 200 with a different tax figure.
    const typo = { ...acceptedRequest, cgt: { ...acceptedRequest.cgt, lossesBrouhtFowardGbp: 99 } };
    expect(validateRequest(typo)).toBe(false);
  });

  it('refuses a caller-supplied CGT basic-rate band extension', () => {
    // Not a style rule: c4.59 widens the CGT basic-rate band, so a caller stating it would be
    // choosing its own CGT rate. A probe moved cgtDue from 12,463.80 to 10,260.00 that way.
    const band = { ...acceptedRequest, cgt: { ...acceptedRequest.cgt, basicRateBandExtensionGbp: 50000 } };
    expect(validateRequest(band)).toBe(false);
  });

  it('refuses a tax year the controller refuses', () => {
    expect(validateRequest({ ...acceptedRequest, taxYear: '2023-24' })).toBe(false);
  });
});

// Four more bodies probed against the same running engine, two accepted and two refused. They
// exist because both independent reviews said the tests above pin the constraints but not the
// INVENTORY — and they were right: the schema's first draft required only `category` on a CGT
// entry, so it accepted `probe-p_nogain` which the engine answers 400 to. These pin the inventory
// against the engine's answer rather than against my reading of the record.
describe('sa302-settlement-request/1.0.0 — inventory, pinned to live answers', () => {
  const accepts = ['probe-p_omit', 'probe-p_extra'] as const;
  const refuses = ['probe-p_nogain', 'probe-p_badcat'] as const;

  it.each(accepts)('accepts %s, which the engine answered 200 to', (name) => {
    expect(validateRequest(load(`fixtures/sa302/${name}.json`))).toBe(true);
  });

  it.each(refuses)('refuses %s, which the engine answered 400 to', (name) => {
    expect(validateRequest(load(`fixtures/sa302/${name}.json`))).toBe(false);
  });

  it('requires the engine\'s eleven, not the governed twelve', () => {
    // /api/calculate enforces exactly 12 through RequiredInputNames. THIS route binds
    // IncomeTaxInputs directly, whose C# `required` members number eleven —
    // taxedUkInterestNetGbp is not one, and probe-p_omit is the proof.
    const formInputs = requestSchema.$defs.formInputs;
    expect(formInputs.required).toHaveLength(11);
    expect(formInputs.required).not.toContain('taxedUkInterestNetGbp');
    // …and the accepted surface is the whole record, not the Suite's subset. Requiring 12 would
    // have refused bodies this endpoint computes different answers from.
    expect(Object.keys(formInputs.properties).length).toBeGreaterThanOrEqual(156);
    expect(formInputs.properties).toHaveProperty('propertyIncomeTaxableProfitGbp');
    expect(formInputs.additionalProperties).toBe(false);
  });

  it('closes the CGT category vocabulary to the nine the engine names', () => {
    const category = requestSchema.$defs.cgtCategory;
    expect(category.required).toEqual(['category', 'gainsInTheYearGbp']);
    expect(category.properties.category.enum).toHaveLength(9);
    expect(category.properties.category.enum).toContain('NrcgtOtherAndIndirect');
  });
});

describe('sa302-settlement-result/1.0.0', () => {
  it('accepts the live 200 body, every member of it', () => {
    expect(validateResult(liveResponse)).toBe(true);
  });

  it('describes the whole wire, not just the six members the Suite reads', () => {
    for (const key of ['specials', 'exclusions', 'specialsEvaluated', 'exclusionsEvaluated', 'claimBoundary']) {
      const { [key]: _dropped, ...without } = liveResponse;
      expect(validateResult(without)).toBe(false);
    }
  });

  it('refuses money as a JSON number', () => {
    // FIR-401: money crosses this wire as a 2dp string. The engine's own open question
    // D137-decimal-representation is about the OTHER direction on a different surface; here the
    // wire is already settled and the schema states it.
    const numeric = { ...liveResponse, sa302: { ...liveResponse.sa302, combinedTotal: 5018.25 } };
    expect(validateResult(numeric)).toBe(false);
  });

  it('holds combinedTotal signed — a repayment case is not malformed', () => {
    const repayment = { ...liveResponse, sa302: { ...liveResponse.sa302, combinedTotal: '-1257.94' } };
    expect(validateResult(repayment)).toBe(true);
  });

  it('pins the claim boundary: this route can never carry the governed label', () => {
    const claimed = {
      ...liveResponse,
      claimBoundary: { ...liveResponse.claimBoundary, governedRulesetLabelApplies: true },
    };
    expect(validateResult(claimed)).toBe(false);
  });
});
