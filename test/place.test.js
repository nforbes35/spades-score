import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundDevice } from '../src/lib/place.js';

const dev = (id, role, place, since = 1) => ({ id, role, place, since, call: true, name: id });

test('at the table, the table phone handles sound and the extra cameras stay quiet', () => {
  const host = dev('host', 'host', 'home', 5);
  const cam = dev('cam', 'guest', 'home', 1);
  assert.equal(soundDevice(cam, [host]).id, 'host');
  assert.equal(soundDevice(host, [cam]).id, 'host');
});

test('at a remote player\'s home, their phone handles sound, not the TV', () => {
  const host = dev('host', 'host', 'table');
  const player = dev('sue', 'player', 'sues');
  const tv = dev('tv', 'tv', 'sues');
  assert.equal(soundDevice(tv, [host, player]).id, 'sue');
  assert.equal(soundDevice(player, [host, tv]).id, 'sue');
});

test('a device alone in its place keeps its own sound', () => {
  const host = dev('host', 'host', 'table');
  const grandma = dev('gma', 'guest', 'gmas');
  assert.equal(soundDevice(grandma, [host]), null);
});

test('two guests in one house without a player: whoever joined first', () => {
  const a = dev('a', 'guest', 'house', 10);
  const b = dev('b', 'guest', 'house', 20);
  assert.equal(soundDevice(b, [a]).id, 'a');
  assert.equal(soundDevice(a, [b]).id, 'a');
});

test('unknown place (network check failed): never muted by default', () => {
  const host = dev('host', 'host', 'table');
  assert.equal(soundDevice(dev('x', 'guest', null), [host]), null);
});

test('devices not in the video call do not count', () => {
  const host = { ...dev('host', 'host', 'home'), call: false };
  assert.equal(soundDevice(dev('cam', 'guest', 'home'), [host]), null);
});
