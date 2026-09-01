/**
 * person-core registry wire contract — platform account/institution registry (d067 S1).
 *
 * Source of truth:
 *   specs/implementation/council/0.9.x-d067-person-core-account-registry/00-owner-decision.md
 *     §1–§6 (owner ruling: L1 person-core service, single-writer `person_core` DB, API-only access)
 *   specs/implementation/council/0.9.x-d067-person-core-account-registry/0.9.x/02-approved-implementation-plan.md
 *     Q1/D-001/D-002/D-016 (person ≠ user, joint ownership), Q2/D-003/D-005/D-006 (schema, id shape,
 *     type mapping, BANK revival), Q3/D-004 (merge + complete consumer-remap contract),
 *     Q4/D-007 (this module; ingestion pairing), Q7/D-008 (versioned read model, §14.4 carrier),
 *     Q8/D-009 (B1 actor resolution — service-side, not typed here), §7 amendments F2/F3/F6.
 *   specs/platform/PERSON_CORE_DATA_DESIGN.md §8 + §14.1–14.5 (binding on the d067 build).
 *
 * SCOPE (S1): the pure wire-contract vocabulary ONLY — entity shapes, closed vocabularies with
 * fail-closed guards, resolve/merge/CRUD request-response DTOs, and the registry version/event
 * types. No Ajv, no runtime imports, no service wiring: this module lives in the BROWSER barrel
 * (`./browser`), so it must stay legal for client components, Edge middleware, and plain-Node
 * build tooling alike (FIR-579/584 runtime-domain boundary — never add a heavy runtime import or
 * a `server-only` guard here).
 *
 * ⚠ FLAGGED — deliberately NOT changed in this module (plan D-011; owner-gated closed sets):
 *   - `auth.ts` `SERVICE_PRINCIPAL_IDS` needs `svc-person-core`, and the canonical `person-core`
 *     audience needs adding — both are auth-spec-owner changes, raised in the S1 PR, not made here.
 *   - `consent.ts` `CONSENT_RESOURCE_KINDS` and the mandate scope enum will eventually need an
 *     account/registry resource kind (B4 legal-blocked; seam reserved, nothing shipped).
 *
 * Key invariants carried by these types (enforced service-side; the contract documents them):
 *  - Ids are OPAQUE strings: UUIDv7 minted by the service (D-003). ONE namespace per entity type;
 *    no `source` discriminator anywhere — cgt's user/system UNION ambiguity (owner ruling §6.3)
 *    is explicitly not inherited. Consumers never parse, order, or validate id shape.
 *  - Resolve NEVER silent-creates: an ambiguous match is an EXPLICIT result variant (S3).
 *  - Merge never touches consumer domain tables: reads never break (tombstones), app-local
 *    ids-only maps absorb remaps via the `merged` event (Q3).
 *  - Every write bumps the per-sub monotonic `registry_version` in the same transaction and
 *    appends a `registry_event` row — the §14.4 invalidation carrier (Q7).
 *  - Requests never name the user: every handler keys on the gateway-verified B1 actor's `sub`
 *    (Q8 / d065); there is deliberately no `sub` field on write requests.
 */

// ---------------------------------------------------------------------------
// Branded ids (D-003) — opaque, service-minted UUIDv7 strings
// ---------------------------------------------------------------------------
// Branded so call sites can't cross registry id spaces. The UUIDv7 shape is a
// service-side minting detail — documented, NOT validated by consumers (ids are
// opaque; no format guard is exported on purpose).

export type RegistryPersonId      = string & { readonly __brand: 'RegistryPersonId' };
export type RegistryInstitutionId = string & { readonly __brand: 'RegistryInstitutionId' };
export type RegistryAccountId     = string & { readonly __brand: 'RegistryAccountId' };

// ---------------------------------------------------------------------------
// Person (Q1 — D-001/D-002/D-016): person ≠ user, resolved minimally
// ---------------------------------------------------------------------------

