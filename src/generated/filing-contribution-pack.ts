/** GENERATED from schemas/filing-contribution-pack/{1.0.0,2.0.0}/schema.json. DO NOT EDIT. */

/** GENERATED from schemas/filing-contribution-pack/1.0.0/schema.json. DO NOT EDIT. */

export type UlidV1Schema = string;
export type InstantV1Schema = string;
export type Sha256V1Schema = string;
export type TaxYearV1Schema = string;
export type ReadinessV1Schema = ReadyStateV1Schema | IncompleteStateV1Schema;
export type CanonicalDecimalV1Schema = string;
export type FieldValueV1Schema = BlankValueV1Schema | NotApplicableValueV1Schema | PresentValueV1Schema;
export type SemverV1Schema = string;
export type EngineProvenanceV1Schema = null | {
  implementationVersion: SemverV1Schema;
  buildDigest: Sha256V1Schema;
  adapterContractId: string;
};

/**
 * Immutable, portable FirstLot filing contribution pack. Child-domain source data is deliberately excluded.
 */
export interface FilingContributionPackEnvelopeV1Schema {
  packId: UlidV1Schema;
  version: number;
  generatedAt: InstantV1Schema;
  packPayload: PackPayloadV1Schema;
  contentHash: Sha256V1Schema;
}
export interface PackPayloadV1Schema {
  contract: ContractIdentityV1Schema;
  producer: 'income-app' | 'cgt-app';
  taxYear: TaxYearV1Schema;
  formDefinitionSetId: string;
  permittedScopeId: string;
  readiness: ReadinessV1Schema;
  /**
   * @maxItems 256
   */
  values: ContributionValueV1Schema[];
  producerProvenance: ProducerProvenanceV1Schema;
}
export interface ContractIdentityV1Schema {
  schemaId: 'https://contracts.firstlot.co.uk/filing-contribution-pack/1.0.0/schema.json';
  schemaVersion: '1.0.0';
  schemaHash: Sha256V1Schema;
}
export interface ReadyStateV1Schema {
  state: 'ready';
  /**
   * @maxItems 0
   */
  reviewSignals: ReviewSignalV1Schema[];
}
export interface ReviewSignalV1Schema {
  code: string;
  messageKey: string;
  /**
   * @maxItems 256
   */
  affectedSemanticIds: string[];
  pendingAmount?: PresentValueV1Schema;
}
export interface PresentValueV1Schema {
  state: 'value';
  value: CanonicalDecimalV1Schema;
}
export interface IncompleteStateV1Schema {
  state: 'incomplete';
  /**
   * @minItems 1
   * @maxItems 256
   */
  reviewSignals: ReviewSignalV1Schema[];
}
export interface ContributionValueV1Schema {
  semanticId: string;
  value: FieldValueV1Schema;
  provenance: ValueProvenanceV1Schema;
}
export interface BlankValueV1Schema {
  state: 'blank';
}
export interface NotApplicableValueV1Schema {
  state: 'not_applicable';
}
export interface ValueProvenanceV1Schema {
  sourceRevisionHash: Sha256V1Schema;
  normalizationRuleId: string;
}
export interface ProducerProvenanceV1Schema {
  producerBuild: ProducerBuildV1Schema;
  /**
   * @maxItems 16
   */
  rulesets: VersionedArtifactV1Schema[];
  engine: EngineProvenanceV1Schema;
  sourceRevisionHash: Sha256V1Schema;
}
export interface ProducerBuildV1Schema {
  moduleVersion: SemverV1Schema;
  buildDigest: Sha256V1Schema;
}
export interface VersionedArtifactV1Schema {
  id: string;
  hash: Sha256V1Schema;
}


/** GENERATED from schemas/filing-contribution-pack/2.0.0/schema.json. DO NOT EDIT. */

export type UlidV2Schema = string;
export type InstantV2Schema = string;
export type PackPayloadV2Schema = {
  contract: ContractIdentityV2Schema;
  producer: 'income-app' | 'cgt-app';
  taxYear: TaxYearV2Schema;
  formDefinitionSetId: string;
  permittedScopeId: string;
  readiness: ReadinessV2Schema;
  /**
   * @maxItems 256
   */
  values: ContributionValueV2Schema[];
  producerProvenance: ProducerProvenanceV2Schema;
  employmentPresence?: 'present' | 'absent';
};
export type Sha256V2Schema = string;
export type TaxYearV2Schema = string;
export type ReadinessV2Schema = ReadyStateV2Schema | IncompleteStateV2Schema;
export type CanonicalDecimalV2Schema = string;
export type FieldValueV2Schema = BlankValueV2Schema | NotApplicableValueV2Schema | PresentValueV2Schema;
export type SemverV2Schema = string;
export type EngineProvenanceV2Schema = null | {
  implementationVersion: SemverV2Schema;
  buildDigest: Sha256V2Schema;
  adapterContractId: string;
};

