/**
 * Contract fixtures for the triage binding (D-001 I2). These are the
 * cross-app examples that prove the contracts are concrete enough to prevent
 * per-app glue drift — every consumer (income, cgt, suite) assembles facts and
 * fans results out against THESE shapes.
 */

import { assembleFactSet } from '../triage-binding';
import type {
  FactSet, FactAssembly, ScopeFanout, PersonFactFanout, TriageResultFanout,
} from '../triage-binding';

describe('triage-binding contract fixtures', () => {
  test('FactAssembly merges with person-core-wins precedence', () => {
    const assembly: FactAssembly = {
      prefillFacts: { employerCount: 'one', profileUkResident: 'no' },
      domainFacts: { hasDisposals: 'yes', employerCount: 'two' },
      personFacts: { profileUkResident: 'yes' }, // L1 authoritative → wins
    };
    const facts = assembleFactSet(assembly);
    expect(facts.profileUkResident).toBe('yes');   // person beats prefill
    expect(facts.employerCount).toBe('two');       // domain beats prefill
    expect(facts.hasDisposals).toBe('yes');
  });

  test('income-app-shaped fan-out (verdicts → activeForms)', () => {
    const scope: ScopeFanout = {
      recommendedForms: ['SA100', 'SA105'],
      needsConfirmation: ['SA107'],
      notExpected: ['SA109'],
    };
    const activeForms = scope.recommendedForms; // → FilingContext.activeForms
    expect(activeForms).toEqual(['SA100', 'SA105']);
  });

  test('person-fact fan-out is reconcile-intent only (never overwrite)', () => {
    const pf: PersonFactFanout = {
      factPath: 'profileUkResident', value: 'no', slice: 'residency', intent: 'reconcile',
    };
    expect(pf.intent).toBe('reconcile');
    expect(pf.slice).toBe('residency');
  });

  test('cgt-shaped multi-select domain facts are valid FactValues', () => {
    const facts: FactSet = { disposalTypes: ['shares', 'crypto'], hasDisposals: 'yes' };
    expect(Array.isArray(facts.disposalTypes)).toBe(true);
  });

  test('a complete TriageResultFanout composes scope + person facts', () => {
    const fanout: TriageResultFanout = {
      scope: { recommendedForms: ['SA100', 'SA109'], needsConfirmation: [], notExpected: [] },
      personFacts: [{ factPath: 'profileUkResident', value: 'no', slice: 'residency', intent: 'reconcile' }],
    };
    expect(fanout.scope.recommendedForms).toContain('SA109');
    expect(fanout.personFacts[0].slice).toBe('residency');
  });
});
