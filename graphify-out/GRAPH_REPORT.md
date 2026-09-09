# Graph Report - platform-contracts  (2026-09-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1496 nodes · 2217 edges · 117 communities (99 shown, 16 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 49,905 input · 1,886 output

## Graph Freshness
- Built from commit: `2cb0d451`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Account & Person Core Types
- Authorization Decision Model
- Filing Contribution Pack Validation
- Income Tax Totals Properties
- Income Tax Required Fields
- Consent & Token Policy
- Income Tax Form Inputs Schema
- Contribution Pack Schema 1.0.0
- Auth Contract Types
- Producer Provenance Schema
- Contribution Pack Producer Fields
- Tax Headroom Calculations
- Service Token Claim Validation
- Rate Band Properties
- Review Signal Codes
- Calculation Result Schema 1.2.0
- Stateless Result Schema 1.0.0
- TypeScript Compiler Config
- Filing & Child App Contracts
- Sensitive Operations & Roles
- Result Envelope Properties
- Shared Schema Definitions
- Readiness State Schema
- Contract Identity Schema
- Accountant Tasks & Opinions
- Triage Fact Binding
- Dev Dependencies & Jest
- Versioned Artifact Schema
- Allowance Bucket Enum
- Tax Bucket Slice Enums
- Package Manifest
- Producer Build Digest
- Package Export Map
- Contribution Pack Generator
- Contribution Value Object
- Blank Value Review Signals
- Runtime Dependencies
- NPM Build Scripts
- Contribution Value Provenance
- Income Tax Form Inputs Schema
- Tax Band Category Groups
- Stateless Result Schema 1.1.0
- Renderer Font Manifest
- Calculation Request Schema 1.1.0
- Engine Name & Version
- Instant Timestamp Format
- Income Tax Result Fields
- Tax Band Category Groups
- Income Tax Required Fields
- Income Tax Result Fields
- Bucket Slice Properties
- Compat Schema Tests
- Income Tax Result Defs
- Engine Name & Version
- Tax Band Enum Values
- Band Category Requirements
- Band Category Items
- Calculation Request Schema 1.0.0
- Engine Name & Version
- Contracts Package Readme
- Rate Jurisdiction Enum
- Not Applicable Value Schema
- Rate Jurisdiction Enum
- Browser Export Entry
- Tax Bucket Rate Fields
- Bucket Slice Properties
- Income Tax Result Hash Defs
- Money String Format
- Rate Jurisdiction Enum
- Child Benefit Charge Ref
- Foreign Tax Deducted Ref
- Gift Aid Relief Ref
- Lloyds Underwriting Tax Ref
- Marriage Allowance Relief Ref
- Other Income Tax Paid Ref
- Partnership Tax Paid Ref
- Property Finance Costs Relief
- Property Income Tax Paid Ref
- Self Employment Tax Paid Ref
- State Pension Lump Sum Charge
- Winter Fuel Payment Charge
- Contracts Repo Instructions
- Architecture Docs Relocation
- PDF Renderer Provenance
- ULID Pattern Format
- Dividend Tax Schema
- Non-Savings Tax Schema
- Personal Allowance Schema
- Savings Tax Deducted Schema
- Total Gross Income Schema
- Child Benefit Charge Ref
- Foreign Tax Deducted Ref
- Gift Aid Relief Ref
- PAYE Deducted Schema
- Savings Tax Deducted Schema
- Total Gross Income Schema
- Lloyds Underwriting Tax Ref
- Marriage Allowance Relief Ref
- Other Income Tax Paid Ref
- Partnership Tax Paid Ref
- Property Finance Costs Relief
- Property Income Tax Paid Ref
- Self Employment Tax Paid Ref
- State Pension Lump Sum Charge
- Winter Fuel Payment Charge
- Net Income Tax Due Schema
- Net Income Tax Due Schema
- PAYE Deducted Schema
- Savings Tax Deducted Schema
- BFF Request Binding Headers
- Gateway Token Class Policy
- Via-Claim Actor Rules
- Step-Up Token Claim Checks
- Contribution Route Manifest
- Subject Data Handler