/**
 * Immutable, portable FirstLot filing contribution pack. Child-domain source data is deliberately excluded.
 */
export interface FilingContributionPackEnvelopeV2Schema {
  packId: UlidV2Schema;
  version: number;
  generatedAt: InstantV2Schema;
  packPayload: PackPayloadV2Schema;
  contentHash: Sha256V2Schema;
}
export interface ContractIdentityV2Schema {
  schemaId: 'https://contracts.firstlot.co.uk/filing-contribution-pack/2.0.0/schema.json';
  schemaVersion: '2.0.0';
  schemaHash: Sha256V2Schema;
}
export interface ReadyStateV2Schema {
  state: 'ready';
  /**
   * @maxItems 0
   */
  reviewSignals: ReviewSignalV2Schema[];
}
export interface ReviewSignalV2Schema {
  code: string;
  messageKey: string;
  /**
   * @maxItems 256
   */
  affectedSemanticIds: string[];
  pendingAmount?: PresentValueV2Schema;
}
export interface PresentValueV2Schema {
  state: 'value';
  value: CanonicalDecimalV2Schema;
}
export interface IncompleteStateV2Schema {
  state: 'incomplete';
  /**
   * @minItems 1
   * @maxItems 256
   */
  reviewSignals: ReviewSignalV2Schema[];
}
export interface ContributionValueV2Schema {
  semanticId: string;
  value: FieldValueV2Schema;
  provenance: ValueProvenanceV2Schema;
}
export interface BlankValueV2Schema {
  state: 'blank';
}
export interface NotApplicableValueV2Schema {
  state: 'not_applicable';
}
export interface ValueProvenanceV2Schema {
  sourceRevisionHash: Sha256V2Schema;
  normalizationRuleId: string;
}
export interface ProducerProvenanceV2Schema {
  producerBuild: ProducerBuildV2Schema;
  /**
   * @maxItems 16
   */
  rulesets: VersionedArtifactV2Schema[];
  engine: EngineProvenanceV2Schema;
  sourceRevisionHash: Sha256V2Schema;
}
export interface ProducerBuildV2Schema {
  moduleVersion: SemverV2Schema;
  buildDigest: Sha256V2Schema;
}
export interface VersionedArtifactV2Schema {
  id: string;
  hash: Sha256V2Schema;
}


export type EmploymentPresence = 'present' | 'absent';

export type PackPayloadV1 = PackPayloadV1Schema;

export type PackPayloadV2 = Omit<PackPayloadV2Schema, 'producer' | 'employmentPresence'> & (

  | { producer: 'income-app'; employmentPresence: EmploymentPresence }

  | { producer: 'cgt-app'; employmentPresence?: never }

);

export type FilingContributionPackEnvelopeV1 = Omit<FilingContributionPackEnvelopeV1Schema, 'packPayload'> & {

  packPayload: PackPayloadV1;

};

export type FilingContributionPackEnvelopeV2 = Omit<FilingContributionPackEnvelopeV2Schema, 'packPayload'> & {

  packPayload: PackPayloadV2;

};

export type FilingContributionPackEnvelope = FilingContributionPackEnvelopeV1 | FilingContributionPackEnvelopeV2;

export type PackPayload = PackPayloadV1 | PackPayloadV2;

export type ContractIdentity = ContractIdentityV1Schema | ContractIdentityV2Schema;

export type Readiness = ReadinessV1Schema | ReadinessV2Schema;

export type FieldValue = FieldValueV1Schema | FieldValueV2Schema;

export type Ulid = UlidV1Schema | UlidV2Schema;

export type Instant = InstantV1Schema | InstantV2Schema;

export type Sha256 = Sha256V1Schema | Sha256V2Schema;

export type TaxYear = TaxYearV1Schema | TaxYearV2Schema;

export type CanonicalDecimal = CanonicalDecimalV1Schema | CanonicalDecimalV2Schema;

export type Semver = SemverV1Schema | SemverV2Schema;

export type EngineProvenance = EngineProvenanceV1Schema | EngineProvenanceV2Schema;

export type ProducerProvenance = ProducerProvenanceV1Schema | ProducerProvenanceV2Schema;

export type ContributionValue = ContributionValueV1Schema | ContributionValueV2Schema;

export type ReviewSignal = ReviewSignalV1Schema | ReviewSignalV2Schema;

export type PresentValue = PresentValueV1Schema | PresentValueV2Schema;

export type IncompleteState = IncompleteStateV1Schema | IncompleteStateV2Schema;

export type BlankValue = BlankValueV1Schema | BlankValueV2Schema;

export type NotApplicableValue = NotApplicableValueV1Schema | NotApplicableValueV2Schema;

export type ValueProvenance = ValueProvenanceV1Schema | ValueProvenanceV2Schema;

export type ProducerBuild = ProducerBuildV1Schema | ProducerBuildV2Schema;

export type VersionedArtifact = VersionedArtifactV1Schema | VersionedArtifactV2Schema;