/**
 * The two person kinds in slice 1 (D-001). `household_member` exists because income's
 * `owner='joint'` rows are in migrated content — a joint co-owner (spouse) may not be a
 * platform user at all. CLOSED; unknown values fail closed.
 */
export const PERSON_KINDS = ['platform_user', 'household_member'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

/** True only if `s` is in the closed {@link PERSON_KINDS} vocabulary (fail-closed lookup). */
export function isPersonKind(s: unknown): s is PersonKind {
  return typeof s === 'string' && (PERSON_KINDS as readonly string[]).includes(s);
}

/**
 * A person in the registry (D-001). A `platform_user` person links to a gateway identity via
 * `sub`; a `household_member` person has `sub: null` — no login, no consent surface, and **no
 * independent API surface in slice 1**: it is reachable ONLY through accounts co-owned with the
 * requesting `sub` (privacy scoping, D-016). The only person-management surface shipped is
 * naming a joint co-owner at ownership-split time ({@link AccountOwnershipSplitInput}).
 */
export interface Person {
  id: RegistryPersonId;
  /** Gateway `sub` for a `platform_user`; `null` for a `household_member` (unique when present). */
  sub: string | null;
  displayName: string;
  kind: PersonKind;
  /** ISO-8601, service-set. */
  createdAt: string;
  /** ISO-8601, service-set. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Institution (Q2 — D-006/D-010)
// ---------------------------------------------------------------------------

/**
 * Institution kind — **BANK revived** (D-006): both live app schemas already carry BANK in
 * their CHECK/enum; the defect was cgt's automated import paths hardcoding BROKER (fixed at
 * S6 integration, not by widening this set). CLOSED.
 */
export const INSTITUTION_KINDS = ['BANK', 'BROKER', 'BOTH'] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/** True only if `s` is in the closed {@link INSTITUTION_KINDS} vocabulary (fail-closed lookup). */
export function isInstitutionKind(s: unknown): s is InstitutionKind {
  return typeof s === 'string' && (INSTITUTION_KINDS as readonly string[]).includes(s);
}

/**
 * Institution lifecycle status. `merged` is reachable ONLY via the merge operation (Q3),
 * never via update. CLOSED.
 */
export const INSTITUTION_STATUSES = ['active', 'archived', 'merged'] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];

/** True only if `s` is in the closed {@link INSTITUTION_STATUSES} vocabulary (fail-closed lookup). */
export function isInstitutionStatus(s: unknown): s is InstitutionStatus {
  return typeof s === 'string' && (INSTITUTION_STATUSES as readonly string[]).includes(s);
}

/**
 * A user-scoped institution (Q2). Institutions are `sub`-scoped (joint concerns live on
 * accounts, not institutions). The registry splits what cgt's `user_institutions` conflates —
 * institution facts here, account facts on {@link Account}.
 */
export interface Institution {
  id: RegistryInstitutionId;
  /** Owning gateway `sub` — institutions are user-scoped (Q2). */
  ownerSub: string;
  name: string;
  kind: InstitutionKind;
  /**
   * ISO-3166-1 alpha-2 (CHAR(2)), e.g. `'GB'`. Amendment F2: legacy cgt values are varchar(3)
   * `'UK'`-style — migration applies an explicit mapping table (`UK→GB` et al.); unmappable
   * values land on the migration report, never guessed. Not validated here (service-side).
   */
  country: string;
  website: string | null;
  /**
   * MyAccount credential-vault provenance (owner ruling §3). The credential is
   * institution-scoped; the vault holds NO account identifiers, so "connected" accounts are
   * discovered from import files / first sync — never joined from the vault. `null` for
   * manual institutions.
   */
  connectionId: string | null;
  /**
   * Opaque seam to the global `system_institutions` catalogue (D-010). The catalogue DATA
   * stays in cgt for slice 1; placement is an admin-console-owner decision. Consumers treat
   * this as an opaque token — never parse or join on it.
   */
  catalogueRef: string | null;
  status: InstitutionStatus;
  /** Terminal merge target — present iff `status === 'merged'` (tombstone read, Q3.1). */
  mergedIntoId: RegistryInstitutionId | null;
  /** ISO-8601, service-set. */
  createdAt: string;
  /** ISO-8601, service-set. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Account (Q2 — D-003/D-005; amendments F2/F3)
// ---------------------------------------------------------------------------

/**
 * Closed account-type enum (D-005), unifying cgt's free-text `account_type` and income's
 * `uk_current/uk_savings/broker/isa/pension/foreign_bank`. Foreign-ness moves to the
 * `country` axis — NEVER onto this type: income's `foreign_bank` folds to `other` + captured
 * country (NULL-country foreign rows are QUARANTINED at migration, never landed as
 * `other`+NULL). Amendment F3: cgt's legacy `account_type` is NULL on 100% of real rows —
 * NULL maps to `other` plus a `type_unmapped` migration-report line; no types are fabricated
 * and this enum stays closed.
 */
export const ACCOUNT_TYPES = ['current', 'savings', 'brokerage', 'isa', 'pension', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** True only if `s` is in the closed {@link ACCOUNT_TYPES} vocabulary (fail-closed lookup). */
export function isAccountType(s: unknown): s is AccountType {
  return typeof s === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(s);
}

/**
 * Account lifecycle status. `merged` is reachable ONLY via the merge operation (Q3), never
 * via update. CLOSED.
 */
export const ACCOUNT_STATUSES = ['active', 'closed', 'suspended', 'merged'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** True only if `s` is in the closed {@link ACCOUNT_STATUSES} vocabulary (fail-closed lookup). */
export function isAccountStatus(s: unknown): s is AccountStatus {
  return typeof s === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(s);
}

/** How an account row came to exist. CLOSED. */
export const ACCOUNT_ORIGINS = ['manual', 'import', 'connected_sync'] as const;
export type AccountOrigin = (typeof ACCOUNT_ORIGINS)[number];

/** True only if `s` is in the closed {@link ACCOUNT_ORIGINS} vocabulary (fail-closed lookup). */
export function isAccountOrigin(s: unknown): s is AccountOrigin {
  return typeof s === 'string' && (ACCOUNT_ORIGINS as readonly string[]).includes(s);
}

/**
 * Migration provenance + idempotency key (Q2). Written once by the S6/S7 content migrations;
 * `null` on natively created rows. Originals are always preserved here — nothing is
 * re-guessed (§14.3 disposition).
 */
export interface AccountMigrationProvenance {
  /** Source app of the migrated row. */
  app: 'cgt-app' | 'income-app';
  /** Source table, e.g. `user_institutions` / `accounts`. */
  table: string;
  /** Source primary key, stringified. */
  localId: string;
  /**
   * The source row's original type value, verbatim. Amendment F3: `null` for cgt rows whose
   * legacy `account_type` was NULL (registry type = `other`, `type_unmapped` report line).
   */
  originalType: string | null;
  /**
   * D-005: `true` when `country='GB'` was DERIVED from the literal `uk_` prefix of the legacy
   * income type — a source fact, not a guess.
   */
  derivedCountry?: boolean;
}

/**
 * An account at an institution (Q2). Ownership (including joint splits) lives on
 * {@link AccountOwnership} rows, never inline here.
 */
export interface Account {
  id: RegistryAccountId;
  institutionId: RegistryInstitutionId;
  displayName: string;
  accountType: AccountType;
  /** ISO-4217 (CHAR(3)), e.g. `'GBP'`. */
  currency: string;
  /**
   * ISO-3166-1 alpha-2 (CHAR(2)) or `null`. The classification-bearing axis for UK-vs-foreign
   * interest (D-005): consumers classify UK ONLY when `country === 'GB'` is affirmatively
   * present (derived or captured); `null` is an explicit attention state (`needs_country`),
   * NEVER silently UK. Amendment F2 mapping discipline applies as on {@link Institution}.
   */
  country: string | null;
  status: AccountStatus;
  /** Terminal merge target — present iff `status === 'merged'` (tombstone read, Q3.1). */
  mergedIntoId: RegistryAccountId | null;
  origin: AccountOrigin;
  /** MyAccount vault provenance — see {@link Institution.connectionId}. */
  connectionId: string | null;
  /** ISO-8601 date or `null`. */
  openedDate: string | null;
  /** ISO-8601 date or `null`. */
  closedDate: string | null;
  /** Migration provenance; `null` on natively created rows. */
  migratedFrom: AccountMigrationProvenance | null;
  /** ISO-8601, service-set. */
  createdAt: string;
  /** ISO-8601, service-set. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// AccountOwnership (Q1 — D-001): joint ownership with split ratios
// ---------------------------------------------------------------------------

/**
 * One person's ownership share of an account (D-001) — generalises income's `owner='joint'` +
 * `split_ratio_a`.
 *
 * INVARIANT (service-enforced, Q2): the `splitRatio` values across ALL ownership rows of one
 * account MUST sum to exactly 1.0 — enforced in the registry by a deferred DB trigger + the
 * API write invariant. This contract documents the invariant; consumers MUST NOT re-validate
 * or "fix up" ratios client-side.
 */
export interface AccountOwnership {
  accountId: RegistryAccountId;
  personId: RegistryPersonId;
  /**
   * This person's share, `0 < splitRatio <= 1`, stored as NUMERIC(5,4) service-side (e.g.
   * `0.5` for an even joint split; `1` for sole ownership). Per-account rows sum to 1.0 —
   * see the interface invariant above.
   */
  splitRatio: number;
}

// ---------------------------------------------------------------------------
// AccountExternalRef (Q2; amendment F6) — matching keys for resolve/dedupe
// ---------------------------------------------------------------------------

/**
 * External-reference kinds carried for matching (Q2): account number, last-4, sort code,
 * IBAN. CLOSED. Uniqueness (service-side): UNIQUE `(accountId, refType, value)`, plus a
 * partial-unique `(owner-scope, refType='account_number', value)` over ACTIVE accounts so
 * auto-attach stays deterministic (mirrors cgt's live unique index).
 */
export const ACCOUNT_EXTERNAL_REF_KINDS = ['account_number', 'last4', 'sort_code', 'iban'] as const;
export type AccountExternalRefKind = (typeof ACCOUNT_EXTERNAL_REF_KINDS)[number];

/** True only if `s` is in the closed {@link ACCOUNT_EXTERNAL_REF_KINDS} vocabulary (fail-closed lookup). */
export function isAccountExternalRefKind(s: unknown): s is AccountExternalRefKind {
  return typeof s === 'string' && (ACCOUNT_EXTERNAL_REF_KINDS as readonly string[]).includes(s);
}

/**
 * A matching key attached to an account.
 *
 * Amendment F6 — PER-SOURCE match precedence (resolve tiers, see {@link ResolveMatchTier}):
 * tier 2 (`last4` + `sort_code`) is applicable only where a sort code can exist — cgt↔cgt
 * matching may use tier 2; income-sourced rows carry NO sort_code, so income-side matching
 * uses tier 1 (`account_number` exact) then tier 3 (normalised name + institution),
 * report-only. Weak matches never auto-link.
 */
export interface AccountExternalRef {
  accountId: RegistryAccountId;
  refType: AccountExternalRefKind;
  value: string;
}

// ---------------------------------------------------------------------------
// Resolve (S3; amendment F6) — matching with an EXPLICIT ambiguous variant
// ---------------------------------------------------------------------------

/**
 * Match tiers in precedence order (S3): `account_number` exact → `last4_sort_code` →
 * `name_institution` (normalised institution name + currency/country). Amendment F6 makes the
 * precedence PER SOURCE — tier 2 is structurally inapplicable when the caller has no sort
 * code (income-sourced identities), and tier-3 matches are report-only in dedupe contexts.
 */
export const RESOLVE_MATCH_TIERS = ['account_number', 'last4_sort_code', 'name_institution'] as const;
export type ResolveMatchTier = (typeof RESOLVE_MATCH_TIERS)[number];

/** True only if `s` is in the closed {@link RESOLVE_MATCH_TIERS} vocabulary (fail-closed lookup). */
export function isResolveMatchTier(s: unknown): s is ResolveMatchTier {
  return typeof s === 'string' && (RESOLVE_MATCH_TIERS as readonly string[]).includes(s);
}

/**
 * `POST /v1/resolve` request (S3): the extracted identity of an account seen in an import
 * file or upload. All keys optional — the service applies whichever tiers the provided keys
 * make applicable (F6). The actor's `sub` scopes the search (Q8); the body never names the
 * user. Resolve is a READ — it NEVER creates (see {@link ResolveAccountResult}).
 */
export interface ResolveAccountRequest {
  /** Full account number (OFX `ACCTID`, Flex `accountId`) — tier 1. */
  accountNumber?: string;
  /** Last four digits — tier 2 (only with {@link ResolveAccountRequest.sortCode}). */
  last4?: string;
  /** UK sort code — tier 2 (only with {@link ResolveAccountRequest.last4}). */
  sortCode?: string;
  /** Institution name as seen at source — tier 3 (normalised service-side). */
  institutionName?: string;
  /** ISO-4217 — tier-3 corroborator. */
  currency?: string;
  /** ISO-3166-1 alpha-2 — tier-3 corroborator. */
  country?: string;
}

/** A candidate surfaced by an `ambiguous` resolve — enough for a picker, nothing more. */
export interface ResolveAccountCandidate {
  accountId: RegistryAccountId;
  institutionId: RegistryInstitutionId;
  displayName: string;
  matchTier: ResolveMatchTier;
}

/** The closed set of resolve outcome discriminants. */
export const RESOLVE_OUTCOMES = ['matched', 'ambiguous', 'no_match'] as const;
export type ResolveOutcome = (typeof RESOLVE_OUTCOMES)[number];

/**
 * `POST /v1/resolve` result (S3). **NEVER a silent create**: `ambiguous` is an EXPLICIT
 * variant surfacing candidates for user/operator choice, and `no_match` hands the decision
 * back to the caller (registry-picker or an explicit {@link CreateAccountRequest}). The
 * registry does not guess.
 */
export type ResolveAccountResult =
  | { outcome: 'matched'; accountId: RegistryAccountId; institutionId: RegistryInstitutionId; matchTier: ResolveMatchTier }
  | { outcome: 'ambiguous'; candidates: readonly ResolveAccountCandidate[] }
  | { outcome: 'no_match' };

/**
 * The registry-side half of the import-identity pair (Q4/D-007): the structural mirror of
 * firstlot-ingestion's `ImportBatch.sourceAccounts` entry (`ExtractedAccountIdentity`
 * `{ accountId?, bankName?, sortCode?, last4?, currency? }` — defined LOCALLY in ingestion,
 * which deliberately has zero runtime deps; neither package imports the other). Resolution of
 * extracted identity → registry ids is the CALLING APP's job via `POST /v1/resolve`; this is
 * what that resolution yields. The pair is documented in both files.
 */
export interface ResolvedAccountIdentity {
  registryAccountId: RegistryAccountId;
  registryInstitutionId: RegistryInstitutionId;
  matchTier: ResolveMatchTier;
}

// ---------------------------------------------------------------------------
// Merge (Q3 — D-004) — service operation + complete consumer-remap contract
// ---------------------------------------------------------------------------
// The remap contract (why cgt's old /merge was structurally incomplete and this is not):
//  1. READS NEVER BREAK — `GET` on a merged id returns the tombstone row
//     (status='merged' + mergedIntoId); list endpoints exclude merged rows by
//     default ({@link ListAccountsRequest.includeMerged}). Lazy consumers stay
//     correct with no action.
//  2. MAPS ABSORB REMAPS — consumer apps keep integer FKs in their domain
//     tables plus an app-local IDS-ONLY map (local_id → registry id; no
//     name/display columns, owner ruling §4). On a `merged` event
//     ({@link RegistryMergedEventPayload}) the app repoints its map rows at the
//     winner. Domain tables are NEVER touched by a merge.
//  3. The registry never writes consumer DBs (§14.1 single-writer).

/**
 * `POST /v1/accounts/{winnerId}/merge` body (Q3). The winner is the path id; the body names
 * the duplicate. In ONE registry transaction: external refs union onto the winner; loser →
 * `status='merged'` + `mergedIntoId=winner`; tombstone retained forever; version bump +
 * `merged` event. Re-merging an already-merged loser is IDEMPOTENT (no-op returning the
 * terminal winner).
 */
export interface AccountMergeRequest {
  /** Mandatory write idempotency key (§14.1) — retry of the same key is a no-op. */
  idempotencyKey: string;
  duplicateId: RegistryAccountId;
}

/** `POST /v1/institutions/{winnerId}/merge` body — same contract as {@link AccountMergeRequest}. */
export interface InstitutionMergeRequest {
  /** Mandatory write idempotency key (§14.1) — retry of the same key is a no-op. */
  idempotencyKey: string;
  duplicateId: RegistryInstitutionId;
}

/**
 * Merge response (Q3). `winnerId` is always the TERMINAL winner — on an idempotent re-merge
 * of an already-merged loser (`alreadyMerged: true`) it is the end of the merge chain, which
 * may differ from the path id the caller addressed.
 */
export interface MergeResponse<Id extends RegistryAccountId | RegistryInstitutionId> {
  winnerId: Id;
  loserId: Id;
  /** `true` iff the loser was already merged — the call was a no-op (idempotent). */
  alreadyMerged: boolean;
  /** The per-sub registry version after this operation (unchanged when `alreadyMerged`). */
  registryVersion: RegistryVersion;
}

/**
 * Payload of a `merged` {@link RegistryEvent} — what consumer apps use to repoint their
 * ids-only local maps at the winner (remap contract item 2). Ids are unbranded here because
 * `entity` discriminates the id space.
 */
export interface RegistryMergedEventPayload {
  entity: 'account' | 'institution';
  loserId: string;
  winnerId: string;
}

// ---------------------------------------------------------------------------
// Registry version + event feed (Q7 — D-008; PERSON_CORE §14.4 carrier)
// ---------------------------------------------------------------------------

/**
 * Per-sub MONOTONIC version (Q7/§14.4): bumped in the same transaction as every write
 * touching that sub's rows. Service-side it is a bigint; as a JSON number it is safe for any
 * realistic per-user write count. `(sub, version)` is the consumer idempotency key.
 */
export type RegistryVersion = number;

/** Entities named on registry events. Ownership/external-ref changes surface as `updated` events on the owning account. CLOSED. */
export const REGISTRY_ENTITY_KINDS = ['person', 'institution', 'account'] as const;
export type RegistryEntityKind = (typeof REGISTRY_ENTITY_KINDS)[number];

/** True only if `s` is in the closed {@link REGISTRY_ENTITY_KINDS} vocabulary (fail-closed lookup). */
export function isRegistryEntityKind(s: unknown): s is RegistryEntityKind {
  return typeof s === 'string' && (REGISTRY_ENTITY_KINDS as readonly string[]).includes(s);
}

/**
 * Registry event kinds. `closed`/`archived` are the lifecycle terminals of account/
 * institution respectively; `merged` carries {@link RegistryMergedEventPayload}. CLOSED.
 */
export const REGISTRY_EVENT_KINDS = ['created', 'updated', 'closed', 'archived', 'merged'] as const;
export type RegistryEventKind = (typeof REGISTRY_EVENT_KINDS)[number];

/** True only if `s` is in the closed {@link REGISTRY_EVENT_KINDS} vocabulary (fail-closed lookup). */
export function isRegistryEventKind(s: unknown): s is RegistryEventKind {
  return typeof s === 'string' && (REGISTRY_EVENT_KINDS as readonly string[]).includes(s);
}

/**
 * One append-only `registry_event` row (Q2/Q7) — the §14.4 invalidation carrier. The feed is
 * at-least-once BY CONSTRUCTION (re-readable); consumers deduplicate idempotently on
 * `(sub, version)`. The S9 rollback delta report is keyed on this feed (every event above the
 * cutover version mark), which is why it must carry updates/closes/merges — not only creates.
 */
export interface RegistryEvent {
  /** The gateway `sub` whose registry this event belongs to. */
  sub: string;
  /** The monotonic per-sub version this write produced. */
  version: RegistryVersion;
  entity: RegistryEntityKind;
  /** The affected entity's id (opaque; `entity` names the id space). */
  entityId: string;
  kind: RegistryEventKind;
  /** Kind-specific payload; a `merged` event carries {@link RegistryMergedEventPayload}. */
  payload: unknown;
  /** ISO-8601, service-set at append time. */
  occurredAt: string;
}

/** `GET /v1/version` response — the ETag-style current version for the actor's sub. */
export interface RegistryVersionResponse {
  sub: string;
  registryVersion: RegistryVersion;
}

/**
 * `GET /v1/events?sub&since_version` query (Q7). `sub` MUST equal the gateway-verified
 * actor's `sub` (Q8) — the service rejects mismatches fail-closed; it exists in the query
 * only because the feed is sub-scoped.
 */
export interface RegistryEventFeedRequest {
  sub: string;
  /** Exclusive lower bound: return events with `version > sinceVersion`. */
  sinceVersion: RegistryVersion;
}

/**
 * Event-feed page. STALENESS SLA (§14.4/§14.5, binding on consumers): any consumer caching
 * registry data MUST re-check the version before persisting or filing a derived FINAL figure;
 * provisional use inside the stale window is allowed. Read-through (non-caching) consumers
 * satisfy this trivially.
 */
export interface RegistryEventFeedResponse {
  sub: string;
  /** The current (latest) version at read time. */
  registryVersion: RegistryVersion;
  events: readonly RegistryEvent[];
}

// ---------------------------------------------------------------------------
// CRUD + list request/response shapes (Q7 read model; §14.1 write discipline)
// ---------------------------------------------------------------------------
// Every write request carries a MANDATORY `idempotencyKey` (§14.1: retry = no-op;
// compensation is reconcile-forward — close/merge — never delete-back). Every
// read response carries the actor's current `registryVersion` (ETag-style, Q7).
// No request names the user: the actor's `sub` comes from the verified B1 token
// (Q8/d065), resolved by the service's authz middleware — that middleware's
// `ResolvedActor` shape is service-internal (S2), deliberately not typed here.

/** `POST /v1/institutions` body. */
export interface CreateInstitutionRequest {
  /** Mandatory write idempotency key (§14.1) — retry of the same key is a no-op. */
  idempotencyKey: string;
  name: string;
  kind: InstitutionKind;
  /** ISO-3166-1 alpha-2 — see {@link Institution.country} (F2 mapping discipline). */
  country: string;
  website?: string | null;
  connectionId?: string | null;
  catalogueRef?: string | null;
}

/**
 * `PATCH /v1/institutions/{id}` body. `status` here excludes `merged` — that state is
 * reachable ONLY via the merge operation (Q3).
 */
export interface UpdateInstitutionRequest {
  /** Mandatory write idempotency key (§14.1) — retry of the same key is a no-op. */
  idempotencyKey: string;
  name?: string;
  kind?: InstitutionKind;
  country?: string;
  website?: string | null;
  connectionId?: string | null;
  catalogueRef?: string | null;
  status?: Exclude<InstitutionStatus, 'merged'>;
}

/** An external-ref input on account create/update (persisted as {@link AccountExternalRef}). */
export interface AccountExternalRefInput {
  refType: AccountExternalRefKind;
  value: string;
}

/**
 * An ownership-split input (D-001/D-016). Either names an existing registry person, or — the
 * ONLY person-creation surface in slice 1 — names a new joint co-owner, which the service
 * materialises as a `household_member` {@link Person} (no `sub`, no login). Split ratios
 * across the submitted set MUST sum to 1.0 (service-enforced; see {@link AccountOwnership}).
 */
export type AccountOwnershipSplitInput =
  | { personId: RegistryPersonId; splitRatio: number }
  | { newHouseholdMember: { displayName: string }; splitRatio: number };

/**
 * `POST /v1/accounts` body. When `ownership` is omitted the service defaults to sole
 * ownership by the acting sub's `platform_user` person. Post-cutover, income's create flow
 * always captures `country` (picker, default GB, D-005) — so `needs_country` classification
 * states are reachable only from unresolved legacy rows.
 */
export interface CreateAccountRequest {
  /** Mandatory write idempotency key (§14.1) — retry of the same key is a no-op. */
  idempotencyKey: string;
  institutionId: RegistryInstitutionId;
  displayName: string;
  accountType: AccountType;
  /** ISO-4217 (CHAR(3)). */
  currency: string;
  /** ISO-3166-1 alpha-2; omit/`null` only where genuinely unknown — see {@link Account.country}. */
  country?: string | null;
  origin: AccountOrigin;
  connectionId?: string | null;
  openedDate?: string | null;
  externalRefs?: readonly AccountExternalRefInput[];
  ownership?: readonly AccountOwnershipSplitInput[];
}

/**
 * `PATCH /v1/accounts/{id}` body. `status` excludes `merged` (merge operation only, Q3);
 * ownership changes replace the full split set atomically (sum-to-1.0 invariant).
 */
export interface UpdateAccountRequest {
  /** Mandatory write idempotency key (§14.1) — retry of the same key is a no-op. */
  idempotencyKey: string;
  displayName?: string;
  accountType?: AccountType;
  currency?: string;
  country?: string | null;
  status?: Exclude<AccountStatus, 'merged'>;
  connectionId?: string | null;
  openedDate?: string | null;
  closedDate?: string | null;
  externalRefs?: readonly AccountExternalRefInput[];
  ownership?: readonly AccountOwnershipSplitInput[];
}

/** `GET /v1/institutions` query. Merged tombstones are EXCLUDED unless `includeMerged` (Q3.1). */
export interface ListInstitutionsRequest {
  includeMerged?: boolean;
}

/** `GET /v1/institutions` response — versioned per Q7. */
export interface ListInstitutionsResponse {
  registryVersion: RegistryVersion;
  institutions: readonly Institution[];
}

/** `GET /v1/institutions/{id}` response. A merged id resolves to its tombstone (Q3.1). */
export interface GetInstitutionResponse {
  registryVersion: RegistryVersion;
  institution: Institution;
}

/** `GET /v1/accounts` query. Merged tombstones are EXCLUDED unless `includeMerged` (Q3.1). */
export interface ListAccountsRequest {
  includeMerged?: boolean;
  /** Optional filter to one institution. */
  institutionId?: RegistryInstitutionId;
}

/** `GET /v1/accounts` response — versioned per Q7. */
export interface ListAccountsResponse {
  registryVersion: RegistryVersion;
  accounts: readonly Account[];
}

/**
 * `GET /v1/accounts/{id}` response. A merged id resolves to its tombstone (Q3.1 — reads
 * never break). `ownership` may surface `household_member` persons ONLY because they co-own
 * this account with the acting sub (D-016 privacy scoping).
 */
export interface GetAccountResponse {
  registryVersion: RegistryVersion;
  account: Account;
  ownership: readonly AccountOwnership[];
  externalRefs: readonly AccountExternalRef[];
}