## God Nodes (most connected - your core abstractions)
1. `$defs` - 23 edges
2. `required` - 16 edges
3. `required` - 16 edges
4. `required` - 16 edges
5. `compilerOptions` - 13 edges
6. `required` - 13 edges
7. `required` - 13 edges
8. `enum` - 10 edges
9. `enum` - 10 edges
10. `validateFilingContributionPack()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `allowPolicy()` --calls--> `allow()`  [EXTRACTED]
  src/__tests__/authz.test.ts → src/authz.ts
- `authorize()` --calls--> `isPermissionAction()`  [EXTRACTED]
  src/authz.ts → src/auth.ts
- `errorCodes()` --calls--> `validateFilingContributionPack()`  [EXTRACTED]
  src/__tests__/filing-contribution-pack.test.ts → src/filing-contribution-pack-validate.ts
- `ResolvedAuthorizeInput` --references--> `GatewayActor`  [EXTRACTED]
  src/authz.ts → src/auth.ts
- `ResolvedAuthorizeInput` --references--> `PermissionAction`  [EXTRACTED]
  src/authz.ts → src/auth.ts

## Import Cycles
- None detected.

## Communities (117 total, 16 thin omitted)

### Community 0 - "Account & Person Core Types"
Cohesion: 0.07
Nodes (70): Account, ACCOUNT_EXTERNAL_REF_KINDS, ACCOUNT_ORIGINS, ACCOUNT_STATUSES, ACCOUNT_TYPES, AccountExternalRef, AccountExternalRefInput, AccountExternalRefKind (+62 more)

### Community 1 - "Authorization Decision Model"
Cohesion: 0.06
Nodes (54): GatewayActor, PermissionAction, TokenPurpose, VerificationFreshness, ActingContext, allow(), allowReadonly(), allowWithMasking() (+46 more)

### Community 2 - "Filing Contribution Pack Validation"
Cohesion: 0.07
Nodes (46): assertIJson(), canonicalizeContributionJson(), ContributionPackValidationError, ContributionPackValidationErrorCode, ContributionPackValidationResult, isCanonicalDecimalAtScale(), computeContributionPayloadHash(), sha256CanonicalJson() (+38 more)

### Community 3 - "Income Tax Totals Properties"
Cohesion: 0.12
Nodes (17): $ref, properties, $ref, $ref, foreignTaxCredit, netIncomeTaxDue, payeDeducted, savingsTax (+9 more)

### Community 4 - "Income Tax Required Fields"
Cohesion: 0.12
Nodes (16): required, bands, dividendTax, engine, foreignTaxCredit, netIncomeTaxDue, nonSavingsTax, payeDeducted (+8 more)

### Community 5 - "Consent & Token Policy"
Cohesion: 0.09
Nodes (40): AUTH_TOKEN_POLICY, SENSITIVE_OPERATIONS, CONSENT_ACTION_RECONCILIATION_MAP, CONSENT_ACTIONS, CONSENT_AUDIT_EVENTS, CONSENT_AUTH_LEVELS, CONSENT_CACHE_SLA, CONSENT_EVENT_KINDS (+32 more)

### Community 6 - "Income Tax Form Inputs Schema"
Cohesion: 0.05
Nodes (43): formInputs, type, type, type, type, additionalProperties, description, properties (+35 more)

### Community 7 - "Contribution Pack Schema 1.0.0"
Cohesion: 0.08
Nodes (25): contentHash, generatedAt, packId, packPayload, additionalProperties, $ref, description, $ref (+17 more)

### Community 8 - "Auth Contract Types"
Cohesion: 0.06
Nodes (34): RFC-9110, AuthLoginProvider, B1ExchangeViaClaim, BffRequestBindingIss, ContributionReadPurpose, ContributionRouteDenyReason, ContributionRouteMatch, ContributionRouteTemplate (+26 more)

### Community 9 - "Producer Provenance Schema"
Cohesion: 0.06
Nodes (35): normalizationRuleId, producerBuild, rulesets, sourceRevisionHash, producerProvenance, valueProvenance, $ref, $ref (+27 more)

### Community 10 - "Contribution Pack Producer Fields"
Cohesion: 0.06
Nodes (31): cgt-app, contract, formDefinitionSetId, income-app, permittedScopeId, producer, producerProvenance, readiness (+23 more)

### Community 11 - "Tax Headroom Calculations"
Cohesion: 0.10
Nodes (28): asDecimal(), asTaxYear(), BandMovement, DecimalString, HeadroomBand, HeadroomBaselineInput, HeadroomNicBand, HeadroomNicBandMovement (+20 more)

### Community 12 - "Service Token Claim Validation"
Cohesion: 0.11
Nodes (14): ActorTokenClass, ActorTokenPurpose, findForbiddenServiceActorClaim(), findForbiddenViaClaim(), findMissingOrMalformedServiceClaim(), FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS, GatewayAudience, isIntrospectionCaller() (+6 more)

### Community 13 - "Rate Band Properties"
Cohesion: 0.25
Nodes (8): properties, rate, tax, taxable, description, type, $ref, $ref

### Community 14 - "Review Signal Codes"
Cohesion: 0.08
Nodes (26): affectedSemanticIds, code, messageKey, items, maxItems, type, uniqueItems, maxLength (+18 more)

### Community 15 - "Calculation Result Schema 1.2.0"
Cohesion: 0.05
Nodes (41): additionalProperties, $defs, incomeTaxResult, moneyString, sha256, description, $id, additionalProperties (+33 more)

### Community 16 - "Stateless Result Schema 1.0.0"
Cohesion: 0.05
Nodes (39): additionalProperties, description, description, minLength, type, description, items, type (+31 more)

### Community 17 - "TypeScript Compiler Config"
Cohesion: 0.09
Nodes (21): ES2020, node_modules, src/**/*, src/**/*.test.ts, src/**/__tests__/**, compilerOptions, declaration, declarationMap (+13 more)

### Community 18 - "Filing & Child App Contracts"
Cohesion: 0.14
Nodes (17): ChildAppId, ChildAppStatus, ChildAppStatusValue, FilingContext, SuiteAppAccess, IncomeTaxAppOutput, IncomeTaxFactSummary, IncomeTaxFilingArtifacts (+9 more)

### Community 19 - "Sensitive Operations & Roles"
Cohesion: 0.13
Nodes (16): AUTH_LOGIN_PROVIDERS, findOrphanedSensitiveOperation(), GATEWAY_AUDIENCES, isPermissionAction(), isSensitiveOperation(), isServiceOnlyOperation(), PERMISSION_ACTIONS, PLATFORM_ROLES (+8 more)

### Community 20 - "Result Envelope Properties"
Cohesion: 0.06
Nodes (31): description, minLength, type, description, items, type, description, type (+23 more)

### Community 21 - "Shared Schema Definitions"
Cohesion: 0.10
Nodes (20): maxLength, pattern, type, $defs, canonicalDecimal, engineProvenance, fieldValue, readiness (+12 more)

### Community 22 - "Readiness State Schema"
Cohesion: 0.14
Nodes (15): properties, incompleteState, readyState, additionalProperties, properties, type, reviewSignals, state (+7 more)

### Community 23 - "Contract Identity Schema"
Cohesion: 0.14
Nodes (14): schemaHash, schemaId, schemaVersion, additionalProperties, properties, required, type, contractIdentity (+6 more)

### Community 24 - "Accountant Tasks & Opinions"
Cohesion: 0.14
Nodes (13): AccountantId, AccountantTaskId, AccountantTaskRow, AccountantTaskState, AccountantTaskType, AssignedAccountant, FactId, OpinionFreshness (+5 more)

### Community 25 - "Triage Fact Binding"
Cohesion: 0.24
Nodes (12): assembleFactSet(), FactAssembly, FactSet, FactValue, isTaxpayerRateJurisdiction(), PersonCoreSlice, PersonFactFanout, PROFILE_JURISDICTION_FACT (+4 more)

### Community 26 - "Dev Dependencies & Jest"
Cohesion: 0.15
Nodes (13): jest-environment-node, json-schema-to-typescript, devDependencies, jest, jest-environment-node, json-schema-to-typescript, ts-jest, @types/jest (+5 more)

### Community 27 - "Versioned Artifact Schema"
Cohesion: 0.15
Nodes (13): hash, id, versionedArtifact, $ref, maxLength, minLength, type, hash (+5 more)

### Community 28 - "Allowance Bucket Enum"
Cohesion: 0.22
Nodes (9): description, enum, additional, allowance, basic, higher, psa, starter (+1 more)

### Community 29 - "Tax Bucket Slice Enums"
Cohesion: 0.07
Nodes (29): description, enum, additionalProperties, description, properties, required, type, bucketSlice (+21 more)

### Community 30 - "Package Manifest"
Cohesion: 0.18
Nodes (10): description, files, dist, main, name, private, sideEffects, types (+2 more)

### Community 31 - "Producer Build Digest"
Cohesion: 0.18
Nodes (11): buildDigest, moduleVersion, $ref, producerBuild, $ref, additionalProperties, properties, required (+3 more)

### Community 32 - "Package Export Map"
Cohesion: 0.20
Nodes (10): default, require, types, exports, ./auth, ./node, ./package.json, default (+2 more)

### Community 33 - "Contribution Pack Generator"
Cohesion: 0.22
Nodes (7): canonicalSchema, check, root, schema, schemaModulePath, schemaPath, typesPath

### Community 34 - "Contribution Value Object"
Cohesion: 0.25
Nodes (8): provenance, semanticId, value, additionalProperties, required, type, contributionValue, required

### Community 35 - "Blank Value Review Signals"
Cohesion: 0.29
Nodes (8): reviewSignals, state, additionalProperties, required, type, blankValue, required, required

### Community 36 - "Runtime Dependencies"
Cohesion: 0.29
Nodes (7): ajv, ajv-formats, json-canonicalize, dependencies, ajv, ajv-formats, json-canonicalize

### Community 37 - "NPM Build Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, check:generated, generate:contracts, prepare, test, typecheck

### Community 38 - "Contribution Value Provenance"
Cohesion: 0.15
Nodes (13): properties, presentValue, additionalProperties, properties, type, provenance, semanticId, value (+5 more)

### Community 39 - "Income Tax Form Inputs Schema"
Cohesion: 0.05
Nodes (43): formInputs, type, type, type, type, additionalProperties, description, properties (+35 more)

### Community 40 - "Tax Band Category Groups"
Cohesion: 0.12
Nodes (17): additionalProperties, properties, required, type, items, type, dividends, nonSavings (+9 more)

### Community 41 - "Stateless Result Schema 1.1.0"
Cohesion: 0.05
Nodes (39): additionalProperties, description, description, minLength, type, description, items, type (+31 more)

### Community 42 - "Renderer Font Manifest"
Cohesion: 0.40
Nodes (4): fonts, NotoSans-Regular.ttf, NotoSansSC-Regular.otf, reviewerSource

### Community 43 - "Calculation Request Schema 1.1.0"
Cohesion: 0.06
Nodes (30): additionalProperties, $defs, taxYear, description, $ref, $id, formInputs, rateJurisdiction (+22 more)

### Community 44 - "Engine Name & Version"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 45 - "Instant Timestamp Format"
Cohesion: 0.50
Nodes (4): instant, format, pattern, type

### Community 46 - "Income Tax Result Fields"
Cohesion: 0.10
Nodes (20): description, $ref, $ref, $ref, properties, $ref, $ref, ageRelatedMarriedCouplesAllowanceRelief (+12 more)

### Community 47 - "Tax Band Category Groups"
Cohesion: 0.12
Nodes (17): additionalProperties, properties, required, type, items, type, dividends, nonSavings (+9 more)

### Community 48 - "Income Tax Required Fields"
Cohesion: 0.12
Nodes (16): required, bands, dividendTax, engine, foreignTaxCredit, netIncomeTaxDue, nonSavingsTax, payeDeducted (+8 more)

### Community 50 - "Income Tax Result Fields"
Cohesion: 0.10
Nodes (20): description, $ref, $ref, $ref, properties, $ref, $ref, ageRelatedMarriedCouplesAllowanceRelief (+12 more)

### Community 51 - "Bucket Slice Properties"
Cohesion: 0.22
Nodes (9): additionalProperties, description, required, type, bucketSlice, bucket, rate, tax (+1 more)

### Community 52 - "Compat Schema Tests"
Cohesion: 0.14
Nodes (10): ENGINE_INPUT_NAMES, moneyBucket(), pdfBoxMapping, rendererManifest, requestSchemaV1, requestSchemaV1_1, resultSchemaV1, resultSchemaV1_1 (+2 more)

### Community 53 - "Income Tax Result Defs"
Cohesion: 0.18
Nodes (11): $defs, incomeTaxResult, moneyString, sha256, additionalProperties, type, description, pattern (+3 more)

### Community 54 - "Engine Name & Version"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 55 - "Tax Band Enum Values"
Cohesion: 0.20
Nodes (10): enum, additional, advanced, allowance, basic, higher, intermediate, psa (+2 more)

### Community 56 - "Band Category Requirements"
Cohesion: 0.29
Nodes (7): additionalProperties, required, type, dividends, nonSavings, savings, bands

### Community 57 - "Band Category Items"
Cohesion: 0.20
Nodes (10): properties, items, type, items, type, dividends, nonSavings, savings (+2 more)

### Community 58 - "Calculation Request Schema 1.0.0"
Cohesion: 0.06
Nodes (30): additionalProperties, $defs, taxYear, description, $ref, $id, formInputs, rateJurisdiction (+22 more)

### Community 59 - "Engine Name & Version"
Cohesion: 0.18
Nodes (11): additionalProperties, properties, required, type, name, version, type, engine (+3 more)

### Community 60 - "Contracts Package Readme"
Cohesion: 0.29
Nodes (6): Adoption rule, Current role in the workspace, `@firstlot/platform-contracts`, Ownership model, What belongs here, What must stay out

### Community 61 - "Rate Jurisdiction Enum"
Cohesion: 0.33
Nodes (6): rUK, scottish, welsh, rateJurisdiction, description, enum

### Community 62 - "Not Applicable Value Schema"
Cohesion: 0.40
Nodes (5): notApplicableValue, additionalProperties, properties, required, type

### Community 63 - "Rate Jurisdiction Enum"
Cohesion: 0.40
Nodes (5): rUK, welsh, rateJurisdiction, description, enum

### Community 64 - "Browser Export Entry"
Cohesion: 0.50
Nodes (4): default, require, types, ./browser

### Community 65 - "Tax Bucket Rate Fields"
Cohesion: 0.20
Nodes (10): description, properties, bucket, rate, tax, taxable, description, type (+2 more)

### Community 66 - "Bucket Slice Properties"
Cohesion: 0.22
Nodes (9): additionalProperties, description, required, type, bucketSlice, bucket, rate, tax (+1 more)

### Community 67 - "Income Tax Result Hash Defs"
Cohesion: 0.29
Nodes (7): $defs, incomeTaxResult, sha256, additionalProperties, type, pattern, type

### Community 68 - "Money String Format"
Cohesion: 0.50
Nodes (4): moneyString, description, pattern, type

### Community 69 - "Rate Jurisdiction Enum"
Cohesion: 0.33
Nodes (6): rUK, scottish, welsh, rateJurisdiction, description, enum

### Community 70 - "Child Benefit Charge Ref"
Cohesion: 0.67
Nodes (3): description, $ref, childBenefitCharge

### Community 71 - "Foreign Tax Deducted Ref"
Cohesion: 0.67
Nodes (3): description, $ref, foreignTaxDeducted

### Community 72 - "Gift Aid Relief Ref"
Cohesion: 0.67
Nodes (3): description, $ref, giftAidBasicRateRelief

### Community 73 - "Lloyds Underwriting Tax Ref"
Cohesion: 0.67
Nodes (3): description, $ref, lloydsUnderwritingTaxPaid

### Community 74 - "Marriage Allowance Relief Ref"
Cohesion: 0.67
Nodes (3): description, $ref, marriageAllowanceRelief

### Community 75 - "Other Income Tax Paid Ref"
Cohesion: 0.67
Nodes (3): description, $ref, otherIncomeTaxPaid

### Community 76 - "Partnership Tax Paid Ref"
Cohesion: 0.67
Nodes (3): description, $ref, partnershipTaxPaid

### Community 77 - "Property Finance Costs Relief"
Cohesion: 0.67
Nodes (3): propertyFinanceCostsRelief, description, $ref

### Community 78 - "Property Income Tax Paid Ref"
Cohesion: 0.67
Nodes (3): propertyIncomeTaxPaid, description, $ref

### Community 79 - "Self Employment Tax Paid Ref"
Cohesion: 0.67
Nodes (3): selfEmploymentTaxPaid, description, $ref

### Community 80 - "State Pension Lump Sum Charge"
Cohesion: 0.67
Nodes (3): statePensionLumpSumCharge, description, $ref

### Community 81 - "Winter Fuel Payment Charge"
Cohesion: 0.67
Nodes (3): winterFuelPaymentCharge, description, $ref

### Community 85 - "ULID Pattern Format"
Cohesion: 0.67
Nodes (3): ulid, pattern, type

### Community 91 - "Child Benefit Charge Ref"
Cohesion: 0.67
Nodes (3): description, $ref, childBenefitCharge

### Community 92 - "Foreign Tax Deducted Ref"
Cohesion: 0.67
Nodes (3): description, $ref, foreignTaxDeducted

### Community 93 - "Gift Aid Relief Ref"
Cohesion: 0.67
Nodes (3): description, $ref, giftAidBasicRateRelief

### Community 97 - "Lloyds Underwriting Tax Ref"
Cohesion: 0.67
Nodes (3): description, $ref, lloydsUnderwritingTaxPaid

### Community 98 - "Marriage Allowance Relief Ref"
Cohesion: 0.67
Nodes (3): description, $ref, marriageAllowanceRelief

### Community 99 - "Other Income Tax Paid Ref"
Cohesion: 0.67
Nodes (3): description, $ref, otherIncomeTaxPaid

### Community 100 - "Partnership Tax Paid Ref"
Cohesion: 0.67
Nodes (3): description, $ref, partnershipTaxPaid

### Community 101 - "Property Finance Costs Relief"
Cohesion: 0.67
Nodes (3): propertyFinanceCostsRelief, description, $ref

### Community 102 - "Property Income Tax Paid Ref"
Cohesion: 0.67
Nodes (3): propertyIncomeTaxPaid, description, $ref

### Community 103 - "Self Employment Tax Paid Ref"
Cohesion: 0.67
Nodes (3): selfEmploymentTaxPaid, description, $ref

### Community 104 - "State Pension Lump Sum Charge"
Cohesion: 0.67
Nodes (3): statePensionLumpSumCharge, description, $ref

### Community 105 - "Winter Fuel Payment Charge"
Cohesion: 0.67
Nodes (3): winterFuelPaymentCharge, description, $ref

### Community 115 - "BFF Request Binding Headers"
Cohesion: 0.11
Nodes (14): BFF_CSP_NONCE_HEADER, BFF_CSRF_COOKIE, BFF_CSRF_HEADER, BFF_FORWARDED_PATH_HEADER, BFF_REQUEST_BINDING_HEADER, BFF_REQUEST_BINDING_ISS, BffRequestBindingEnvelope, ExchangeDownstreamRequest (+6 more)

### Community 116 - "Gateway Token Class Policy"
Cohesion: 0.16
Nodes (12): canonicalizeClaimKey(), GATEWAY_SIGNING_KEY_STATES, isForbiddenClaimKey(), isOneTimeUsePurpose(), isPublishedKeyState(), isPurposeAllowedForClass(), isValidRoleSet(), JTI_MIN_ENTROPY_BITS (+4 more)

### Community 117 - "Via-Claim Actor Rules"
Cohesion: 0.18
Nodes (11): B1_EXCHANGE_VIA_CLAIM, B1_VIA_EXEMPT_CALLERS, deniesMutationForViaCaller(), FORBIDDEN_ACTOR_CLAIM_KEYS, isMutatingMethod(), MUTATING_HTTP_METHODS, SERVICE_PRINCIPAL_IDS, ServicePrincipalId (+3 more)

### Community 118 - "Step-Up Token Claim Checks"
Cohesion: 0.13
Nodes (13): findForbiddenStepUpOnlyClaim(), findMissingOrMalformedB1DownstreamClaim(), findMissingOrMalformedClaim(), findMissingOrMalformedStepUpClaim(), REQUIRED_GATEWAY_TOKEN_CLAIMS, REQUIRED_STEP_UP_TOKEN_CLAIMS, SessionIntrospectionResult, STEP_UP_HEADER (+5 more)

### Community 120 - "Contribution Route Manifest"
Cohesion: 0.40
Nodes (4): ContributionRouteManifestEntry, matchContributionRoute(), ONE_TIME_USE_PURPOSES, manifest

## Knowledge Gaps
- **723 isolated node(s):** `ParticipantResolveRequestBase`, `Assert`, `_ExcludedFromActor`, `_StillATokenPurpose`, `HeadroomNicBand` (+718 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 753 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `$defs` connect `Shared Schema Definitions` to `Contribution Value Object`, `Blank Value Review Signals`, `Contribution Value Provenance`, `Contribution Pack Schema 1.0.0`, `Producer Provenance Schema`, `Contribution Pack Producer Fields`, `Instant Timestamp Format`, `Review Signal Codes`, `ULID Pattern Format`, `Readiness State Schema`, `Contract Identity Schema`, `Versioned Artifact Schema`, `Not Applicable Value Schema`, `Producer Build Digest`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `properties` connect `Income Tax Result Fields` to `Calculation Result Schema 1.2.0`, `Tax Band Category Groups`, `Engine Name & Version`, `Rate Jurisdiction Enum`, `Total Gross Income Schema`, `Child Benefit Charge Ref`, `Foreign Tax Deducted Ref`, `Gift Aid Relief Ref`, `Lloyds Underwriting Tax Ref`, `Marriage Allowance Relief Ref`, `Other Income Tax Paid Ref`, `Partnership Tax Paid Ref`, `Property Finance Costs Relief`, `Property Income Tax Paid Ref`, `Self Employment Tax Paid Ref`, `State Pension Lump Sum Charge`, `Winter Fuel Payment Charge`, `Net Income Tax Due Schema`, `PAYE Deducted Schema`, `Savings Tax Deducted Schema`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `$defs` connect `Calculation Result Schema 1.2.0` to `Tax Bucket Slice Enums`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `ParticipantResolveRequestBase`, `Assert`, `_ExcludedFromActor` to the rest of the system?**
  _723 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Account & Person Core Types` be split into smaller, more focused modules?**
  _Cohesion score 0.0669710806697108 - nodes in this community are weakly interconnected._
- **Should `Authorization Decision Model` be split into smaller, more focused modules?**
  _Cohesion score 0.061016949152542375 - nodes in this community are weakly interconnected._
- **Should `Filing Contribution Pack Validation` be split into smaller, more focused modules?**
  _Cohesion score 0.06988120195667366 - nodes in this community are weakly interconnected._