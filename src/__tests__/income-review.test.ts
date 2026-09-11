// d144 R03/R04 — the income review-reference contract, and the redaction rule as a test.
//
// Doc 40 WP1 R04 states the rule in prose:
//
//   > A cross-app review reference carries EXACTLY three fields — reviewId, kind, reason —
//   > and nothing else. No amounts, no account numbers, no account names, no country codes,
//   > no filenames, no document ids, no free text. reason is a fixed enum member, never an
//   > interpolated sentence.
//
// A prose rule in a council doc does not survive the next refactor. These tests are the
// rule, executable: they fail if a field is added to `IncomeReviewRef`, if the permitted
// field list drifts from the interface, if a reason member stops looking like an enum
// member, or if `parseIncomeReviewRef` ever relays something it was handed.

import {
  INCOME_REVIEW_KINDS,
  INCOME_REVIEW_REASONS,
  INCOME_FTCR_REVIEW_REASONS,
  FOREIGN_PROJECTION_REVIEW_REASONS,
  INCOME_REVIEW_REASON_SHAPE,
  INCOME_REVIEW_ID_LENGTH,
  INCOME_REVIEW_ID_PREFIX,
  INCOME_REVIEW_ID_PAYLOAD_LENGTH,
  INCOME_REVIEW_ID_SHAPE,
  isIncomeReviewId,
  INCOME_REVIEW_REF_FIELDS,
  INCOME_REVIEW_REQUIRED_CODES,
  INCOME_BLOCKING_CODES,
  INCOME_ERROR_CODE_DISPOSITION,
  INCOME_UNAVAILABLE_REASONS,
  INCOME_UNKNOWN_CODE_REASON,
  isIncomeReviewKind,
  isIncomeReviewReason,
  isIncomeReviewRequiredCode,
  isIncomeBlockingCode,
  parseIncomeReviewRef,
  parseIncomeReviewRefs,
  expandIncomeReviewRef,
  classifyIncomeErrorEnvelope,
  assertNeverIncomeFetchOutcome,
} from '../income-review';
import type {
  IncomeReviewRef,
  IncomeFetchOutcome,
  IncomeReviewRequiredOutcome,
  IncomeErrorDisposition,
} from '../income-review';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// REAL producer-shaped handles: public prefix plus 22 base64url payload characters.
const payload = (s: string): string => {
  if (s.length !== INCOME_REVIEW_ID_PAYLOAD_LENGTH) {
    throw new Error(`fixture payload ${s} is not ${INCOME_REVIEW_ID_PAYLOAD_LENGTH} characters`);
  }
  return INCOME_REVIEW_ID_PREFIX + s;
};
const H1 = payload('AbCdEfGhIjKlMnOpQrStUv');
const H2 = payload('Zx9_8Wv7-Uq6Tp5So4Rn3M');
const H3 = payload('Hh7Gg6Ff5Ee4Dd3Cc2Bb1A');
for (const handle of [H1, H2, H3]) {
  if (handle.length !== INCOME_REVIEW_ID_LENGTH) throw new Error(`fixture ${handle} is not a producer-shaped handle`);
}

// ---------------------------------------------------------------------------
// The redaction contract
// ---------------------------------------------------------------------------

