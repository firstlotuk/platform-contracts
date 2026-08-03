/** GENERATED from schemas/filing-contribution-pack/1.0.0/schema.json. DO NOT EDIT. */

export type Ulid = string;
export type Instant = string;
export type Sha256 = string;
export type TaxYear = string;
export type Readiness = ReadyState | IncompleteState;
export type CanonicalDecimal = string;
export type FieldValue = BlankValue | NotApplicableValue | PresentValue;
export type Semver = string;
export type EngineProvenance = null | {
  implementationVersion: Semver;
  buildDigest: Sha256;
  adapterContractId: string;
};

/**
 * Immutable, portable FirstLot filing contribution pack. Child-domain source data is deliberately excluded.
 */
export interface FilingContributionPackEnvelope {
  packId: Ulid;
  version: number;
  generatedAt: Instant;
  packPayload: PackPayload;
  contentHash: Sha256;
}
export interface PackPayload {
  contract: ContractIdentity;
  producer: 'income-app' | 'cgt-app';
  taxYear: TaxYear;
  formDefinitionSetId: string;
  permittedScopeId: string;
  readiness: Readiness;
  /**
   * @maxItems 256
   */
  values: ContributionValue[];
  producerProvenance: ProducerProvenance;
}
export interface ContractIdentity {
  schemaId: 'https://contracts.firstlot.co.uk/filing-contribution-pack/1.0.0/schema.json';
  schemaVersion: '1.0.0';
  schemaHash: Sha256;
}
export interface ReadyState {
  state: 'ready';
  /**
   * @maxItems 0
   */
  reviewSignals: ReviewSignal[];
}
export interface ReviewSignal {
  code: string;
  messageKey: string;
  /**
   * @maxItems 256
   */
  affectedSemanticIds: string[];
  pendingAmount?: PresentValue;
}
export interface PresentValue {
  state: 'value';
  value: CanonicalDecimal;
}
export interface IncompleteState {
  state: 'incomplete';
  /**
   * @minItems 1
   * @maxItems 256
   */
  reviewSignals: ReviewSignal[];
}
export interface ContributionValue {
  semanticId: string;
  value: FieldValue;
  provenance: ValueProvenance;
}
export interface BlankValue {
  state: 'blank';
}
export interface NotApplicableValue {
  state: 'not_applicable';
}
export interface ValueProvenance {
  sourceRevisionHash: Sha256;
  normalizationRuleId: string;
}
export interface ProducerProvenance {
  producerBuild: ProducerBuild;
  /**
   * @maxItems 16
   */
  rulesets: VersionedArtifact[];
  engine: EngineProvenance;
  sourceRevisionHash: Sha256;
}
export interface ProducerBuild {
  moduleVersion: Semver;
  buildDigest: Sha256;
}
export interface VersionedArtifact {
  id: string;
  hash: Sha256;
}
