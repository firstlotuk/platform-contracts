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
} from './auth';

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
