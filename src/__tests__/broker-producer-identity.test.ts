import { isBrokerFactsProducerIdentity, sameBrokerFactsProducerIdentity } from '../broker-facts-feed';
const identity = { generation: '11111111-1111-4111-8111-111111111111', revision: `sha256:${'a'.repeat(64)}` };
test('missing/unknown identity cannot prove currentness, even against itself', () => {
  for (const value of [null, undefined, {}, { ...identity, extra: true }, { ...identity, revision: 'same money' }]) {
    expect(isBrokerFactsProducerIdentity(value)).toBe(false);
    expect(sameBrokerFactsProducerIdentity(value, value)).toBe(false);
  }
});
test('reset or source-only change invalidates the replica', () => {
  expect(sameBrokerFactsProducerIdentity(identity, { ...identity })).toBe(true);
  expect(sameBrokerFactsProducerIdentity(identity, { ...identity, generation: '22222222-2222-4222-8222-222222222222' })).toBe(false);
  expect(sameBrokerFactsProducerIdentity(identity, { ...identity, revision: `sha256:${'b'.repeat(64)}` })).toBe(false);
});
