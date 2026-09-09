# Graph Report - .  (2026-09-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1504 nodes · 2225 edges · 115 communities (100 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `892a2d02`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authz.ts
- filing-contribution-pack.ts
- consent.ts
- properties
- properties
- required
- auth.ts
- schema.json
- schema.json
- browser.ts
- person-core.ts
- person-core.test.ts
- producerProvenance
- headroom.ts
- properties
- schema.json
- schema.json
- properties
- enum
- reviewSignal
- schema.json
- compilerOptions
- $defs
- properties
- properties
- auth.test.ts
- auth-d004.test.ts
- auth-d010-s1-bff-contracts.test.ts
- properties
- bands
- bands
- required
- required
- reviewSignals
- auth-stage3a.test.ts
- auth-d023-s1-step-up-contracts.test.ts
- c46-compat-schemas.test.ts
- contractIdentity
- triage-binding.ts
- devDependencies
- versionedArtifact
- presentValue
- auth-d024-via-claim.test.ts
- package.json
- producerBuild
- engine
- $defs
- engine
- engine
- exports
- properties
- properties
- enum
- broker-facts-feed.ts
- enum
- bucketSlice
- bucketSlice
- generate-contribution-pack.mjs
- contributionValue
- state
- properties
- dependencies
- scripts
- `@firstlot/platform-contracts`
- bands
- $defs
- enum
- enum
- notApplicableValue
- fonts
- rateJurisdiction
- ./browser
- instant
- moneyString
- ulid
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
- netIncomeTaxDue
- nonSavingsTax
- personalAllowance
- taxDeductedOnSavings
- netIncomeTaxDue
- payeDeducted
- taxDeductedOnSavings
- totalGrossIncome
- dividendTax
- payeDeducted
- taxDeductedOnSavings
- totalGrossIncome

## God Nodes (most connected - your core abstractions)
1. `$defs` - 23 edges
2. `required` - 16 edges
3. `required` - 16 edges
4. `required` - 16 edges
5. `required` - 13 edges
6. `required` - 13 edges
7. `compilerOptions` - 13 edges
8. `enum` - 10 edges
9. `enum` - 10 edges
10. `required` - 9 edges

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

## Communities (115 total, 15 thin omitted)

### Community 0 - "authz.ts"
Cohesion: 0.07
Nodes (51): GatewayActor, PermissionAction, ActingContext, allow(), allowReadonly(), allowWithMasking(), authorize(), Decision (+43 more)

### Community 1 - "filing-contribution-pack.ts"
Cohesion: 0.07
Nodes (46): assertIJson(), canonicalizeContributionJson(), ContributionPackValidationError, ContributionPackValidationErrorCode, ContributionPackValidationResult, isCanonicalDecimalAtScale(), computeContributionPayloadHash(), sha256CanonicalJson() (+38 more)

### Community 2 - "consent.ts"
Cohesion: 0.08
Nodes (39): CONSENT_ACTION_RECONCILIATION_MAP, CONSENT_ACTIONS, CONSENT_AUDIT_EVENTS, CONSENT_AUTH_LEVELS, CONSENT_CACHE_SLA, CONSENT_EVENT_KINDS, CONSENT_KIND_ACTION_POLICY, CONSENT_KINDS (+31 more)

### Community 3 - "properties"
Cohesion: 0.05
Nodes (43): formInputs, type, type, type, type, additionalProperties, description, properties (+35 more)

### Community 4 - "properties"
Cohesion: 0.05
Nodes (43): formInputs, type, type, type, type, additionalProperties, description, properties (+35 more)

### Community 5 - "required"
Cohesion: 0.05
Nodes (41): additionalProperties, $defs, incomeTaxResult, moneyString, sha256, description, $id, additionalProperties (+33 more)

### Community 6 - "auth.ts"
Cohesion: 0.05
Nodes (39): RFC-9110, AuthLoginProvider, B1ExchangeViaClaim, BffRequestBindingIss, ContributionReadPurpose, ContributionRouteDenyReason, ContributionRouteManifestEntry, ContributionRouteMatch (+31 more)

### Community 7 - "schema.json"
Cohesion: 0.05
Nodes (39): additionalProperties, description, description, minLength, type, description, items, type (+31 more)

### Community 8 - "schema.json"
Cohesion: 0.05
Nodes (39): additionalProperties, description, description, minLength, type, description, items, type (+31 more)

