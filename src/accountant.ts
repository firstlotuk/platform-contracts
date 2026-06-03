/**
 * Accountant engagement boundary contracts — `AccountantTask` + `Opinion`.
 *
 * These are cross-boundary DOMAIN types: the consumer suite (Tier 1) and the future
 * accountant workspace (Tier 2) both read them. Only stable shapes belong here — no SQL,
 * no migration, no suite-internal repository code (those stay suite-local).
 *
 * Source of truth:
 *   - ACCOUNTANT_SIGNOFF_OVERRIDE_CONTRACT.md (engagement contract — locked) — enums,
 *     lifecycle, snapshot semantics, clarification-as-task rule.
 *   - ACCOUNTANT_TASK_PERSISTENCE_CONTRACT.md (draft, accepted-for-0.5.4) §5 — the
 *     persisted row shapes 13b reads.
 *
 * The persisted shapes are the level 13b binds to. Staleness and the snapshot display
 * ordinal are DERIVED projections (never stored) and live with the read model, not here.
 */

// ── Branded ids ────────────────────────────────────────────────────────────────
// Accountant-owned identifiers are branded so call sites can't cross them. caseRef /
// requestedBy / accountantId reference values owned by other contracts and are plain
// strings here to avoid competing brand definitions.

export type AccountantTaskId = string & { readonly __brand: 'AccountantTaskId' };
export type OpinionId        = string & { readonly __brand: 'OpinionId' };
export type AccountantId     = string & { readonly __brand: 'AccountantId' };
export type SnapshotId       = string & { readonly __brand: 'SnapshotId' };
export type FactId           = string & { readonly __brand: 'FactId' };

// ── Locked enums (engagement contract) ──────────────────────────────────────────

export type AccountantTaskType =
  | 'triage_review'
  | 'specific_question'
  | 'pre_submission_review'
  | 'amendment_review'
  | 'clarification';

export type AccountantTaskState =
  | 'draft'
  | 'open'
  | 'assigned'
  | 'claimed'
  | 'in_progress'
  | 'delivered'
  | 'closed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'superseded';

export type OpinionStrength = 'confirm' | 'recommend' | 'flag' | 'decline';

// ── Snapshot ref (minimum persisted fields 13b reads) ───────────────────────────

export interface SnapshotRef {
  id: SnapshotId;
  /** Renders "14 Apr 2026 11:42 UTC". */
  capturedAt: string;
  /** `.length` drives the "view facts considered (N)" link on 13b. */
  facts: Array<{ factId: FactId; version: number }>;
}

/** Frozen denormalisation of the assigned accountant's display identity, captured at
 *  assignment so 13b renders the attribution line without joining a profile table.
 *  Immutable thereafter — historical tasks render the credential as it was at assignment. */
export interface AssignedAccountant {
  id: AccountantId;
  displayName: string;   // e.g. "Sarah W."
  credential: string;    // e.g. "CTA"
  sourceLabel: string;   // e.g. "trusted-client marketplace"
}

// ── AccountantTask (persisted row shape) ────────────────────────────────────────

export interface AccountantTaskRow {
  id: AccountantTaskId;             // UI renders as `T-${id}`
  caseRef: string;
  taxYear: string;
  requestedBy: string;              // UserId (owner)

  taskType: AccountantTaskType;

  /** Plain-language brief written by the user. For a clarification, the "You asked" text. */
  brief: string;

  /** Commercial terms locked at submission. Clarification tasks carry their own price. */
  price: { amount: number; currency: 'GBP' };

  /** Clarification linkage. Null on primary tasks. A clarification FOLLOWS its parent —
   *  it does not replace it (distinct from supersedes/supersededBy rescope linkage). */
  parentTaskId: AccountantTaskId | null;

  /** Frozen at assignment. Null until the task leaves `open`. */
  assignedAccountant: AssignedAccountant | null;

  /** Fact-version manifest pinned at assignment. A clarification reuses the parent's
   *  snapshot — the matcher does not capture a new one. Null until assigned. */
  snapshotAtAssignment: SnapshotRef | null;

  state: AccountantTaskState;

  /** Pointer to the delivered Opinion row, if any. */
  deliverableRef: OpinionId | null;

  /** Audit timestamps 13b reads directly. SLA timer durations stay Temporal-resident. */
  createdAt: string;
  assignedAt: string | null;
  claimedAt: string | null;
  deliveredAt: string | null;
}

// ── Opinion (persisted row shape) ───────────────────────────────────────────────

export interface OpinionRow {
  id: OpinionId;                    // UI renders as `op-${id}`
  taskId: AccountantTaskId;         // UNIQUE — one opinion per task in Stage A
  accountantId: AccountantId;

  strength: OpinionStrength;

  /** Free-text body. "Her opinion" on a primary; "She replied" on a clarification. */
  body: string;

  /** Required when strength ∈ {flag, decline}. */
  escalationReason: string | null;

  /** Equals the (parent) task's snapshotAtAssignment.id. */
  snapshotId: SnapshotId;

  /** Fact-version manifest the opinion relied on. Subset of snapshot.facts. Each entry's
   *  `label` is captured at delivery and immutable, so the opinion renders self-contained
   *  without a fact-registry lookup at read time. */
  dependsOn: Array<{ factId: FactId; version: number; label: string }>;

  /** Set at delivery. In Stage A (one-opinion-per-task) equals task.deliveredAt. */
  createdAt: string;
}

/** Derived freshness verdict (computed at read time, never stored). See the suite read
 *  model's computeOpinionFreshness. */
export type OpinionFreshness = 'fresh' | 'stale';