describe('redaction contract: an IncomeReviewRef carries exactly three fields', () => {
  test('the permitted field list is exactly reviewId, kind, reason', () => {
    // Adding a field to `IncomeReviewRef` without listing it here is a COMPILE error
    // (`_incomeReviewRefFieldParity` in income-review.ts). Adding it to both turns this
    // assertion red. Between the two there is no way to widen the reference quietly.
    expect([...INCOME_REVIEW_REF_FIELDS].sort()).toEqual(['kind', 'reason', 'reviewId']);
    expect(INCOME_REVIEW_REF_FIELDS).toHaveLength(3);
  });

  test('a well-formed reference has exactly the three permitted own keys', () => {
    const ref = parseIncomeReviewRef({
      reviewId: H1,
      kind: 'legacy_withholding',
      reason: 'source_attribution_required',
    });
    expect(ref).not.toBeNull();
    expect(Object.keys(ref as IncomeReviewRef).sort()).toEqual([...INCOME_REVIEW_REF_FIELDS].sort());
  });

  test('every forbidden field a producer might leak is stripped, not relayed', () => {
    // Each of these is something doc 40 R04 names explicitly, plus the fields the shipped
    // 200-path (`map-income-output.ts:133-163`) actually embeds today.
    const leaky = {
      reviewId: H1,
      kind: 'broker_fact',
      reason: 'fx_unresolved',
      // amounts
      amount: 1234.56,
      grossAmountGbp: '1234.56',
      totalGbp: 1234.56,
      foreignTaxPaidGbp: 60,
      // account identity
      accountId: 'acct-8812',
      accountNumber: 'GB29NWBK60161331926819',
      accountName: 'J Smith ISA',
      brokerAccountRef: 'U1234567',
      // jurisdiction
      countryCode: 'US',
      sourceCountry: 'HK',
      // documents
      filename: 'statement.pdf',
      documentId: 'doc_4471',
      sourceEventId: '77213',
      // free text
      message: '£1,234.56 from statement.pdf is awaiting confirmation',
      note: 'ask the client',
      // instrument
      symbol: 'AAPL',
      isin: 'US0378331005',
    };
    const ref = parseIncomeReviewRef(leaky);
    expect(ref).not.toBeNull();
    expect(Object.keys(ref as IncomeReviewRef).sort()).toEqual(['kind', 'reason', 'reviewId']);

    // Structural assertion above is the contract; this is the same claim stated as the
    // thing we actually care about — nothing sensitive survives serialisation.
    const serialised = JSON.stringify(ref);
    for (const forbidden of Object.keys(leaky)) {
      if ((INCOME_REVIEW_REF_FIELDS as readonly string[]).includes(forbidden)) continue;
      expect(serialised).not.toContain(forbidden);
    }
    expect(serialised).not.toMatch(/\d[\d,]*\.\d/); // no decimal amount
    expect(serialised).not.toMatch(/[£$€]/); // no currency
    expect(serialised).not.toMatch(/\.(pdf|csv|ofx|qfx|xlsx?)/i); // no filename
    // No country code, ISIN or ticker in the CLASSIFYING fields. `reviewId` is exempt from
    // this scan by design: it is an opaque handle and may legitimately be base64url, which
    // contains uppercase. Its opacity is the producer's obligation (doc 40 R04), proven in
    // income-app, not inferable from its characters here.
    const { reviewId: _opaque, ...classifying } = ref as IncomeReviewRef;
    expect(JSON.stringify(classifying)).not.toMatch(/[A-Z]{2,}/);
  });

  test('property: for ANY extra key, the parsed reference never grows', () => {
    const base = { reviewId: H1, kind: 'foreign_projection', reason: 'payment_date_missing' };
    const injected = [
      'id',
      'title',
      'targetUrl',
      'severity',
      'category',
      'sourceApp',
      'eventDate',
      'affectsForms',
      'taxYear',
      'userId',
      'taxpayerId',
      '__proto__x',
      'REVIEWID',
      'reviewid',
    ];
    for (const key of injected) {
      const ref = parseIncomeReviewRef({ ...base, [key]: 'anything at all' });
      expect(Object.keys(ref as IncomeReviewRef)).toHaveLength(3);
      expect(Object.prototype.hasOwnProperty.call(ref, key)).toBe(false);
    }
  });
});

