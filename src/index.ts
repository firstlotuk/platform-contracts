// Platform auth contracts (0.5.5 Stage 1) — types + canonical contract values
export type {
  GatewayAudience,
  PlatformRole,
  AuthLoginProvider,
  TokenClass,
  TokenPurpose,
  TokenSource,
  PermissionAction,
  GatewayActor,
  LegacyIdentityLink,
  VerificationFreshness,
  VerifiedActorContext,
  ActorTokenClass,
  ActorTokenPurpose,
  SessionIntrospectionResult,
  SensitiveOperation,
  RecoveryCompletionOperation,
  RequiredTokenClaim,
  RequiredGatewayTokenClaim,
  ForbiddenActorClaimKey,
  // Stage 3A signer/verifier contract surface
  GatewaySigningKeyState,
  JwksPublishedKeyState,
  OneTimeUsePurpose,
  VerifyOptions,
  // D-004 service-principal contract surface
  ServicePrincipalId,
  ServiceTokenPurpose,
  ServicePrincipal,
  VerifiedServiceContext,
  RequiredServiceTokenClaim,
  ForbiddenServiceActorClaimKey,
  // D-009 Phase C action-vocab reconciliation
  ServiceOnly,
  // D-010 S1 BFF / downstream-exchange contract surface
  BffRequestBindingIss,
  RequiredB1DownstreamClaim,
  BffRequestBindingEnvelope,
  RequiredB2BindingClaim,
  ForbiddenB2BindingClaimKey,
  MutatingHttpMethod,
  ExchangeDownstreamRequest,
  ExchangeDownstreamResponse,
  // d023 S1 step-up re-auth contract surface
  VerifiedStepUpProof,
  StepUpIntrospectionResult,
  StepUpHeader,
  RequiredStepUpTokenClaim,
  StepUpOnlyClaimKey,
  // d024 — B1 exchange-caller provenance (`via`)
  B1ExchangeViaClaim,
} from './auth';
export {
  GATEWAY_AUDIENCES,
  PLATFORM_ROLES,
  AUTH_LOGIN_PROVIDERS,
  TOKEN_CLASSES,
  TOKEN_PURPOSES,
  TOKEN_SOURCES,
  PERMISSION_ACTIONS,
  AUTH_TOKEN_POLICY,
  SENSITIVE_OPERATIONS,
  RECOVERY_COMPLETION_OPERATIONS,
  REQUIRED_TOKEN_CLAIMS,
  REQUIRED_GATEWAY_TOKEN_CLAIMS,
  findMissingOrMalformedClaim,
  FORBIDDEN_ACTOR_CLAIM_KEYS,
  // Stage 3A signer/verifier contract surface
  GATEWAY_SIGNING_KEY_STATES,
  JWKS_PUBLISHED_KEY_STATES,
  isPublishedKeyState,
  TOKEN_CLASS_TTL_SECONDS,
  TOKEN_CLASS_MAX_CLOCK_SKEW_SECONDS,
  TOKEN_CLASS_PURPOSE_MATRIX,
  isPurposeAllowedForClass,
  ONE_TIME_USE_PURPOSES,
  isOneTimeUsePurpose,
  JTI_MIN_ENTROPY_BITS,
  isValidRoleSet,
  canonicalizeClaimKey,
  isForbiddenClaimKey,
  scanForbiddenClaims,
  // D-004 service-principal contract surface
  SERVICE_PRINCIPAL_IDS,
  isKnownServicePrincipalId,
  SERVICE_PRINCIPAL_TOKEN_PURPOSES,
  isServiceTokenClass,
  isActorTokenClass,
  isServiceTokenPurpose,
  REQUIRED_SERVICE_TOKEN_CLAIMS,
  findMissingOrMalformedServiceClaim,
  FORBIDDEN_SERVICE_ACTOR_CLAIM_KEYS,
  findForbiddenServiceActorClaim,
  isIntrospectionCaller,
  // D-009 Phase C action-vocab reconciliation (PLATFORM_SECURITY_BASELINE §10 / AUTHORIZATION_MODEL §4)
  isPermissionAction,
  SERVICE_ONLY,
  SENSITIVE_OPERATION_ACTION_MAP,
  isSensitiveOperation,
  sensitiveOperationAction,
  isServiceOnlyOperation,
  findOrphanedSensitiveOperation,
  // D-010 S1 BFF / downstream-exchange contract surface
  BFF_REQUEST_BINDING_ISS,
  REQUIRED_B1_DOWNSTREAM_CLAIMS,
  findMissingOrMalformedB1DownstreamClaim,
  REQUIRED_B2_BINDING_CLAIMS,
  FORBIDDEN_B2_BINDING_CLAIM_KEYS,
  MUTATING_HTTP_METHODS,
  findMissingOrMalformedBffBindingClaim,
  findForbiddenBffBindingClaim,
  // d023 S1 step-up re-auth contract surface
  STEP_UP_HEADER,
  REQUIRED_STEP_UP_TOKEN_CLAIMS,
  findMissingOrMalformedStepUpClaim,
  STEP_UP_ONLY_CLAIM_KEYS,
  findForbiddenStepUpOnlyClaim,
  // d024 — B1 exchange-caller provenance (`via`)
  B1_EXCHANGE_VIA_CLAIM,
  B1_VIA_EXEMPT_CALLERS,
  shouldStampExchangeCaller,
  findForbiddenViaClaim,
  isMutatingMethod,
  deniesMutationForViaCaller,
} from './auth';

