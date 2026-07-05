/**
 * Durable-identity authorization vocabulary — `case_participant` (D-011 Stage 1).
 *
 * Source of truth:
 *   specs/implementation/council/0.5.6-d011-cgt-suite-bff-adoption/02-approved-implementation-plan.md
 *     §3 (case_participant authorization model, NET-NEW) + §6 (platform-contracts additions)
 *   specs/implementation/council/0.5.6-d011-cgt-suite-bff-adoption/SECURITY-GATE-ADJUDICATION.md
 *     F8 (shared role/status → Decision mapping helper, exhaustive conformance suite)
 *
 * The durable model: gateway `sub` = IDENTITY, `filing_case` = the BUSINESS OBJECT, and a
 * `case_participant` = an actor's PERMISSION on a filing case. Authorization is
 * (actor `sub`) × (`case_participant` on the target `filing_case`). The participant role is
 * NEVER carried in a token (`filingCaseId` is on {@link FORBIDDEN_ACTOR_CLAIM_KEYS}, auth.ts:369),
 * so it is resolved server-side against the suite-owned participant store.
 *
 * SCOPE (Stage 1): the shared VOCABULARY + the load-bearing role/status → `Decision` mapping helper
 * only. No persistence, no resolver endpoint, no service wiring (those are Stages 2–5). All additions
 * are additive — no renamed/removed exports.
 */

import type { Decision } from './authz';
import { allow, deny } from './authz';

// ---------------------------------------------------------------------------
// Closed role + status vocabulary (design §3) — declared as `as const` value
// arrays so the canonical value list and the type cannot drift.
// ---------------------------------------------------------------------------

/**
 * The closed `case_participant` role vocabulary, **pinned now (Part B) and final** — B4 flips an
 * entitlement, NOT this set (design §3 / B4 gate D-005). Genuinely additive: no `CaseRole` exists today.
 *  - `owner`      — the taxpayer / subject of the filing case; the ONLY role that authorizes
 *                   taxpayer-data access (pre- and post-B4 unchanged).
 *  - `accountant` — a delegated professional participant. INERT until B4: a row may be persisted, but
 *                   it maps to DENY for every taxpayer-data operation until the accountant-mandate
 *                   contract (B4) is ratified. A non-authorizing slot today, not an absent one.
 *  - `support`    — an internal operational participant. NEVER authorizes taxpayer-data access
 *                   (deny-by-default, no B4 path to taxpayer data).
 */
export const CASE_ROLES = ['owner', 'accountant', 'support'] as const;
export type CaseRole = (typeof CASE_ROLES)[number];

/** True only if `s` is in the closed {@link CASE_ROLES} vocabulary (fail-closed lookup). */
export function isCaseRole(s: unknown): s is CaseRole {
  return typeof s === 'string' && (CASE_ROLES as readonly string[]).includes(s);
}