### Community 9 - "browser.ts"
Cohesion: 0.11
Nodes (32): AccountantId, AccountantTaskId, AccountantTaskRow, AccountantTaskState, AccountantTaskType, AssignedAccountant, FactId, OpinionFreshness (+24 more)

### Community 10 - "person-core.ts"
Cohesion: 0.06
Nodes (35): ACCOUNT_EXTERNAL_REF_KINDS, ACCOUNT_TYPES, AccountExternalRefInput, AccountExternalRefKind, AccountMigrationProvenance, AccountOrigin, AccountOwnershipSplitInput, AccountStatus (+27 more)

### Community 11 - "person-core.test.ts"
Cohesion: 0.06
Nodes (35): Account, ACCOUNT_ORIGINS, ACCOUNT_STATUSES, AccountExternalRef, AccountMergeRequest, AccountOwnership, CreateAccountRequest, GetAccountResponse (+27 more)

### Community 12 - "producerProvenance"
Cohesion: 0.06
Nodes (35): normalizationRuleId, producerBuild, rulesets, sourceRevisionHash, producerProvenance, valueProvenance, $ref, $ref (+27 more)

### Community 13 - "headroom.ts"
Cohesion: 0.11
Nodes (27): asDecimal(), asTaxYear(), BandMovement, DecimalString, HeadroomBand, HeadroomBaselineInput, HeadroomNicBand, HeadroomNicBandMovement (+19 more)

### Community 14 - "properties"
Cohesion: 0.06
Nodes (31): cgt-app, contract, formDefinitionSetId, income-app, permittedScopeId, producer, producerProvenance, readiness (+23 more)

### Community 15 - "schema.json"
Cohesion: 0.06
Nodes (30): additionalProperties, $defs, taxYear, description, $ref, $id, formInputs, rateJurisdiction (+22 more)

### Community 16 - "schema.json"
Cohesion: 0.06
Nodes (30): additionalProperties, $defs, taxYear, description, $ref, $id, formInputs, rateJurisdiction (+22 more)

### Community 17 - "properties"
Cohesion: 0.06
Nodes (31): description, minLength, type, description, items, type, description, type (+23 more)

### Community 18 - "enum"
Cohesion: 0.07
Nodes (29): description, enum, additionalProperties, description, properties, required, type, bucketSlice (+21 more)

### Community 19 - "reviewSignal"
Cohesion: 0.08
Nodes (26): affectedSemanticIds, code, messageKey, items, maxItems, type, uniqueItems, maxLength (+18 more)

### Community 20 - "schema.json"
Cohesion: 0.08
Nodes (25): contentHash, generatedAt, packId, packPayload, additionalProperties, $ref, description, $ref (+17 more)

