// ---------------------------------------------------------------------------
// Triage / rule-engine binding contracts (D-001 I2)
//
// The shared seam every app uses to drive the rule engine the same way:
//   assemble a FactSet  →  evaluate (via @firstlot/rule-engine)  →  fan results out.
// Defining these ONCE here prevents each app reinventing the glue (the
// replication this migration exists to kill). See
// specs/platform/RULE_ENGINE_PLATFORM_DESIGN.md §0 ("two contracts to define
// once").
//
// FactValue/FactSet are structurally identical to @firstlot/rule-engine's input
// types; kept here (no engine import) so the cross-boundary contract has no
// runtime dependency. Engine consumers pass a FactSet straight through.
// ---------------------------------------------------------------------------

/** A single answer/fact value. Multi-select facts are string lists. */
export type FactValue = string | string[];

/** Facts keyed by factPath — the rule engine's input. */
export type FactSet = Record<string, FactValue>;

// ── Fact assembly (input side) ─────────────────────────────────────────────

/**
 * How an app composes the FactSet it sends to the engine. Three sources, with a
 * fixed precedence so assembly is deterministic across apps:
 *   prefill  <  domain  <  person
 * (person-core L1 is authoritative for the facts it owns — e.g. residency — so
 * it wins; domain L2 facts override imported prefill; prefill is the weakest.)
 */
export interface FactAssembly {
  /** L1 person-core facts (via FilingContext / person-core owner), e.g. residency. */
  personFacts: FactSet;
  /** L2 domain facts owned by the calling app (cgt disposals, income figures). */
  domainFacts: FactSet;
  /** Imports / prior-year prefill. Weakest precedence. */
  prefillFacts: FactSet;
}

/**
 * The CANONICAL fact merge — every consumer must assemble its FactSet through
 * this, not a hand-rolled spread, so the precedence (prefill < domain < person)
 * never drifts between apps. person-core L1 is authoritative for what it owns.
 */
export function assembleFactSet(a: FactAssembly): FactSet {
  return { ...a.prefillFacts, ...a.domainFacts, ...a.personFacts };
}

/** The L1 person-core slices a triage fact may originate from / reconcile into. */
export type PersonCoreSlice = 'residency' | 'identity' | 'domicile';

// ── Result fan-out (output side) ───────────────────────────────────────────

/**
 * The form-scope half of the result, destined for the L2 filing-case control
 * plane. `recommendedForms` is what populates `FilingContext.activeForms`.
 */
export interface ScopeFanout {
  recommendedForms: string[];      // → FilingContext.activeForms
  needsConfirmation: string[];     // forms provisionally in scope ("not sure")
  notExpected: string[];           // explicitly ruled out this year
}

/**
 * A person-level fact discovered by triage, destined for the person-core OWNER
 * API. Intent is ALWAYS reconcile, never overwrite — the canonical value (e.g.
 * the residency timeline) is owned upstream; triage proposes, the owner
 * reconciles (PERSON_CORE_DATA_DESIGN §5/§9). The engine never writes; the app
 * binding routes this to the owner.
 */
export interface PersonFactFanout {
  factPath: string;
  value: FactValue;
  slice: PersonCoreSlice;
  intent: 'reconcile';
}

/** The complete fan-out of a triage result. */
export interface TriageResultFanout {
  scope: ScopeFanout;
  personFacts: PersonFactFanout[];
}
