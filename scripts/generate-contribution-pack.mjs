import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from 'json-canonicalize';
import { compile } from 'json-schema-to-typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, 'schemas/filing-contribution-pack/1.0.0/schema.json');
const typesPath = resolve(root, 'src/generated/filing-contribution-pack.ts');
const schemaModulePath = resolve(root, 'src/generated/filing-contribution-pack-schema.ts');
const check = process.argv.includes('--check');

const source = await readFile(schemaPath, 'utf8');
const schema = JSON.parse(source);
const canonicalSchema = canonicalize(schema);
const schemaHash = `sha256:${createHash('sha256').update(canonicalSchema, 'utf8').digest('hex')}`;

const generatedTypes = await compile(schema, 'FilingContributionPackEnvelope', {
  bannerComment: '/** GENERATED from schemas/filing-contribution-pack/1.0.0/schema.json. DO NOT EDIT. */',
  style: { singleQuote: true },
  ignoreMinAndMaxItems: true,
  unknownAny: false,
});

const generatedSchema = `/** GENERATED from schemas/filing-contribution-pack/1.0.0/schema.json. DO NOT EDIT. */\n` +
  `export const FILING_CONTRIBUTION_PACK_SCHEMA_ID = ${JSON.stringify(schema.$id)} as const;\n` +
  `export const FILING_CONTRIBUTION_PACK_SCHEMA_VERSION = '1.0.0' as const;\n` +
  `export const FILING_CONTRIBUTION_PACK_SCHEMA_HASH = ${JSON.stringify(schemaHash)} as const;\n` +
  `export const FILING_CONTRIBUTION_PACK_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;\n`;

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