### Community 21 - "compilerOptions"
Cohesion: 0.09
Nodes (21): ES2020, node_modules, src/**/*, src/**/*.test.ts, src/**/__tests__/**, compilerOptions, declaration, declarationMap (+13 more)

### Community 22 - "$defs"
Cohesion: 0.10
Nodes (20): maxLength, pattern, type, $defs, canonicalDecimal, engineProvenance, fieldValue, readiness (+12 more)

### Community 23 - "properties"
Cohesion: 0.10
Nodes (20): description, $ref, $ref, $ref, properties, $ref, $ref, ageRelatedMarriedCouplesAllowanceRelief (+12 more)

### Community 24 - "properties"
Cohesion: 0.10
Nodes (20): description, $ref, $ref, properties, $ref, $ref, $ref, ageRelatedMarriedCouplesAllowanceRelief (+12 more)

### Community 25 - "auth.test.ts"
Cohesion: 0.12
Nodes (17): AUTH_LOGIN_PROVIDERS, AUTH_TOKEN_POLICY, findOrphanedSensitiveOperation(), GATEWAY_AUDIENCES, isPermissionAction(), isSensitiveOperation(), isServiceOnlyOperation(), PLATFORM_ROLES (+9 more)

### Community 26 - "auth-d004.test.ts"
Cohesion: 0.11
Nodes (14): ActorTokenClass, ActorTokenPurpose, findForbiddenServiceActorClaim(), findForbiddenViaClaim(), findMissingOrMalformedServiceClaim(), FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS, GatewayAudience, isIntrospectionCaller() (+6 more)

### Community 27 - "auth-d010-s1-bff-contracts.test.ts"
Cohesion: 0.11
Nodes (14): BFF_CSP_NONCE_HEADER, BFF_CSRF_COOKIE, BFF_CSRF_HEADER, BFF_FORWARDED_PATH_HEADER, BFF_REQUEST_BINDING_HEADER, BFF_REQUEST_BINDING_ISS, BffRequestBindingEnvelope, ExchangeDownstreamRequest (+6 more)

### Community 28 - "properties"
Cohesion: 0.12
Nodes (17): $ref, $ref, properties, $ref, dividendTax, foreignTaxCredit, payeDeducted, savingsTax (+9 more)

### Community 29 - "bands"
Cohesion: 0.12
Nodes (17): additionalProperties, properties, required, type, items, type, dividends, nonSavings (+9 more)

### Community 30 - "bands"
Cohesion: 0.12
Nodes (17): additionalProperties, properties, required, type, items, type, dividends, nonSavings (+9 more)

### Community 31 - "required"
Cohesion: 0.12
Nodes (16): required, bands, dividendTax, engine, foreignTaxCredit, netIncomeTaxDue, nonSavingsTax, payeDeducted (+8 more)

### Community 32 - "required"
Cohesion: 0.12
Nodes (16): required, bands, dividendTax, engine, foreignTaxCredit, netIncomeTaxDue, nonSavingsTax, payeDeducted (+8 more)

### Community 33 - "reviewSignals"
Cohesion: 0.14
Nodes (15): properties, incompleteState, readyState, additionalProperties, properties, type, reviewSignals, state (+7 more)

### Community 34 - "auth-stage3a.test.ts"
Cohesion: 0.15
Nodes (13): canonicalizeClaimKey(), FORBIDDEN_CANONICAL_KEYS, GATEWAY_SIGNING_KEY_STATES, isForbiddenClaimKey(), isOneTimeUsePurpose(), isPublishedKeyState(), isPurposeAllowedForClass(), isValidRoleSet() (+5 more)

### Community 35 - "auth-d023-s1-step-up-contracts.test.ts"
Cohesion: 0.13
Nodes (13): findForbiddenStepUpOnlyClaim(), findMissingOrMalformedB1DownstreamClaim(), findMissingOrMalformedClaim(), findMissingOrMalformedStepUpClaim(), REQUIRED_GATEWAY_TOKEN_CLAIMS, REQUIRED_STEP_UP_TOKEN_CLAIMS, SessionIntrospectionResult, STEP_UP_HEADER (+5 more)

### Community 36 - "c46-compat-schemas.test.ts"
Cohesion: 0.14
Nodes (10): ENGINE_INPUT_NAMES, moneyBucket(), pdfBoxMapping, rendererManifest, requestSchemaV1, requestSchemaV1_1, resultSchemaV1, resultSchemaV1_1 (+2 more)

### Community 37 - "contractIdentity"
Cohesion: 0.14
Nodes (14): schemaHash, schemaId, schemaVersion, additionalProperties, properties, required, type, contractIdentity (+6 more)

### Community 38 - "triage-binding.ts"
Cohesion: 0.24
Nodes (12): assembleFactSet(), FactAssembly, FactSet, FactValue, isTaxpayerRateJurisdiction(), PersonCoreSlice, PersonFactFanout, PROFILE_JURISDICTION_FACT (+4 more)

### Community 39 - "devDependencies"
Cohesion: 0.15
Nodes (13): jest, jest-environment-node, json-schema-to-typescript, devDependencies, jest, jest-environment-node, json-schema-to-typescript, ts-jest (+5 more)

### Community 40 - "versionedArtifact"
Cohesion: 0.15
Nodes (13): hash, id, versionedArtifact, $ref, maxLength, minLength, type, hash (+5 more)

### Community 41 - "presentValue"
Cohesion: 0.15
Nodes (13): properties, presentValue, additionalProperties, properties, type, provenance, semanticId, value (+5 more)

### Community 42 - "auth-d024-via-claim.test.ts"
Cohesion: 0.18
Nodes (11): B1_EXCHANGE_VIA_CLAIM, B1_VIA_EXEMPT_CALLERS, deniesMutationForViaCaller(), FORBIDDEN_ACTOR_CLAIM_KEYS, isMutatingMethod(), MUTATING_HTTP_METHODS, SERVICE_PRINCIPAL_IDS, ServicePrincipalId (+3 more)

### Community 43 - "package.json"
Cohesion: 0.18
Nodes (10): description, files, dist, main, name, private, sideEffects, types (+2 more)

### Community 44 - "producerBuild"
Cohesion: 0.18
Nodes (11): buildDigest, moduleVersion, $ref, producerBuild, $ref, additionalProperties, properties, required (+3 more)

### Community 45 - "engine"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 46 - "$defs"
Cohesion: 0.18
Nodes (11): $defs, incomeTaxResult, moneyString, sha256, additionalProperties, type, description, pattern (+3 more)

### Community 47 - "engine"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 48 - "engine"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 49 - "exports"
Cohesion: 0.20
Nodes (10): default, require, types, exports, ./auth, ./node, ./package.json, default (+2 more)

### Community 50 - "properties"
Cohesion: 0.20
Nodes (10): properties, items, type, items, type, dividends, nonSavings, savings (+2 more)

### Community 51 - "properties"
Cohesion: 0.20
Nodes (10): description, properties, bucket, rate, tax, taxable, description, type (+2 more)

### Community 52 - "enum"
Cohesion: 0.20
Nodes (10): enum, additional, advanced, allowance, basic, higher, intermediate, psa (+2 more)

### Community 53 - "broker-facts-feed.ts"
Cohesion: 0.20
Nodes (8): BROKER_FACTS_FEED_MAX_PAGE_SIZE, BROKER_FACTS_FEED_PATH, BROKER_FACTS_FEED_PURPOSE, BROKER_FACTS_FEED_SCHEMA_VERSION, BrokerFact, BrokerFactEventType, BrokerFactsCursor, BrokerFactsFeedResponse

### Community 54 - "enum"
Cohesion: 0.22
Nodes (9): description, enum, additional, allowance, basic, higher, psa, starter (+1 more)

### Community 55 - "bucketSlice"
Cohesion: 0.22
Nodes (9): additionalProperties, description, required, type, bucketSlice, bucket, rate, tax (+1 more)

### Community 56 - "bucketSlice"
Cohesion: 0.22
Nodes (9): additionalProperties, description, required, type, bucketSlice, bucket, rate, tax (+1 more)

### Community 57 - "generate-contribution-pack.mjs"
Cohesion: 0.22
Nodes (7): canonicalSchema, check, root, schema, schemaModulePath, schemaPath, typesPath

### Community 58 - "contributionValue"
Cohesion: 0.25
Nodes (8): provenance, semanticId, value, additionalProperties, required, type, contributionValue, required

### Community 59 - "state"
Cohesion: 0.29
Nodes (8): reviewSignals, state, additionalProperties, required, type, blankValue, required, required

### Community 60 - "properties"
Cohesion: 0.25
Nodes (8): properties, rate, tax, taxable, description, type, $ref, $ref

### Community 61 - "dependencies"
Cohesion: 0.29
Nodes (7): ajv, ajv-formats, json-canonicalize, dependencies, ajv, ajv-formats, json-canonicalize

### Community 62 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, check:generated, generate:contracts, prepare, test, typecheck

### Community 63 - "`@firstlot/platform-contracts`"
Cohesion: 0.29
Nodes (6): Adoption rule, Current role in the workspace, `@firstlot/platform-contracts`, Ownership model, What belongs here, What must stay out

### Community 64 - "bands"
Cohesion: 0.29
Nodes (7): additionalProperties, required, type, dividends, nonSavings, savings, bands

### Community 65 - "$defs"
Cohesion: 0.29
Nodes (7): $defs, incomeTaxResult, sha256, additionalProperties, type, pattern, type

### Community 66 - "enum"
Cohesion: 0.33
Nodes (6): rUK, scottish, welsh, rateJurisdiction, description, enum

### Community 67 - "enum"
Cohesion: 0.33
Nodes (6): rUK, scottish, welsh, rateJurisdiction, description, enum

### Community 68 - "notApplicableValue"
Cohesion: 0.40
Nodes (5): notApplicableValue, additionalProperties, properties, required, type

### Community 69 - "fonts"
Cohesion: 0.40
Nodes (4): fonts, NotoSans-Regular.ttf, NotoSansSC-Regular.otf, reviewerSource

### Community 70 - "rateJurisdiction"
Cohesion: 0.40
Nodes (5): rUK, welsh, rateJurisdiction, description, enum

### Community 71 - "./browser"
Cohesion: 0.50
Nodes (4): default, require, types, ./browser

### Community 72 - "instant"
Cohesion: 0.50
Nodes (4): instant, format, pattern, type

### Community 73 - "moneyString"
Cohesion: 0.50
Nodes (4): moneyString, description, pattern, type

### Community 74 - "ulid"
Cohesion: 0.67
Nodes (3): ulid, pattern, type

### Community 75 - "childBenefitCharge"
Cohesion: 0.67
Nodes (3): description, $ref, childBenefitCharge

### Community 76 - "foreignTaxDeducted"
Cohesion: 0.67
Nodes (3): description, $ref, foreignTaxDeducted

### Community 77 - "giftAidBasicRateRelief"
Cohesion: 0.67
Nodes (3): description, $ref, giftAidBasicRateRelief

### Community 78 - "lloydsUnderwritingTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, lloydsUnderwritingTaxPaid

### Community 79 - "marriageAllowanceRelief"
Cohesion: 0.67
Nodes (3): description, $ref, marriageAllowanceRelief

### Community 80 - "otherIncomeTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, otherIncomeTaxPaid

### Community 81 - "partnershipTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, partnershipTaxPaid

### Community 82 - "propertyFinanceCostsRelief"
Cohesion: 0.67
Nodes (3): propertyFinanceCostsRelief, description, $ref

### Community 83 - "propertyIncomeTaxPaid"
Cohesion: 0.67
Nodes (3): propertyIncomeTaxPaid, description, $ref

### Community 84 - "selfEmploymentTaxPaid"
Cohesion: 0.67
Nodes (3): selfEmploymentTaxPaid, description, $ref

### Community 85 - "statePensionLumpSumCharge"
Cohesion: 0.67
Nodes (3): statePensionLumpSumCharge, description, $ref

### Community 86 - "winterFuelPaymentCharge"
Cohesion: 0.67
Nodes (3): winterFuelPaymentCharge, description, $ref

### Community 87 - "childBenefitCharge"
Cohesion: 0.67
Nodes (3): description, $ref, childBenefitCharge

### Community 88 - "foreignTaxDeducted"
Cohesion: 0.67
Nodes (3): description, $ref, foreignTaxDeducted

### Community 89 - "giftAidBasicRateRelief"
Cohesion: 0.67
Nodes (3): description, $ref, giftAidBasicRateRelief

### Community 90 - "lloydsUnderwritingTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, lloydsUnderwritingTaxPaid

### Community 91 - "marriageAllowanceRelief"
Cohesion: 0.67
Nodes (3): description, $ref, marriageAllowanceRelief

### Community 92 - "otherIncomeTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, otherIncomeTaxPaid

### Community 93 - "partnershipTaxPaid"
Cohesion: 0.67
Nodes (3): description, $ref, partnershipTaxPaid

### Community 94 - "propertyFinanceCostsRelief"
Cohesion: 0.67
Nodes (3): propertyFinanceCostsRelief, description, $ref

### Community 95 - "propertyIncomeTaxPaid"
Cohesion: 0.67
Nodes (3): propertyIncomeTaxPaid, description, $ref

### Community 96 - "selfEmploymentTaxPaid"
Cohesion: 0.67
Nodes (3): selfEmploymentTaxPaid, description, $ref

### Community 97 - "statePensionLumpSumCharge"
Cohesion: 0.67
Nodes (3): statePensionLumpSumCharge, description, $ref

### Community 98 - "winterFuelPaymentCharge"
Cohesion: 0.67
Nodes (3): winterFuelPaymentCharge, description, $ref

## Knowledge Gaps
- **730 isolated node(s):** `name`, `version`, `description`, `private`, `sideEffects` (+725 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `$defs` connect `$defs` to `reviewSignals`, `notApplicableValue`, `contractIdentity`, `instant`, `presentValue`, `ulid`, `versionedArtifact`, `producerBuild`, `producerProvenance`, `properties`, `reviewSignal`, `schema.json`, `contributionValue`, `state`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `properties` connect `properties` to `bands`, `$defs`, `engine`, `enum`, `childBenefitCharge`, `foreignTaxDeducted`, `giftAidBasicRateRelief`, `lloydsUnderwritingTaxPaid`, `marriageAllowanceRelief`, `otherIncomeTaxPaid`, `partnershipTaxPaid`, `propertyFinanceCostsRelief`, `propertyIncomeTaxPaid`, `selfEmploymentTaxPaid`, `statePensionLumpSumCharge`, `winterFuelPaymentCharge`, `netIncomeTaxDue`, `payeDeducted`, `taxDeductedOnSavings`, `totalGrossIncome`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `incomeTaxResult` connect `$defs` to `required`, `properties`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _730 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authz.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06516290726817042 - nodes in this community are weakly interconnected._
- **Should `filing-contribution-pack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06988120195667366 - nodes in this community are weakly interconnected._
- **Should `consent.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0824524312896406 - nodes in this community are weakly interconnected._