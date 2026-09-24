// SA302 settlement schema coverage — POST /api/sa302.
//
// Authored 2026-09-10 to close the gap the D-132 register entry `R2-spec-ia-conflict` names: the
// owner decision "the engine owns full-return composition" added a production contract that lived
// only in a ticket's status.json, and firstlot-suite has since shipped a consumer against it. Same
// scope boundary as schemas/stateless-calculation-*: PROPOSAL ONLY, not referenced by any
// compatibility manifest, ratification is the owner's separate step.
//
// Every payload below was captured or probed against a locally-run engine. The accepted/refused
// control pair records the explicit boundary: `rulesetVersion` is rejected, not required. D-164
// adds raw AOI13 to the accepted request and recaptures its 200 response against the 0.9.8 engine;
// the refused control remains a fail-closed regression probe.
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
// D-154, captured 2026-09-24 from a locally-run engine: screened-request.json is SA100/SA108 only,
// so it is screened and raises Special #47 (RTT tax already charged on listed shares).
const screenedRequest = load('fixtures/sa302/screened-request.json');
const screenedResponse = load('fixtures/sa302/live-response-screened.json');

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
    expect(Object.keys(formInputs.properties)).toHaveLength(161);
    expect(formInputs.properties).toHaveProperty('propertyIncomeTaxableProfitGbp');
    expect(formInputs.properties).toHaveProperty('ukCompanyDividendsRawGbp');
    expect(formInputs.properties).toHaveProperty('bonusIssuesOfSecuritiesRawGbp');
    expect(formInputs.required).not.toContain('ukCompanyDividendsRawGbp');
    expect(formInputs.required).not.toContain('bonusIssuesOfSecuritiesRawGbp');
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
  it('accepts the live 200 bodies, every member of them', () => {
    expect(validateResult(liveResponse)).toBe(true);
    expect(validateResult(screenedResponse)).toBe(true);
    expect(validateRequest(screenedRequest)).toBe(true);
  });

  it('describes the whole wire, not just the members the Suite reads', () => {
    for (const key of ['specials', 'exclusions', 'specialsEvaluated', 'exclusionsEvaluated', 'screening', 'claimBoundary']) {
      const { [key]: _dropped, ...without } = liveResponse;
      expect(validateResult(without)).toBe(false);
    }
  });

  it('ties the evaluated flags to the screened-forms boundary (D-154)', () => {
    // accepted-request.json carries SA102 employment, so it was NOT screened.
    expect(liveResponse.screening.inputsOutsideScreenedForms.length).toBeGreaterThan(0);
    expect(validateResult({ ...liveResponse, specialsEvaluated: true, exclusionsEvaluated: true })).toBe(false);
    expect(validateResult({ ...screenedResponse, specialsEvaluated: false })).toBe(false);
  });

  it('refuses the pre-D-154 null findings and an unknown finding basis', () => {
    expect(validateResult({ ...screenedResponse, specials: null })).toBe(false);
    const [finding] = screenedResponse.specials;
    expect(validateResult({ ...screenedResponse, specials: [{ ...finding, basis: 'likely' }] })).toBe(false);
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
