import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from 'json-canonicalize';
import { compile } from 'json-schema-to-typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const typesPath = resolve(root, 'src/generated/filing-contribution-pack.ts');
const schemaModulePath = resolve(root, 'src/generated/filing-contribution-pack-schema.ts');
const versions = [
  {
    suffix: 'V1',
    version: '1.0.0',
    path: resolve(root, 'schemas/filing-contribution-pack/1.0.0/schema.json'),
  },
  {
    suffix: 'V2',
    version: '2.0.0',
    path: resolve(root, 'schemas/filing-contribution-pack/2.0.0/schema.json'),
  },
];
const check = process.argv.includes('--check');
const generatedTypeNames = [
  'FilingContributionPackEnvelope',
  'ProducerProvenance',
  'NotApplicableValue',
  'CanonicalDecimal',
  'VersionedArtifact',
  'ContributionValue',
  'IncompleteState',
  'EngineProvenance',
  'ValueProvenance',
  'ContractIdentity',
  'ReviewSignal',
  'PresentValue',
  'ProducerBuild',
  'PackPayload',
  'Readiness',
  'FieldValue',
  'ReadyState',
  'BlankValue',
  'TaxYear',
  'Semver',
  'Sha256',
  'Instant',
  'Ulid',
];

function versionedTypeNames(types, suffix) {
  const named = generatedTypeNames.reduce(
    (output, name) => output.replace(new RegExp(`\\b${name}\\b`, 'g'), `${name}${suffix}Schema`),
    types,
  );
  return named.replace(/\{\n  \[k: string\]: any;\n\} & \{\n/g, '{\n');
}

const loadedVersions = await Promise.all(versions.map(async ({ suffix, version, path }) => {
  const schema = JSON.parse(await readFile(path, 'utf8'));
  const schemaHash = `sha256:${createHash('sha256').update(canonicalize(schema), 'utf8').digest('hex')}`;
  const generatedTypes = await compile(schema, 'FilingContributionPackEnvelope', {
    bannerComment: `/** GENERATED from schemas/filing-contribution-pack/${version}/schema.json. DO NOT EDIT. */`,
    style: { singleQuote: true },
    ignoreMinAndMaxItems: true,
    unknownAny: false,
  });
  return { suffix, version, schema, schemaHash, generatedTypes };
}));

const generatedTypes = [
  '/** GENERATED from schemas/filing-contribution-pack/{1.0.0,2.0.0}/schema.json. DO NOT EDIT. */',
  ...loadedVersions.map(({ suffix, generatedTypes: types }) => versionedTypeNames(types, suffix)),
  "export type EmploymentPresence = 'present' | 'absent';",
  'export type PackPayloadV1 = PackPayloadV1Schema;',
  "export type PackPayloadV2 = Omit<PackPayloadV2Schema, 'producer' | 'employmentPresence'> & (",
  "  | { producer: 'income-app'; employmentPresence: EmploymentPresence }",
  "  | { producer: 'cgt-app'; employmentPresence?: never }",
  ');',
  "export type FilingContributionPackEnvelopeV1 = Omit<FilingContributionPackEnvelopeV1Schema, 'packPayload'> & {",
  '  packPayload: PackPayloadV1;',
  '};',
  "export type FilingContributionPackEnvelopeV2 = Omit<FilingContributionPackEnvelopeV2Schema, 'packPayload'> & {",
  '  packPayload: PackPayloadV2;',
  '};',
  'export type FilingContributionPackEnvelope = FilingContributionPackEnvelopeV1 | FilingContributionPackEnvelopeV2;',
  'export type PackPayload = PackPayloadV1 | PackPayloadV2;',
  'export type ContractIdentity = ContractIdentityV1Schema | ContractIdentityV2Schema;',
  'export type Readiness = ReadinessV1Schema | ReadinessV2Schema;',
  'export type FieldValue = FieldValueV1Schema | FieldValueV2Schema;',
  'export type Ulid = UlidV1Schema | UlidV2Schema;',
  'export type Instant = InstantV1Schema | InstantV2Schema;',
  'export type Sha256 = Sha256V1Schema | Sha256V2Schema;',
  'export type TaxYear = TaxYearV1Schema | TaxYearV2Schema;',
  'export type CanonicalDecimal = CanonicalDecimalV1Schema | CanonicalDecimalV2Schema;',
  'export type Semver = SemverV1Schema | SemverV2Schema;',
  'export type EngineProvenance = EngineProvenanceV1Schema | EngineProvenanceV2Schema;',
  'export type ProducerProvenance = ProducerProvenanceV1Schema | ProducerProvenanceV2Schema;',
  'export type ContributionValue = ContributionValueV1Schema | ContributionValueV2Schema;',
  'export type ReviewSignal = ReviewSignalV1Schema | ReviewSignalV2Schema;',
  'export type PresentValue = PresentValueV1Schema | PresentValueV2Schema;',
  'export type IncompleteState = IncompleteStateV1Schema | IncompleteStateV2Schema;',
  'export type BlankValue = BlankValueV1Schema | BlankValueV2Schema;',
  'export type NotApplicableValue = NotApplicableValueV1Schema | NotApplicableValueV2Schema;',
  'export type ValueProvenance = ValueProvenanceV1Schema | ValueProvenanceV2Schema;',
  'export type ProducerBuild = ProducerBuildV1Schema | ProducerBuildV2Schema;',
  'export type VersionedArtifact = VersionedArtifactV1Schema | VersionedArtifactV2Schema;',
].join('\n\n');

const [v1, v2] = loadedVersions;
const generatedSchema = [
  '/** GENERATED from immutable filing contribution schemas. DO NOT EDIT. */',
  `export const FILING_CONTRIBUTION_PACK_V1_SCHEMA_ID = ${JSON.stringify(v1.schema.$id)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V1_SCHEMA_VERSION = ${JSON.stringify(v1.version)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V1_SCHEMA_HASH = ${JSON.stringify(v1.schemaHash)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V1_SCHEMA = ${JSON.stringify(v1.schema, null, 2)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V2_SCHEMA_ID = ${JSON.stringify(v2.schema.$id)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V2_SCHEMA_VERSION = ${JSON.stringify(v2.version)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V2_SCHEMA_HASH = ${JSON.stringify(v2.schemaHash)} as const;`,
  `export const FILING_CONTRIBUTION_PACK_V2_SCHEMA = ${JSON.stringify(v2.schema, null, 2)} as const;`,
  'export const FILING_CONTRIBUTION_PACK_SCHEMA_ID = FILING_CONTRIBUTION_PACK_V1_SCHEMA_ID;',
  'export const FILING_CONTRIBUTION_PACK_SCHEMA_VERSION = FILING_CONTRIBUTION_PACK_V1_SCHEMA_VERSION;',
  'export const FILING_CONTRIBUTION_PACK_SCHEMA_HASH = FILING_CONTRIBUTION_PACK_V1_SCHEMA_HASH;',
  'export const FILING_CONTRIBUTION_PACK_SCHEMA = FILING_CONTRIBUTION_PACK_V1_SCHEMA;',
  '',
].join('\n');

async function emit(path, expected) {
  if (check) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== expected) {
      throw new Error(`${path} is stale; run npm run generate:contracts`);
    }
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, expected, 'utf8');
}

await emit(typesPath, generatedTypes);
await emit(schemaModulePath, generatedSchema);
