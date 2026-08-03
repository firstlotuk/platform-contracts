import {
  ONE_TIME_USE_PURPOSES,
  PERMISSION_ACTIONS,
  matchContributionRoute,
  type ContributionRouteManifestEntry,
} from '../auth';

const manifest = Object.freeze([
  Object.freeze({
    template: 'contribution_discovery',
    methods: Object.freeze(['GET', 'HEAD'] as const),
    action: 'income.contribution.discover',
    readPurpose: 'contribution_discovery',
    served: false,
  }),
  Object.freeze({
    template: 'contribution_retrieval',
    methods: Object.freeze(['GET', 'HEAD'] as const),
    action: 'income.contribution.read',
    readPurpose: 'contribution_retrieval',
    served: false,
  }),
] as const satisfies readonly ContributionRouteManifestEntry[]);

describe('D048 closed contribution route matcher', () => {
  test.each(['GET', 'HEAD', 'get', 'head'])('matches discovery for %s', method => {
    expect(matchContributionRoute(manifest, method, '/api/contributions/2025-26')).toMatchObject({
      ok: true,
      action: 'income.contribution.discover',
      readPurpose: 'contribution_discovery',
      params: { taxYear: '2025-26' },
      entry: { served: false },
    });
  });

  test('matches only an uppercase Crockford ULID and bounded positive version', () => {
    const path = '/api/contributions/2025-26/01ARZ3NDEKTSV4RRFFQ69G5FAV/12';
    expect(matchContributionRoute(manifest, 'GET', path)).toMatchObject({
      ok: true,
      action: 'income.contribution.read',
      params: { taxYear: '2025-26', packId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', version: '12' },
    });
  });

  test.each([
    '/api/contributions/2025-26?latest=1',
    '/api/contributions/2025-26?',
  ])('rejects every query string: %s', path => {
    expect(matchContributionRoute(manifest, 'GET', path)).toEqual({ ok: false, reason: 'via_query_not_permitted' });
  });

  test.each([
    '/api//contributions/2025-26',
    '/api/contributions/2025-26/',
    '/api/contributions/%32%30%32%35-26',
    '/api/./contributions/2025-26',
    '/API/contributions/2025-26',
    '/api/Contributions/2025-26',
  ])('rejects non-normalized paths: %s', path => {
    expect(matchContributionRoute(manifest, 'GET', path)).toEqual({ ok: false, reason: 'via_path_not_normalized' });
  });

  test.each([
    '/api/contributions-admin/2025-26',
    '/api/contributions/2025-26/extra',
    '/api/contributions/2025-2026',
    '/api/contributions/2025-26/01ARZ3NDEKTSV4RRFFQ69G5FAI/1',
    '/api/contributions/2025-26/01arz3ndektsv4rrffq69g5fav/1',
    '/api/contributions/2025-26/01ARZ3NDEKTSV4RRFFQ69G5FAV/0',
    '/api/contributions/2025-26/01ARZ3NDEKTSV4RRFFQ69G5FAV/10000',
  ])('rejects routes outside the closed grammar: %s', path => {
    expect(matchContributionRoute(manifest, 'GET', path)).toEqual({ ok: false, reason: 'via_route_not_in_manifest' });
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('rejects undeclared method %s', method => {
    expect(matchContributionRoute(manifest, method, '/api/contributions/2025-26')).toEqual({
      ok: false,
      reason: 'via_method_not_safe',
    });
  });

  test('canonical actions are registered and downstream_actor remains replayable by policy', () => {
    expect(PERMISSION_ACTIONS).toEqual(expect.arrayContaining([
      'income.contribution.discover',
      'income.contribution.read',
    ]));
    expect(ONE_TIME_USE_PURPOSES).not.toContain('downstream_actor');
  });
});
