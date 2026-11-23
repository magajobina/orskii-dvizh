import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_MS, visibleCharacters } from '../src/engine/typewriter.ts';

test('text remains hidden during delay, then types gradually and stops at its full length', () => {
  assert.equal(visibleCharacters(10, 999, 1000), 0);
  assert.equal(visibleCharacters(10, 1000, 1000), 0);
  assert.equal(visibleCharacters(10, 1000 + CHARACTER_MS, 1000), 1);
  assert.equal(visibleCharacters(10, 1000 + CHARACTER_MS * 4, 1000), 4);
  assert.equal(visibleCharacters(10, 999999, 1000), 10);
  assert.equal(visibleCharacters(0, 999999), 0);
  assert.equal(visibleCharacters(10, CHARACTER_MS), 1);
});
