# Graph Report - platform-contracts  (2026-09-09)

## Corpus Check
- 58 files · ~49,194 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1293 nodes · 2015 edges · 97 communities (86 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `02e2343b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- browser.ts
- authz.ts
- filing-contribution-pack.ts
- properties
- required
- consent.ts
- properties
- schema.json
- auth.ts
- producerProvenance
- properties
- headroom.ts
- auth-d004.test.ts
- enum
- reviewSignal
- required
- schema.json
- compilerOptions
- investment-tax.ts
- auth.test.ts
- auth-d010-s1-bff-contracts.test.ts
- $defs
- reviewSignals
- contractIdentity
- accountant.ts
- triage-binding.ts
- devDependencies
- versionedArtifact
- auth-d024-via-claim.test.ts
- auth-d023-s1-step-up-contracts.test.ts
- package.json
- producerBuild
- exports
- generate-contribution-pack.mjs
- contributionValue
- state
- dependencies
- scripts
- presentValue
- properties
- ONE_TIME_USE_PURPOSES
- schema.json
- fonts
- schema.json
- required
- instant
- properties
- bands
- required
- jest
- auth-stage3a.test.ts
- c46-compat-schemas.test.ts
- $defs
- engine
- enum
- required
- properties
- properties
- bucketSlice
- `@firstlot/platform-contracts`
- enum
- notApplicableValue
- rateJurisdiction
- ./browser
- formInputs
- SubjectDataHandler
- jest
- sha256
- taxedUkInterestNetGbp
- childBenefitCharge
- foreignTaxDeducted
- giftAidBasicRateRelief
- lloydsUnderwritingTaxPaid
- marriageAllowanceRelief
- otherIncomeTaxPaid
- partnershipTaxPaid
- propertyFinanceCostsRelief
- propertyIncomeTaxPaid
- selfEmploymentTaxPaid
- statePensionLumpSumCharge
- winterFuelPaymentCharge
- CLAUDE.md
- README.md
- PROVENANCE.md
- otherIncomeGbp
- selfEmploymentProfitGbp
- ukInterestGbp
- dividendTax
- payeDeducted
- personalAllowance
- taperApplied
- totalGrossIncome
- dividendTax
- payeDeducted
- taxDeductedOnSavings
- totalGrossIncome

## God Nodes (most connected - your core abstractions)
1. `$defs` - 23 edges
2. `required` - 16 edges
3. `required` - 16 edges
4. `required` - 13 edges
5. `required` - 13 edges
6. `compilerOptions` - 13 edges
7. `enum` - 10 edges
8. `required` - 9 edges
9. `validateFilingContributionPack()` - 9 edges
10. `required` - 8 edges

## Surprising Connections (you probably didn't know these)
- `allowPolicy()` --calls--> `allow()`  [EXTRACTED]
  src/__tests__/authz.test.ts → src/authz.ts
- `errorCodes()` --calls--> `validateFilingContributionPack()`  [EXTRACTED]
  src/__tests__/filing-contribution-pack.test.ts → src/filing-contribution-pack-validate.ts
- `authorize()` --calls--> `isPermissionAction()`  [EXTRACTED]
  src/authz.ts → src/auth.ts
- `pack()` --calls--> `computeContributionPayloadHash()`  [EXTRACTED]
  src/__tests__/filing-contribution-pack.test.ts → src/filing-contribution-pack-node.ts
- `ResolvedAuthorizeInput` --references--> `PermissionAction`  [EXTRACTED]
  src/authz.ts → src/auth.ts

## Import Cycles
- None detected.

## Communities (97 total, 11 thin omitted)

### Community 0 - "browser.ts"
Cohesion: 0.07
Nodes (70): Account, ACCOUNT_EXTERNAL_REF_KINDS, ACCOUNT_ORIGINS, ACCOUNT_STATUSES, ACCOUNT_TYPES, AccountExternalRef, AccountExternalRefInput, AccountExternalRefKind (+62 more)

### Community 1 - "authz.ts"
Cohesion: 0.06
Nodes (54): GatewayActor, PermissionAction, TokenPurpose, VerificationFreshness, ActingContext, allow(), allowReadonly(), allowWithMasking() (+46 more)

### Community 2 - "filing-contribution-pack.ts"
Cohesion: 0.07
Nodes (46): assertIJson(), canonicalizeContributionJson(), ContributionPackValidationError, ContributionPackValidationErrorCode, ContributionPackValidationResult, isCanonicalDecimalAtScale(), computeContributionPayloadHash(), sha256CanonicalJson() (+38 more)

### Community 3 - "properties"
Cohesion: 0.12
Nodes (17): $ref, $ref, properties, $ref, dividendTax, foreignTaxCredit, payeDeducted, savingsTax (+9 more)

### Community 4 - "required"
Cohesion: 0.12
Nodes (16): required, bands, dividendTax, engine, foreignTaxCredit, netIncomeTaxDue, nonSavingsTax, payeDeducted (+8 more)

### Community 5 - "consent.ts"
Cohesion: 0.08
Nodes (39): CONSENT_ACTION_RECONCILIATION_MAP, CONSENT_ACTIONS, CONSENT_AUDIT_EVENTS, CONSENT_AUTH_LEVELS, CONSENT_CACHE_SLA, CONSENT_EVENT_KINDS, CONSENT_KIND_ACTION_POLICY, CONSENT_KINDS (+31 more)

### Community 6 - "properties"
Cohesion: 0.08
Nodes (26): type, type, type, type, properties, type, type, type (+18 more)

### Community 7 - "schema.json"
Cohesion: 0.15
Nodes (12): contentHash, generatedAt, packId, packPayload, additionalProperties, description, $id, version (+4 more)

### Community 8 - "auth.ts"
Cohesion: 0.06
Nodes (33): RFC-9110, AuthLoginProvider, B1ExchangeViaClaim, BffRequestBindingIss, ContributionReadPurpose, ContributionRouteDenyReason, ContributionRouteMatch, ContributionRouteTemplate (+25 more)

### Community 9 - "producerProvenance"
Cohesion: 0.06
Nodes (35): normalizationRuleId, producerBuild, rulesets, sourceRevisionHash, producerProvenance, valueProvenance, $ref, $ref (+27 more)

### Community 10 - "properties"
Cohesion: 0.06
Nodes (31): cgt-app, contract, formDefinitionSetId, income-app, permittedScopeId, producer, producerProvenance, readiness (+23 more)

### Community 11 - "headroom.ts"
Cohesion: 0.11
Nodes (27): asDecimal(), asTaxYear(), BandMovement, DecimalString, HeadroomBand, HeadroomBaselineInput, HeadroomNicBand, HeadroomNicBandMovement (+19 more)

### Community 12 - "auth-d004.test.ts"
Cohesion: 0.11
Nodes (14): ActorTokenClass, ActorTokenPurpose, findForbiddenServiceActorClaim(), findForbiddenViaClaim(), findMissingOrMalformedServiceClaim(), FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS, GatewayAudience, isIntrospectionCaller() (+6 more)

### Community 13 - "enum"
Cohesion: 0.22
Nodes (9): description, enum, additional, allowance, basic, higher, psa, starter (+1 more)

### Community 14 - "reviewSignal"
Cohesion: 0.08
Nodes (26): affectedSemanticIds, code, messageKey, items, maxItems, type, uniqueItems, maxLength (+18 more)

### Community 15 - "required"
Cohesion: 0.04
Nodes (47): additionalProperties, $defs, formInputs, taxYear, description, additionalProperties, description, $ref (+39 more)

### Community 16 - "schema.json"
Cohesion: 0.05
Nodes (39): additionalProperties, description, description, minLength, type, description, items, type (+31 more)

### Community 17 - "compilerOptions"
Cohesion: 0.09
Nodes (21): ES2020, node_modules, src/**/*, src/**/*.test.ts, src/**/__tests__/**, compilerOptions, declaration, declarationMap (+13 more)

### Community 18 - "investment-tax.ts"
Cohesion: 0.14
Nodes (17): ChildAppId, ChildAppStatus, ChildAppStatusValue, FilingContext, SuiteAppAccess, IncomeTaxAppOutput, IncomeTaxFactSummary, IncomeTaxFilingArtifacts (+9 more)

### Community 19 - "auth.test.ts"
Cohesion: 0.12
Nodes (17): AUTH_LOGIN_PROVIDERS, AUTH_TOKEN_POLICY, findOrphanedSensitiveOperation(), GATEWAY_AUDIENCES, isPermissionAction(), isSensitiveOperation(), isServiceOnlyOperation(), PLATFORM_ROLES (+9 more)

### Community 20 - "auth-d010-s1-bff-contracts.test.ts"
Cohesion: 0.11
Nodes (14): BFF_CSP_NONCE_HEADER, BFF_CSRF_COOKIE, BFF_CSRF_HEADER, BFF_FORWARDED_PATH_HEADER, BFF_REQUEST_BINDING_HEADER, BFF_REQUEST_BINDING_ISS, BffRequestBindingEnvelope, ExchangeDownstreamRequest (+6 more)

### Community 21 - "$defs"
Cohesion: 0.10
Nodes (20): $defs, engineProvenance, fieldValue, instant, readiness, semver, sha256, taxYear (+12 more)

### Community 22 - "reviewSignals"
Cohesion: 0.14
Nodes (15): properties, incompleteState, readyState, additionalProperties, properties, type, reviewSignals, state (+7 more)

### Community 23 - "contractIdentity"
Cohesion: 0.14
Nodes (14): schemaHash, schemaId, schemaVersion, additionalProperties, properties, required, type, contractIdentity (+6 more)

### Community 24 - "accountant.ts"
Cohesion: 0.14
Nodes (13): AccountantId, AccountantTaskId, AccountantTaskRow, AccountantTaskState, AccountantTaskType, AssignedAccountant, FactId, OpinionFreshness (+5 more)

### Community 25 - "triage-binding.ts"
Cohesion: 0.24
Nodes (12): assembleFactSet(), FactAssembly, FactSet, FactValue, isTaxpayerRateJurisdiction(), PersonCoreSlice, PersonFactFanout, PROFILE_JURISDICTION_FACT (+4 more)

### Community 26 - "devDependencies"
Cohesion: 0.15
Nodes (13): jest, jest-environment-node, json-schema-to-typescript, devDependencies, jest, jest-environment-node, json-schema-to-typescript, ts-jest (+5 more)

### Community 27 - "versionedArtifact"
Cohesion: 0.15
Nodes (13): hash, id, versionedArtifact, $ref, maxLength, minLength, type, hash (+5 more)

### Community 28 - "auth-d024-via-claim.test.ts"
Cohesion: 0.18
Nodes (11): B1_EXCHANGE_VIA_CLAIM, B1_VIA_EXEMPT_CALLERS, deniesMutationForViaCaller(), FORBIDDEN_ACTOR_CLAIM_KEYS, isMutatingMethod(), MUTATING_HTTP_METHODS, SERVICE_PRINCIPAL_IDS, ServicePrincipalId (+3 more)

### Community 29 - "auth-d023-s1-step-up-contracts.test.ts"
Cohesion: 0.13
Nodes (13): findForbiddenStepUpOnlyClaim(), findMissingOrMalformedB1DownstreamClaim(), findMissingOrMalformedClaim(), findMissingOrMalformedStepUpClaim(), REQUIRED_GATEWAY_TOKEN_CLAIMS, REQUIRED_STEP_UP_TOKEN_CLAIMS, SessionIntrospectionResult, STEP_UP_HEADER (+5 more)

### Community 30 - "package.json"
Cohesion: 0.18
Nodes (10): description, files, dist, main, name, private, sideEffects, types (+2 more)

### Community 31 - "producerBuild"
Cohesion: 0.18
Nodes (11): buildDigest, moduleVersion, $ref, producerBuild, $ref, additionalProperties, properties, required (+3 more)

### Community 32 - "exports"
Cohesion: 0.20
Nodes (10): default, require, types, exports, ./auth, ./node, ./package.json, default (+2 more)

### Community 33 - "generate-contribution-pack.mjs"
Cohesion: 0.22
Nodes (7): canonicalSchema, check, root, schema, schemaModulePath, schemaPath, typesPath

### Community 34 - "contributionValue"
Cohesion: 0.25
Nodes (8): provenance, semanticId, value, additionalProperties, required, type, contributionValue, required

### Community 35 - "state"
Cohesion: 0.29
Nodes (8): reviewSignals, state, additionalProperties, required, type, blankValue, required, required

### Community 36 - "dependencies"
Cohesion: 0.29
Nodes (7): ajv, ajv-formats, json-canonicalize, dependencies, ajv, ajv-formats, json-canonicalize

### Community 37 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, check:generated, generate:contracts, prepare, test, typecheck

### Community 38 - "presentValue"
Cohesion: 0.15
Nodes (13): properties, presentValue, additionalProperties, properties, type, provenance, semanticId, value (+5 more)

### Community 39 - "properties"
Cohesion: 0.05
Nodes (43): formInputs, type, type, type, type, additionalProperties, description, properties (+35 more)

### Community 40 - "ONE_TIME_USE_PURPOSES"
Cohesion: 0.33
Nodes (5): ContributionRouteManifestEntry, matchContributionRoute(), ONE_TIME_USE_PURPOSES, PERMISSION_ACTIONS, manifest

### Community 41 - "schema.json"
Cohesion: 0.22
Nodes (9): $ref, properties, inputHash, result, warnings, $ref, description, items (+1 more)

### Community 42 - "fonts"
Cohesion: 0.40
Nodes (4): fonts, NotoSans-Regular.ttf, NotoSansSC-Regular.otf, reviewerSource

### Community 43 - "schema.json"
Cohesion: 0.06
Nodes (30): additionalProperties, $defs, taxYear, description, $ref, $id, formInputs, rateJurisdiction (+22 more)

### Community 44 - "required"
Cohesion: 0.15
Nodes (13): $ref, $ref, $ref, $ref, properties, contentHash, generatedAt, packId (+5 more)

### Community 45 - "instant"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 46 - "properties"
Cohesion: 0.10
Nodes (20): description, $ref, $ref, $ref, properties, $ref, $ref, ageRelatedMarriedCouplesAllowanceRelief (+12 more)

### Community 47 - "bands"
Cohesion: 0.12
Nodes (17): additionalProperties, properties, required, type, items, type, dividends, nonSavings (+9 more)

### Community 48 - "required"
Cohesion: 0.12
Nodes (16): required, bands, dividendTax, engine, foreignTaxCredit, netIncomeTaxDue, nonSavingsTax, payeDeducted (+8 more)

### Community 50 - "jest"
Cohesion: 0.22
Nodes (9): additionalProperties, description, required, type, bucketSlice, bucket, rate, tax (+1 more)

### Community 51 - "auth-stage3a.test.ts"
Cohesion: 0.15
Nodes (13): canonicalizeClaimKey(), FORBIDDEN_CANONICAL_KEYS, GATEWAY_SIGNING_KEY_STATES, isForbiddenClaimKey(), isOneTimeUsePurpose(), isPublishedKeyState(), isPurposeAllowedForClass(), isValidRoleSet() (+5 more)

### Community 52 - "c46-compat-schemas.test.ts"
Cohesion: 0.15
Nodes (9): ENGINE_INPUT_NAMES, moneyBucket(), pdfBoxMapping, rendererManifest, requestSchemaV1, requestSchemaV1_1, resultSchemaV1, resultSchemaV1_1 (+1 more)

### Community 53 - "$defs"
Cohesion: 0.18
Nodes (11): $defs, incomeTaxResult, moneyString, sha256, additionalProperties, type, description, pattern (+3 more)

### Community 54 - "engine"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 55 - "enum"
Cohesion: 0.07
Nodes (29): advanced, intermediate, top, description, enum, additionalProperties, description, properties (+21 more)

### Community 56 - "required"
Cohesion: 0.29
Nodes (7): additionalProperties, required, type, dividends, nonSavings, savings, bands

### Community 57 - "properties"
Cohesion: 0.20
Nodes (10): properties, items, type, items, type, dividends, nonSavings, savings (+2 more)

### Community 58 - "properties"
Cohesion: 0.25
Nodes (8): properties, rate, tax, taxable, description, type, $ref, $ref

### Community 59 - "bucketSlice"
Cohesion: 0.25
Nodes (8): engineVersion, exclusions, inputHash, result, rulesetVersion, specials, warnings, required

### Community 60 - "`@firstlot/platform-contracts`"
Cohesion: 0.29
Nodes (6): Adoption rule, Current role in the workspace, `@firstlot/platform-contracts`, Ownership model, What belongs here, What must stay out

### Community 61 - "enum"
Cohesion: 0.33
Nodes (6): rUK, scottish, welsh, rateJurisdiction, description, enum

### Community 62 - "notApplicableValue"
Cohesion: 0.40
Nodes (5): notApplicableValue, additionalProperties, properties, required, type

### Community 63 - "rateJurisdiction"
Cohesion: 0.40
Nodes (5): rUK, welsh, rateJurisdiction, description, enum

### Community 64 - "./browser"
Cohesion: 0.50
Nodes (4): default, require, types, ./browser

### Community 65 - "formInputs"
Cohesion: 0.29
Nodes (7): $defs, incomeTaxResult, sha256, additionalProperties, type, pattern, type

### Community 66 - "SubjectDataHandler"
Cohesion: 0.29
Nodes (6): additionalProperties, description, $id, $schema, title, type

### Community 67 - "jest"
Cohesion: 0.50
Nodes (4): maxLength, pattern, type, canonicalDecimal

### Community 68 - "sha256"
Cohesion: 0.50
Nodes (4): moneyString, description, pattern, type

### Community 69 - "taxedUkInterestNetGbp"
Cohesion: 0.50
Nodes (4): description, minLength, type, engineVersion

### Community 70 - "childBenefitCharge"
Cohesion: 0.67
Nodes (3): description, $ref, childBenefitCharge

### Community 71 - "foreignTaxDeducted"
Cohesion: 0.67
Nodes (3): description, $ref, foreignTaxDeducted

### Community 72 - "giftAidBasicRateRelief"
Cohesion: 0.67
Nodes (3): description, $ref, giftAidBasicRateRelief

### Community 73 - "lloydsUnderwritingTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, lloydsUnderwritingTaxPaid

### Community 74 - "marriageAllowanceRelief"
Cohesion: 0.67
Nodes (3): description, $ref, marriageAllowanceRelief

### Community 75 - "otherIncomeTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, otherIncomeTaxPaid

### Community 76 - "partnershipTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, partnershipTaxPaid

### Community 77 - "propertyFinanceCostsRelief"
Cohesion: 0.67
Nodes (3): propertyFinanceCostsRelief, description, $ref

### Community 78 - "propertyIncomeTaxPaid"
Cohesion: 0.67
Nodes (3): propertyIncomeTaxPaid, description, $ref

### Community 79 - "selfEmploymentTaxPaid"
Cohesion: 0.67
Nodes (3): selfEmploymentTaxPaid, description, $ref

### Community 80 - "statePensionLumpSumCharge"
Cohesion: 0.67
Nodes (3): statePensionLumpSumCharge, description, $ref

### Community 81 - "winterFuelPaymentCharge"
Cohesion: 0.67
Nodes (3): winterFuelPaymentCharge, description, $ref

### Community 85 - "otherIncomeGbp"
Cohesion: 0.50
Nodes (4): description, items, type, exclusions

### Community 86 - "selfEmploymentProfitGbp"
Cohesion: 0.50
Nodes (4): rulesetVersion, description, minLength, type

### Community 87 - "ukInterestGbp"
Cohesion: 0.50
Nodes (4): specials, description, items, type

### Community 88 - "dividendTax"
Cohesion: 0.67
Nodes (3): ulid, pattern, type

## Knowledge Gaps
- **585 isolated node(s):** `name`, `version`, `description`, `private`, `sideEffects` (+580 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `$defs` connect `$defs` to `contributionValue`, `jest`, `state`, `presentValue`, `schema.json`, `producerProvenance`, `properties`, `reviewSignal`, `reviewSignals`, `contractIdentity`, `dividendTax`, `versionedArtifact`, `notApplicableValue`, `producerBuild`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `properties` connect `properties` to `bands`, `$defs`, `engine`, `enum`, `childBenefitCharge`, `foreignTaxDeducted`, `giftAidBasicRateRelief`, `lloydsUnderwritingTaxPaid`, `marriageAllowanceRelief`, `otherIncomeTaxPaid`, `partnershipTaxPaid`, `propertyFinanceCostsRelief`, `propertyIncomeTaxPaid`, `selfEmploymentTaxPaid`, `statePensionLumpSumCharge`, `winterFuelPaymentCharge`, `dividendTax`, `payeDeducted`, `taxDeductedOnSavings`, `totalGrossIncome`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `incomeTaxResult` connect `$defs` to `required`, `properties`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _585 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `browser.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0669710806697108 - nodes in this community are weakly interconnected._
- **Should `authz.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061016949152542375 - nodes in this community are weakly interconnected._
- **Should `filing-contribution-pack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06988120195667366 - nodes in this community are weakly interconnected._