describe('redaction contract: reason is an enum member, never free text', () => {
  test('every reason in the vocabulary looks like an enum member, not a sentence', () => {
    for (const reason of INCOME_REVIEW_REASONS) {
      expect(reason).toMatch(INCOME_REVIEW_REASON_SHAPE);
      expect(reason.length).toBeLessThanOrEqual(64);
      // Belt and braces: the shape regex already forbids these, but state them by name so
      // a future relaxation of the regex does not quietly relax the rule.
      expect(reason).not.toMatch(/\s/);
      expect(reason).not.toMatch(/[£$€%]/);
      expect(reason).not.toMatch(/[.,:;!?'"()]/);
      expect(reason).not.toMatch(/[A-Z]/);
      expect(reason).not.toMatch(/\d[\d,]*\.\d/);
    }
  });

  test('the vocabulary is the two producer families, with no duplicates', () => {
    expect(INCOME_REVIEW_REASONS).toEqual([
      ...INCOME_FTCR_REVIEW_REASONS,
      ...FOREIGN_PROJECTION_REVIEW_REASONS,
    ]);
    expect(new Set(INCOME_REVIEW_REASONS).size).toBe(INCOME_REVIEW_REASONS.length);
  });

  test('projection atoms that mean "ready" are NOT review reasons', () => {
    // The refusal filters on `state !== 'ready'`; admitting these would let a producer
    // claim review on a settled projection.
    for (const readyAtom of [
      'eligible',
      'sa106_required',
      'sa106_route_selected',
      'other_foreign_income_requires_sa106',
    ]) {
      expect(isIncomeReviewReason(readyAtom)).toBe(false);
    }
  });

  test('a free-text reason is rejected outright — the reference drops', () => {
    const sentences = [
      '£1,234.56 from statement.pdf is awaiting confirmation', // the shipped 200-path style
      'Foreign tax credit relief requires review before this return can be computed.',
      'source attribution required',
      'Source_Attribution_Required',
      '',
      'source_attribution_required ',
    ];
    for (const reason of sentences) {
      expect(isIncomeReviewReason(reason)).toBe(false);
      expect(parseIncomeReviewRef({ reviewId: H1, kind: 'broker_fact', reason })).toBeNull();
    }
  });

  test('a comma-joined atom list is not a reason (it fans out instead)', () => {
    const joined = 'source_country_unresolved,fx_unresolved';
    expect(isIncomeReviewReason(joined)).toBe(false);
    expect(parseIncomeReviewRef({ reviewId: H1, kind: 'foreign_projection', reason: joined })).toBeNull();

    expect(expandIncomeReviewRef({ reviewId: H1, kind: 'foreign_projection', reason: joined })).toEqual([
      { reviewId: H1, kind: 'foreign_projection', reason: 'source_country_unresolved' },
      { reviewId: H1, kind: 'foreign_projection', reason: 'fx_unresolved' },
    ]);
  });

  test('expandIncomeReviewRef drops unrecognised atoms and deduplicates', () => {
    expect(
      expandIncomeReviewRef({
        reviewId: H2,
        kind: 'broker_fact',
        reason: 'fx_unresolved, something_new ,fx_unresolved,tax_year_rule_missing',
      }),
    ).toEqual([
      { reviewId: H2, kind: 'broker_fact', reason: 'fx_unresolved' },
      { reviewId: H2, kind: 'broker_fact', reason: 'tax_year_rule_missing' },
    ]);
    expect(expandIncomeReviewRef({ reviewId: H2, kind: 'broker_fact', reason: 'only_nonsense' })).toEqual([]);
    expect(expandIncomeReviewRef({ reviewId: '', kind: 'broker_fact', reason: 'fx_unresolved' })).toEqual([]);
  });
});

describe('redaction contract: reviewId is the fixed producer handle shape', () => {
  // d144 R18. The guard used to accept any 22 base64url characters, so
  // `income_review_00000001` passed. The consumer now requires the public prefix plus a
  // 22-character payload. That is namespaced shape defence, not an opacity proof.

  test('the shape is prefix plus 22 payload characters, and the constants agree', () => {
    expect(INCOME_REVIEW_ID_PREFIX).toBe('ir1');
    expect(INCOME_REVIEW_ID_PAYLOAD_LENGTH).toBe(22);
    expect(INCOME_REVIEW_ID_LENGTH).toBe(25);
    expect(INCOME_REVIEW_ID_SHAPE.source).toBe(
      `^${INCOME_REVIEW_ID_PREFIX}[A-Za-z0-9_-]{${INCOME_REVIEW_ID_PAYLOAD_LENGTH}}$`,
    );
    expect(INCOME_REVIEW_ID_SHAPE.flags).not.toContain('m');
  });

  test('every handle a correct producer can mint is accepted', () => {
    for (const handle of [
      H1, H2, H3,
      payload('A'.repeat(INCOME_REVIEW_ID_PAYLOAD_LENGTH)),
      payload('_'.repeat(INCOME_REVIEW_ID_PAYLOAD_LENGTH)),
      payload('-'.repeat(INCOME_REVIEW_ID_PAYLOAD_LENGTH)),
      payload('0123456789abcdefABCDEF'),
      payload('__--__--__--__--__--_-'),
    ]) {
      expect(handle).toHaveLength(INCOME_REVIEW_ID_LENGTH);
      expect(isIncomeReviewId(handle)).toBe(true);
      expect(parseIncomeReviewRef({ reviewId: handle, kind: 'broker_fact', reason: 'fx_unresolved' }))
        .toEqual({ reviewId: handle, kind: 'broker_fact', reason: 'fx_unresolved' });
    }
  });

  test('the identifier shapes a regression could leak are all rejected', () => {
    const notHandles: [unknown, string][] = [
      ['r_1', 'the weak fixture this contract used to accept'],
      ['r_9f3a2b1c8d4e', 'a hand-written pseudo-handle'],
      ['77213', 'a raw row id'],
      [77213, 'a raw row id, unquoted'],
      ['tax_figures/77213', 'a table-qualified key'],
      ['statement.pdf', 'a filename'],
      ['broker-event-abcdef', 'a producer event id'],
      ['9f3a2b1c-8d4e-4a7b-9c1d-2e3f4a5b6c7d', 'a UUID'],
      ['income_review_00000001', 'the 22-char database-key shape that passed the pre-R18 guard'],
      ['AbCdEfGhIjKlMnOpQrStUv', 'unprefixed HMAC payload — the pre-R18 shape'],
      ['ir1AbCdEfGhIjKlMnOpQrStU', 'prefix plus 21 payload characters'],
      ['ir1AbCdEfGhIjKlMnOpQrStUvW', 'prefix plus 23 payload characters'],
      ['AbCdEfGhIjKlMnOpQrSt+/', 'base64, not base64url'],
      ['AbCdEfGhIjKlMnOpQrStU=', 'base64 padding'],
      ['', 'empty'],
      [null, 'null'],
      [undefined, 'absent'],
      [{ toString: () => H1 }, 'an object that stringifies to a handle'],
    ];
    for (const [value, why] of notHandles) {
      expect([why, isIncomeReviewId(value)]).toEqual([why, false]);
      // A bad handle drops the WHOLE reference — it is never repaired or relayed.
      expect([why, parseIncomeReviewRef({ reviewId: value, kind: 'broker_fact', reason: 'fx_unresolved' })])
        .toEqual([why, null]);
      expect([why, expandIncomeReviewRef({
        reviewId: value as string, kind: 'broker_fact', reason: 'fx_unresolved',
      })]).toEqual([why, []]);
    }
  });

  test('the prefix is namespaced shape defence, not an opacity proof', () => {
    const leakShaped = payload('income_review_00000001');
    expect(leakShaped).toHaveLength(INCOME_REVIEW_ID_LENGTH);
    expect(isIncomeReviewId(leakShaped)).toBe(true);
  });

  test('a leaked row id drops out of a mixed refusal, leaving the genuine handles', () => {
    const refs = parseIncomeReviewRefs([
      { reviewId: H1, kind: 'legacy_withholding', reason: 'source_attribution_required' },
      { reviewId: '77213', kind: 'legacy_withholding', reason: 'source_attribution_required' },
      { reviewId: 'statement.pdf', kind: 'broker_fact', reason: 'fx_unresolved' },
      { reviewId: H2, kind: 'broker_fact', reason: 'fx_unresolved' },
    ]);
    expect(refs).toEqual([
      { reviewId: H1, kind: 'legacy_withholding', reason: 'source_attribution_required' },
      { reviewId: H2, kind: 'broker_fact', reason: 'fx_unresolved' },
    ]);
    expect(JSON.stringify(refs)).not.toContain('77213');
    expect(JSON.stringify(refs)).not.toContain('statement.pdf');
  });

  test('a refusal envelope whose every item carries a leaked id classifies with no items', () => {
    const disposition = classifyIncomeErrorEnvelope({
      error: 'Review unresolved broker foreign income before computing this return.',
      code: 'FOREIGN_INCOME_REVIEW_REQUIRED',
      reviewItems: [{ reviewId: '77213', kind: 'foreign_projection', reason: 'fx_unresolved' }],
    });
    expect(disposition.disposition).toBe('review_required');
    expect(disposition).toMatchObject({ reviewItems: [] });
  });
});

describe('kinds', () => {
  test('the kind vocabulary is closed and enum-shaped', () => {
    expect([...INCOME_REVIEW_KINDS]).toEqual([
      'legacy_withholding',
      'broker_fact',
      'income_classification',
      'foreign_projection',
    ]);
    for (const kind of INCOME_REVIEW_KINDS) expect(kind).toMatch(INCOME_REVIEW_REASON_SHAPE);
    expect(isIncomeReviewKind('legacy_withholding')).toBe(true);
    expect(isIncomeReviewKind('foreign_credit')).toBe(false);
    expect(isIncomeReviewKind(undefined)).toBe(false);
  });

  test('an unrecognised kind drops the reference rather than passing it through', () => {
    expect(parseIncomeReviewRef({ reviewId: H1, kind: 'other', reason: 'fx_unresolved' })).toBeNull();
  });
});

describe('parseIncomeReviewRefs tolerates what a producer may send', () => {
  test('absent / non-array / empty ⇒ []', () => {
    expect(parseIncomeReviewRefs(undefined)).toEqual([]);
    expect(parseIncomeReviewRefs(null)).toEqual([]);
    expect(parseIncomeReviewRefs('nope')).toEqual([]);
    expect(parseIncomeReviewRefs({})).toEqual([]);
    expect(parseIncomeReviewRefs([])).toEqual([]);
  });

  test('one malformed entry drops; the rest survive; nothing throws', () => {
    const refs = parseIncomeReviewRefs([
      { reviewId: H1, kind: 'legacy_withholding', reason: 'source_attribution_required' },
      { kind: 'legacy_withholding', reason: 'source_attribution_required' }, // no reviewId
      null,
      'garbage',
      [],
      { reviewId: H2, kind: 'broker_fact', reason: 'fx_unresolved', amountGbp: 99.99 },
    ]);
    expect(refs).toEqual([
      { reviewId: H1, kind: 'legacy_withholding', reason: 'source_attribution_required' },
      { reviewId: H2, kind: 'broker_fact', reason: 'fx_unresolved' },
    ]);
  });

  test('the pre-d144 {sourceEventId, reason} item shape drops (it leaks a raw id)', () => {
    expect(parseIncomeReviewRefs([{ sourceEventId: '77213', reason: 'fx_unresolved' }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R03 — an unknown code can never become a tax-year claim
// ---------------------------------------------------------------------------

describe('R03: the 422 code table', () => {
  test('review codes and blocking codes are disjoint and fully dispositioned', () => {
    for (const code of INCOME_REVIEW_REQUIRED_CODES) {
      expect(INCOME_ERROR_CODE_DISPOSITION[code]).toBe('review_required');
      expect(isIncomeBlockingCode(code)).toBe(false);
    }
    for (const code of INCOME_BLOCKING_CODES) {
      expect(INCOME_ERROR_CODE_DISPOSITION[code]).toBe('blocked');
      expect(isIncomeReviewRequiredCode(code)).toBe(false);
    }
    expect(Object.keys(INCOME_ERROR_CODE_DISPOSITION).sort()).toEqual(
      [...INCOME_REVIEW_REQUIRED_CODES, ...INCOME_BLOCKING_CODES].sort(),
    );
  });

  test('FTCR_REVIEW_REQUIRED ⇒ review_required with its items (doc 40 R03 case 1)', () => {
    const d = classifyIncomeErrorEnvelope({
      error: 'Foreign tax credit relief requires review before this return can be computed.',
      code: 'FTCR_REVIEW_REQUIRED',
      reason: 'source_attribution_required',
      reviewItems: [{ reviewId: H1, kind: 'legacy_withholding', reason: 'source_attribution_required' }],
    });
    expect(d).toEqual({
      disposition: 'review_required',
      code: 'FTCR_REVIEW_REQUIRED',
      reason: 'source_attribution_required',
      message: 'Foreign tax credit relief requires review before this return can be computed.',
      reviewItems: [{ reviewId: H1, kind: 'legacy_withholding', reason: 'source_attribution_required' }],
    });
  });

  test('FOREIGN_INCOME_REVIEW_REQUIRED ⇒ review_required (doc 40 R03 case 2)', () => {
    const d = classifyIncomeErrorEnvelope({
      error: 'Foreign income needs review.',
      code: 'FOREIGN_INCOME_REVIEW_REQUIRED',
      reviewItems: [{ reviewId: H3, kind: 'foreign_projection', reason: 'fx_unresolved' }],
    });
    expect(d.disposition).toBe('review_required');
    if (d.disposition !== 'review_required') throw new Error('unreachable');
    expect(d.reason).toBeNull(); // this code carries no top-level reason today
    expect(d.reviewItems).toHaveLength(1);
  });

  test('reviewItems absent ⇒ review_required with [] (old producer, new consumer)', () => {
    const d = classifyIncomeErrorEnvelope({ error: 'needs review', code: 'FTCR_REVIEW_REQUIRED', reason: 'invalid_amount' });
    expect(d).toMatchObject({ disposition: 'review_required', reviewItems: [] });
  });

  test('jurisdiction codes still block, verbatim', () => {
    for (const code of INCOME_BLOCKING_CODES) {
      const d = classifyIncomeErrorEnvelope({ error: 'We cannot file for that jurisdiction.', code });
      expect(d).toEqual({ disposition: 'blocked', code, message: 'We cannot file for that jurisdiction.' });
    }
  });

  test('an UNTYPED 422 is the one and only unsupported_year case', () => {
    for (const body of [
      { error: 'No thresholds for 2024-25' },
      { error: 'x', code: '' },
      { error: 'x', code: 42 },
      {},
      null,
      'not json',
    ]) {
      expect(classifyIncomeErrorEnvelope(body)).toEqual({ disposition: 'unsupported_year' });
    }
  });

  test('R03 REGRESSION: an unknown code is unknown_child_error, NEVER unsupported_year', () => {
    for (const code of [
      'SOMETHING_NEW',
      'FTCR_REVIEW_REQUIRED_V2',
      'ENGINE_MISCONFIGURED',
      'SUB_UNRESOLVED',
      'jurisdiction_unknown', // case matters: not the known code
    ]) {
      const d = classifyIncomeErrorEnvelope({ error: 'nope', code });
      expect(d.disposition).toBe('unknown_child_error');
      expect(d.disposition).not.toBe('unsupported_year');
      if (d.disposition !== 'unknown_child_error') throw new Error('unreachable');
      expect(d.code).toBe(code);
    }
  });

  test('the unsupported_year arm carries no code — so a coded 422 cannot be expressed as it', () => {
    // This is the type-level guarantee, observed at run time: the arm has nowhere to put a
    // code, so no code-bearing input can produce it.
    const d = classifyIncomeErrorEnvelope({ error: 'No thresholds' });
    expect(Object.keys(d)).toEqual(['disposition']);
  });

  test('the safe default is typed so it cannot be the tax-year claim', () => {
    expect(INCOME_UNKNOWN_CODE_REASON).toBe('unknown_child_error');
    // @ts-expect-error 'unsupported_year' is excluded from IncomeCodedUnavailableReason
    const wrong: typeof INCOME_UNKNOWN_CODE_REASON = 'unsupported_year';
    void wrong;
    expect([...INCOME_UNAVAILABLE_REASONS]).toEqual([
      'unsupported_year',
      'service_unavailable',
      'session_expired',
      'unknown_child_error',
    ]);
  });

  test('classification is total — every disposition is reachable and exhaustive', () => {
    const seen = new Set<IncomeErrorDisposition['disposition']>();
    for (const body of [
      { error: 'a', code: 'FTCR_REVIEW_REQUIRED' },
      { error: 'a', code: 'JURISDICTION_UNKNOWN' },
      { error: 'a' },
      { error: 'a', code: 'WHO_KNOWS' },
    ]) {
      const d = classifyIncomeErrorEnvelope(body);
      seen.add(d.disposition);
      switch (d.disposition) {
        case 'review_required':
        case 'blocked':
        case 'unsupported_year':
        case 'unknown_child_error':
          break;
        default:
          assertNeverIncomeFetchOutcome(d);
      }
    }
    expect([...seen].sort()).toEqual(['blocked', 'review_required', 'unknown_child_error', 'unsupported_year']);
  });
});

// ---------------------------------------------------------------------------
// The Suite-facing outcome (doc 40 R03)
// ---------------------------------------------------------------------------

describe('IncomeFetchOutcome', () => {
  test('the review_required arm has exactly the five fields doc 40 R03 specifies', () => {
    const outcome: IncomeReviewRequiredOutcome = {
      kind: 'review_required',
      code: 'FTCR_REVIEW_REQUIRED',
      reason: 'treaty_evidence_required',
      message: "Income's own sentence",
      reviewItems: [{ reviewId: H1, kind: 'legacy_withholding', reason: 'treaty_evidence_required' }],
      deepLink: null,
    };
    expect(Object.keys(outcome).sort()).toEqual(['code', 'deepLink', 'kind', 'message', 'reason', 'reviewItems']);
  });

  test('deepLink is nullable — no resolver exists yet, and a fabricated URL is worse', () => {
    const withLink: IncomeReviewRequiredOutcome['deepLink'] = `/2024-25/sources?review_id=${H1}`;
    const withoutLink: IncomeReviewRequiredOutcome['deepLink'] = null;
    expect(withLink).toContain('review_id');
    expect(withoutLink).toBeNull();
  });

  test('a switch over IncomeFetchOutcome is exhaustive', () => {
    const describeOutcome = (o: IncomeFetchOutcome): string => {
      switch (o.kind) {
        case 'ok':
          return 'ok';
        case 'not_connected':
          return 'not_connected';
        case 'blocked':
          return `blocked:${o.code}`;
        case 'review_required':
          return `review:${o.reviewItems.length}`;
        case 'unavailable':
          return `unavailable:${o.reason}`;
        default:
          return assertNeverIncomeFetchOutcome(o);
      }
    };
    expect(describeOutcome({ kind: 'not_connected' })).toBe('not_connected');
    expect(describeOutcome({ kind: 'blocked', code: 'JURISDICTION_UNSUPPORTED', message: 'm' })).toBe(
      'blocked:JURISDICTION_UNSUPPORTED',
    );
    expect(describeOutcome({ kind: 'unavailable', reason: 'unknown_child_error' })).toBe(
      'unavailable:unknown_child_error',
    );
    expect(
      describeOutcome({
        kind: 'review_required',
        code: 'FTCR_REVIEW_REQUIRED',
        reason: 'invalid_amount',
        message: 'm',
        reviewItems: [],
        deepLink: null,
      }),
    ).toBe('review:0');
  });
});

// ---------------------------------------------------------------------------
// Barrel + runtime-domain boundary
// ---------------------------------------------------------------------------

describe('barrel exports and the browser-safe boundary', () => {
  test('the contract is reachable from BOTH the universal and the server entry', () => {
    for (const entry of ['../browser', '../index']) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(entry);
      expect(typeof mod.classifyIncomeErrorEnvelope).toBe('function');
      expect(typeof mod.parseIncomeReviewRef).toBe('function');
      expect(typeof mod.expandIncomeReviewRef).toBe('function');
      expect(mod.INCOME_REVIEW_KINDS).toBeDefined();
      expect(mod.INCOME_REVIEW_REASONS).toBeDefined();
      expect(mod.INCOME_REVIEW_REF_FIELDS).toBeDefined();
      expect(mod.INCOME_ERROR_CODE_DISPOSITION).toBeDefined();
    }
  });

  test('importing it alone pulls in no Ajv and no server-only shim', () => {
    jest.resetModules();
    require('../income-review');
    const loadedIds = Object.keys(require.cache);
    expect(loadedIds.some((id) => /[\\/]node_modules[\\/]ajv([\\/]|$)/.test(id))).toBe(false);
    expect(loadedIds.some((id) => /[\\/]node_modules[\\/]server-only([\\/]|$)/.test(id))).toBe(false);
    expect(loadedIds.some((id) => id.includes('filing-contribution-pack-validate'))).toBe(false);
    expect(loadedIds.some((id) => id.includes('filing-contribution-pack-node'))).toBe(false);
  });
});