/** Lifecycle status of a persisted `case_participant` row. */
export const PARTICIPANT_STATUSES = ['active', 'inactive'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

/** True only if `s` is in the closed {@link PARTICIPANT_STATUSES} vocabulary (fail-closed lookup). */
export function isParticipantStatus(s: unknown): s is ParticipantStatus {
  return typeof s === 'string' && (PARTICIPANT_STATUSES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// CaseParticipant — the persisted permission row (rows owned by suite). NET-NEW.
// ---------------------------------------------------------------------------

/**
 * An actor's permission on a filing case (design §3). Keyed on the gateway `sub` × `filing_case_id`,
 * with NO app-local / legacy user id. Persisted and owned by suite (the filing control plane); this
 * contract only fixes the shape every service agrees on.
 */
export interface CaseParticipant {
  /** The stable filing-case business-object id this permission is scoped to. */
  filing_case_id: string;
  /** The gateway `sub` (identity) this participant row grants a permission to. */
  participant_sub: string;
  /** The participant's role on the case (closed {@link CaseRole} set). */
  role: CaseRole;
  /** Whether the row is currently active (`inactive` = revoked but retained for audit). */
  status: ParticipantStatus;
}

// ---------------------------------------------------------------------------
// Participant-resolution contract (design §3, D-006) — what the suite resolver
// returns and `requireDecision` consumes.
// ---------------------------------------------------------------------------

/** Cache-discipline selector on a resolve request: taxpayer-data ops MUST pass `sensitive` (design §3, F3). */
export const PARTICIPANT_RESOLVE_SENSITIVITIES = ['standard', 'sensitive'] as const;
export type ParticipantResolveSensitivity = (typeof PARTICIPANT_RESOLVE_SENSITIVITIES)[number];

type ParticipantResolveRequestBase = {
  participant_sub: string;
  sensitivity: ParticipantResolveSensitivity;
};

/**
 * The request key for `POST /internal/participant/resolve` (design §3, D-006, D-013 S1). Exactly ONE
 * lookup key must be present per request (discriminated union); `sensitivity` selects the cache rule.
 * No app-local ids. The consuming app derives `participant_sub` ONLY from its verified B1 actor (F2);
 * caller-chosen lookups are rejected at the endpoint (Stage 2).
 *
 * - `filing_case_id` arm — direct lookup: caller already holds a durable `filing_case_id`.
 * - `tax_year` arm       — year-keyed lookup: suite derives `filing_case_id` from `(participant_sub,
 *                          tax_year)` and returns the resolved id in the `active` response arm (S2).
 *                          `tax_year` uses the canonical UK format, e.g. `"2023-24"`.
 */
export type ParticipantResolveRequest =
  | (ParticipantResolveRequestBase & { filing_case_id: string; tax_year?: never })
  | (ParticipantResolveRequestBase & { tax_year: string; filing_case_id?: never });

/**
 * The result the suite resolver returns and the consuming app's in-process `requireDecision` consumes
 * (design §3, D-006). The `active` variant carries the **role ONLY — never an entitlement/`Decision`**:
 * policy stays in the PDP front door, not in suite's response. `inactive` (a row exists but is revoked)
 * is kept DISTINCT from `not_participant` (no row) so server-side audit can tell a revoked participant
 * from one that never existed — but BOTH deny, and the distinction is internal-audit-only (F7): the
 * consuming app renders the SAME external response for every non-`active` resolution.
 */
export type ParticipantResolution =
  | { status: 'active'; filing_case_id: string; participant_sub: string; role: CaseRole }
  | { status: 'inactive' }
  | { status: 'not_participant' };

/** The closed set of resolution status discriminants (`active` row, revoked row, no row). */
export const PARTICIPANT_RESOLUTION_STATUSES = ['active', 'inactive', 'not_participant'] as const;
export type ParticipantResolutionStatus = (typeof PARTICIPANT_RESOLUTION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Shared role/status → Decision mapping helper (sec-gate F8 — load-bearing).
//
// ONE helper in platform-contracts so NO service maps role→Decision locally (they
// would drift). Reuses the authz.ts deny-by-default / fail-CLOSED invariants: every
// non-happy input → explicit deny('forbidden'), never a fall-through-to-allow.
// ---------------------------------------------------------------------------

/**
 * The pre-B4 entitlement of a (role, status) pair for a **taxpayer-data operation** (design §3):
 *  - `owner` + `active`      → {@link allow} (MAY authorize taxpayer-data on its own case; the app's
 *                              masking/`Decision` machinery in authz.ts composes onto this base allow).
 *  - `accountant` + `active` → `deny('forbidden')` (inert mandate slot; B4 flips only this entitlement).
 *  - `support` + `active`    → `deny('forbidden')` (no B4 path to taxpayer data).
 *  - anything else (unknown role, any non-`active` status, unknown/missing status) → `deny('forbidden')`.
 *
 * Fail-CLOSED: this never returns an allow for any input other than an active owner. Pure — no I/O.
 */
export function roleStatusEntitlement(role: unknown, status: unknown): Decision {
  if (status !== 'active') return deny('forbidden');
  if (!isCaseRole(role)) return deny('forbidden');
  switch (role) {
    case 'owner':
      return allow();
    case 'accountant':
      // Inert until B4 — a persisted accountant row records who is on the case but grants NO
      // taxpayer-data access pre-B4. B4 flips this entitlement only; the type/role-set is unchanged.
      return deny('forbidden');
    case 'support':
      // No B4 path to taxpayer data — always deny for taxpayer-data operations.
      return deny('forbidden');
  }
}

/**
 * The load-bearing F8 helper: map a participant RESOLUTION (as returned by the suite resolver, possibly
 * malformed/partial off the wire — hence `unknown`) to a taxpayer-data `Decision`, consumed by the
 * in-process `requireDecision` PDP front door. There is exactly ONE such helper; no service re-maps
 * role→Decision locally.
 *
 * Deny on EVERY non-happy input (fail-CLOSED, never fall-through-to-allow):
 *  - a non-object / null / array resolution                                  → `deny('forbidden')`
 *  - missing or unknown `status`                                             → `deny('forbidden')`
 *  - `status: 'not_participant'` (no row — deny-by-default, no implicit access) → `deny('forbidden')`
 *  - `status: 'inactive'` (revoked row)                                      → `deny('forbidden')`
 *  - `status: 'active'` but a missing/non-string `filing_case_id`/`participant_sub`,
 *    or an unknown/missing `role` (a partial/malformed active response)      → `deny('forbidden')`
 *  - `status: 'active'` with a well-formed accountant/support row            → `deny('forbidden')`
 *
 * The ONLY allow is a well-formed `active` `owner` resolution (subject to the app's masking/`Decision`
 * machinery layered on top). Pure — no I/O.
 */
export function participantDecision(resolution: unknown): Decision {
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    return deny('forbidden');
  }
  const r = resolution as Record<string, unknown>;
  if (r.status !== 'active') {
    // Covers 'inactive', 'not_participant', missing status, and any unknown status — all deny.
    return deny('forbidden');
  }
  // An active resolution missing its identifying keys is partial/malformed → deny (never trust).
  const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
  if (!nonEmptyString(r.filing_case_id)) return deny('forbidden');
  if (!nonEmptyString(r.participant_sub)) return deny('forbidden');
  // Map the well-formed active (role, status) pair through the single shared entitlement helper.
  return roleStatusEntitlement(r.role, r.status);
}
