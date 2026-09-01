/**
 * person-core registry contract tests (d067 S1).
 *
 * Pure contract/unit tests. NO PII, NO network, NO DB. Covers the S1 named surface:
 *
 *  1. Closed vocabularies — exact membership + fail-closed guards (Q2, D-005/D-006; F3/F6)
 *  2. Resolve result — explicit `ambiguous`/`no_match` variants; never a silent-create shape (S3)
 *  3. Merge — request/response + `merged` event payload shapes; idempotency key mandatory (Q3)
 *  4. Version/event carrier — RegistryEvent keyed on (sub, version) (Q7/§14.4)
 *  5. Browser-barrel reachability — the whole surface is exported via `./browser` (Q4/D-007)
 *
 * Out of scope here: the person-core service itself (S2+), migrations, resolve precedence
 * BEHAVIOUR (S3 `resolve.test` in the service), ratio-sum ENFORCEMENT (service-side invariant).
 */

import {
  PERSON_KINDS, isPersonKind,
  INSTITUTION_KINDS, isInstitutionKind,
  INSTITUTION_STATUSES, isInstitutionStatus,
  ACCOUNT_TYPES, isAccountType,
  ACCOUNT_STATUSES, isAccountStatus,
  ACCOUNT_ORIGINS, isAccountOrigin,
  ACCOUNT_EXTERNAL_REF_KINDS, isAccountExternalRefKind,
  RESOLVE_MATCH_TIERS, isResolveMatchTier,
  RESOLVE_OUTCOMES,
  REGISTRY_ENTITY_KINDS, isRegistryEntityKind,
  REGISTRY_EVENT_KINDS, isRegistryEventKind,
} from '../browser';

import type {
  RegistryPersonId,
  RegistryInstitutionId,
  RegistryAccountId,
  Person,
  Institution,
  Account,
  AccountOwnership,
  AccountExternalRef,
  ResolveAccountResult,
  ResolvedAccountIdentity,
  AccountMergeRequest,
  MergeResponse,
  RegistryMergedEventPayload,
  RegistryEvent,
  AccountOwnershipSplitInput,
  CreateAccountRequest,
  GetAccountResponse,
} from '../browser';

// ---------------------------------------------------------------------------
// 1. Closed vocabularies + fail-closed guards
// ---------------------------------------------------------------------------

const NON_MEMBERS = ['', 'UNKNOWN', 'Bank', undefined, null, 0, {}, [], true] as const;

describe('person-core closed vocabularies (Q2) — exact membership, fail-closed guards', () => {
  const vocabularies: Array<[string, readonly string[], string[], (s: unknown) => boolean]> = [
    ['PERSON_KINDS', PERSON_KINDS, ['platform_user', 'household_member'], isPersonKind],
    ['INSTITUTION_KINDS', INSTITUTION_KINDS, ['BANK', 'BROKER', 'BOTH'], isInstitutionKind],
    ['INSTITUTION_STATUSES', INSTITUTION_STATUSES, ['active', 'archived', 'merged'], isInstitutionStatus],
    ['ACCOUNT_TYPES', ACCOUNT_TYPES, ['current', 'savings', 'brokerage', 'isa', 'pension', 'other'], isAccountType],
    ['ACCOUNT_STATUSES', ACCOUNT_STATUSES, ['active', 'closed', 'suspended', 'merged'], isAccountStatus],
    ['ACCOUNT_ORIGINS', ACCOUNT_ORIGINS, ['manual', 'import', 'connected_sync'], isAccountOrigin],
    ['ACCOUNT_EXTERNAL_REF_KINDS', ACCOUNT_EXTERNAL_REF_KINDS, ['account_number', 'last4', 'sort_code', 'iban'], isAccountExternalRefKind],
    ['RESOLVE_MATCH_TIERS', RESOLVE_MATCH_TIERS, ['account_number', 'last4_sort_code', 'name_institution'], isResolveMatchTier],
    ['REGISTRY_ENTITY_KINDS', REGISTRY_ENTITY_KINDS, ['person', 'institution', 'account'], isRegistryEntityKind],
    ['REGISTRY_EVENT_KINDS', REGISTRY_EVENT_KINDS, ['created', 'updated', 'closed', 'archived', 'merged'], isRegistryEventKind],
  ];

  test.each(vocabularies)('%s is exactly the ratified closed set', (_name, actual, expected) => {
    expect([...actual]).toEqual(expected);
  });

  test.each(vocabularies)('%s guard is fail-closed', (_name, actual, _expected, guard) => {
    for (const member of actual) expect(guard(member)).toBe(true);
    for (const bad of NON_MEMBERS) expect(guard(bad)).toBe(false);
  });

  test('D-005: no legacy income type leaks into ACCOUNT_TYPES (foreign-ness lives on country, not type)', () => {
    for (const legacy of ['uk_current', 'uk_savings', 'broker', 'foreign_bank']) {
      expect(isAccountType(legacy)).toBe(false);
    }
  });

  test('D-006: BANK is revived in INSTITUTION_KINDS', () => {
    expect(isInstitutionKind('BANK')).toBe(true);
  });

  test('RESOLVE_OUTCOMES names all three explicit variants — ambiguous is first-class (never silent-create)', () => {
    expect([...RESOLVE_OUTCOMES]).toEqual(['matched', 'ambiguous', 'no_match']);
  });
});