// D-009 Phase D — the PDP front door (AUTHORIZATION_MODEL §2; in-process library, D0.6)
export type {
  DenyReason,
  MaskKind,
  MaskSpec,
  StepUpObligations,
  Decision,
  ResourceRef,
  ActingContext,
  AuthorizeContext,
  ResolvedAuthorizeInput,
  PolicyFn,
  ResponseClass,
  DecisionOutcome,
} from './authz';
export {
  DENY_REASONS,
  MASK_KINDS,
  allow,
  deny,
  allowWithMasking,
  allowReadonly,
  requireStepUp,
  grantsAccess,
  isAuthFresh,
  STEP_UP_MAX_AUTH_AGE_SECONDS,
  authorize,
  isDecision,
  isMaskSpec,
  RESPONSE_CLASSES,
  requireDecision,
} from './authz';

// D-011 S1 — durable-identity authorization vocabulary (case_participant)
export type {
  CaseRole,
  ParticipantStatus,
  CaseParticipant,
  ParticipantResolveSensitivity,
  ParticipantResolveRequest,
  ParticipantResolution,
  ParticipantResolutionStatus,
} from './case-participant';
export {
  CASE_ROLES,
  isCaseRole,
  PARTICIPANT_STATUSES,
  isParticipantStatus,
  PARTICIPANT_RESOLVE_SENSITIVITIES,
  PARTICIPANT_RESOLUTION_STATUSES,
  roleStatusEntitlement,
  participantDecision,
} from './case-participant';

// Filing hub ↔ child app boundary
export type {
  ChildAppId,
  ChildAppStatusValue,
  FilingContext,
  ChildAppStatus,
  SuiteAppAccess,
} from './filing';

// Shared structured review item (cgt-app + income-app)
export type { ReviewItemSummary } from './review';

// Investment Tax App (cgt-app) output contract
export type {
  InvestmentTaxFactSummary,
  InvestmentTaxFilingArtifacts,
  ComputationDossierSummary,
  InvestmentTaxAppOutput,
} from './investment-tax';

// Income Tax App (income-app) output contract
export type {
  IncomeTaxFactSummary,
  IncomeTaxFilingArtifacts,
  IncomeTaxAppOutput,
} from './income-tax';

// Deprecated alias — see ./summaries
export type { CgtFactSummary } from './summaries';

// Accountant engagement boundary — AccountantTask + Opinion (Tier 1 + Tier 2 domain types)
export type {
  AccountantTaskId,
  OpinionId,
  AccountantId,
  SnapshotId,
  FactId,
  AccountantTaskType,
  AccountantTaskState,
  OpinionStrength,
  SnapshotRef,
  AssignedAccountant,
  AccountantTaskRow,
  OpinionRow,
  OpinionFreshness,
} from './accountant';

// Triage / rule-engine binding contracts (D-001 I2)
export type {
  FactValue,
  FactSet,
  FactAssembly,
  PersonCoreSlice,
  ScopeFanout,
  PersonFactFanout,
  TriageResultFanout,
} from './triage-binding';
export { assembleFactSet } from './triage-binding';

// Consent-authority V1 contract (0.5.x-consent-authority-v1 Part C)
export type {
  ConsentKind,
  ConsentAction,
  ConsentAuthLevel,
  ConsentResourceKind,
  ConsentAuditEvent,
  ConsentStatus,
  ConsentEventKind,
  LegalArtifactRef,
  ConsentEvidence,
  ConsentScope,
  ConsentEventEnvelope,
  ConsentEvent,
  ConsentProjection,
  ConsentStatusQuery,
  ConsentStatusResult,
  DataTag,
  ExportItem,
  ExportBundle,
  EraseMode,
  EraseResult,
  InventoryReport,
  SubjectDataHandler,
} from './consent';
export {
  CONSENT_KINDS,        isConsentKind,
  CONSENT_ACTIONS,      isConsentAction,
  CONSENT_AUTH_LEVELS,  isConsentAuthLevel,
  CONSENT_RESOURCE_KINDS,
  CONSENT_AUDIT_EVENTS,
  CONSENT_STATUSES,
  CONSENT_EVENT_KINDS,
  CONSENT_CACHE_SLA,
  CONSENT_ACTION_RECONCILIATION_MAP,
  isRevocable,
  hasBoundScope,
  CONSENT_KIND_ACTION_POLICY,
  isValidKindActionPair,
} from './consent';

// Headroom Engine V1 contract seam (D-014 ARCH-1, Stage 0 / D-004 … D-006)
export type {
  DecimalString,
  TaxYear,
  HeadroomBaselineInput,
  HeadroomScenarioInput,
  HeadroomBand,
  BandMovement,
  HeadroomTrace,
  HeadroomResult,
} from './headroom';
export {
  asDecimal,
  asTaxYear,
  isTaxYear,
  TAX_YEAR_PATTERN,
} from './headroom';