// ---------------------------------------------------------------------------
// 2–4. Shape/compile checks (type-level; values here are inert fixtures)
// ---------------------------------------------------------------------------

const personId = 'p-1' as RegistryPersonId;
const institutionId = 'i-1' as RegistryInstitutionId;
const accountId = 'a-1' as RegistryAccountId;

describe('person-core wire shapes compile as specified', () => {
  test('entities: tombstone fields are nullable pairs; household_member has null sub (D-001/D-016)', () => {
    const member: Person = {
      id: personId,
      sub: null, // household_member: no login, no consent surface
      displayName: 'Co-owner',
      kind: 'household_member',
      createdAt: '2026-08-18T00:00:00Z',
      updatedAt: '2026-08-18T00:00:00Z',
    };
    const inst: Institution = {
      id: institutionId,
      ownerSub: 'sub-1',
      name: 'Example Bank',
      kind: 'BANK',
      country: 'GB',
      website: null,
      connectionId: null,
      catalogueRef: null,
      status: 'active',
      mergedIntoId: null,
      createdAt: '2026-08-18T00:00:00Z',
      updatedAt: '2026-08-18T00:00:00Z',
    };
    const acct: Account = {
      id: accountId,
      institutionId,
      displayName: 'Current account',
      accountType: 'current',
      currency: 'GBP',
      country: 'GB',
      status: 'active',
      mergedIntoId: null,
      origin: 'manual',
      connectionId: null,
      openedDate: null,
      closedDate: null,
      migratedFrom: {
        app: 'income-app',
        table: 'accounts',
        localId: '42',
        originalType: 'uk_current',
        derivedCountry: true, // D-005: GB derived from the literal uk_ prefix
      },
      createdAt: '2026-08-18T00:00:00Z',
      updatedAt: '2026-08-18T00:00:00Z',
    };
    const split: AccountOwnership = { accountId, personId, splitRatio: 1 };
    const ref: AccountExternalRef = { accountId, refType: 'sort_code', value: '01-02-03' };
    expect([member.kind, inst.kind, acct.accountType, split.splitRatio, ref.refType]).toEqual([
      'household_member', 'BANK', 'current', 1, 'sort_code',
    ]);
  });

  test('resolve result is a closed discriminated union with an explicit ambiguous variant (S3)', () => {
    const results: ResolveAccountResult[] = [
      { outcome: 'matched', accountId, institutionId, matchTier: 'account_number' },
      {
        outcome: 'ambiguous',
        candidates: [{ accountId, institutionId, displayName: 'Current account', matchTier: 'name_institution' }],
      },
      { outcome: 'no_match' },
    ];
    // Exhaustive narrowing: a new variant without a handler is a compile error here.
    for (const r of results) {
      switch (r.outcome) {
        case 'matched': expect(r.matchTier).toBe('account_number'); break;
        case 'ambiguous': expect(r.candidates).toHaveLength(1); break;
        case 'no_match': break;
        default: { const never: never = r; throw new Error(`unhandled ${JSON.stringify(never)}`); }
      }
    }
    const resolved: ResolvedAccountIdentity = {
      registryAccountId: accountId,
      registryInstitutionId: institutionId,
      matchTier: 'account_number',
    };
    expect(resolved.matchTier).toBe('account_number');
  });

  test('merge: mandatory idempotency key; response names the terminal winner; merged event payload is remap-complete (Q3)', () => {
    const req: AccountMergeRequest = { idempotencyKey: 'idem-1', duplicateId: accountId };
    const res: MergeResponse<RegistryAccountId> = {
      winnerId: accountId,
      loserId: 'a-2' as RegistryAccountId,
      alreadyMerged: false,
      registryVersion: 7,
    };
    const payload: RegistryMergedEventPayload = { entity: 'account', loserId: 'a-2', winnerId: 'a-1' };
    expect([req.idempotencyKey, res.alreadyMerged, payload.entity]).toEqual(['idem-1', false, 'account']);
  });

  test('registry event carries the (sub, version) idempotency key (Q7/§14.4)', () => {
    const event: RegistryEvent = {
      sub: 'sub-1',
      version: 8,
      entity: 'account',
      entityId: 'a-1',
      kind: 'merged',
      payload: { entity: 'account', loserId: 'a-2', winnerId: 'a-1' } satisfies RegistryMergedEventPayload,
      occurredAt: '2026-08-18T00:00:00Z',
    };
    expect([event.sub, event.version]).toEqual(['sub-1', 8]);
  });

  test('ownership split input: existing person OR named joint co-owner — the only slice-1 person-creation surface (D-016)', () => {
    const splits: AccountOwnershipSplitInput[] = [
      { personId, splitRatio: 0.5 },
      { newHouseholdMember: { displayName: 'Spouse' }, splitRatio: 0.5 },
    ];
    const create: CreateAccountRequest = {
      idempotencyKey: 'idem-2',
      institutionId,
      displayName: 'Joint savings',
      accountType: 'savings',
      currency: 'GBP',
      country: 'GB',
      origin: 'manual',
      ownership: splits,
    };
    const get: GetAccountResponse = {
      registryVersion: 9,
      account: {} as Account, // shape-only fixture; full Account asserted above
      ownership: [{ accountId, personId, splitRatio: 1 }],
      externalRefs: [],
    };
    expect(create.ownership).toHaveLength(2);
    expect(get.registryVersion).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// 5. Browser-barrel reachability (Q4/D-007 — pure types live in ./browser)
// ---------------------------------------------------------------------------

describe('person-core surface is reachable via the browser barrel', () => {
  test('./browser re-exports the person-core vocabularies and guards', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const browser = require('../browser');
    for (const name of [
      'PERSON_KINDS', 'isPersonKind',
      'INSTITUTION_KINDS', 'isInstitutionKind',
      'INSTITUTION_STATUSES', 'isInstitutionStatus',
      'ACCOUNT_TYPES', 'isAccountType',
      'ACCOUNT_STATUSES', 'isAccountStatus',
      'ACCOUNT_ORIGINS', 'isAccountOrigin',
      'ACCOUNT_EXTERNAL_REF_KINDS', 'isAccountExternalRefKind',
      'RESOLVE_MATCH_TIERS', 'isResolveMatchTier',
      'RESOLVE_OUTCOMES',
      'REGISTRY_ENTITY_KINDS', 'isRegistryEntityKind',
      'REGISTRY_EVENT_KINDS', 'isRegistryEventKind',
    ]) {
      expect(browser[name]).toBeDefined();
    }
  });

  test('./index (server barrel) inherits the person-core surface from ./browser', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const index = require('../index');
    expect(index.ACCOUNT_TYPES).toBeDefined();
    expect(index.isAccountType('current')).toBe(true);
  });
});
