import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonFor, easter, thanksgiving, memorialDay, laborDay } from '../src/lib/seasons.js';

const at = (d) => seasonFor(d).id.replace('season-', '');

test('finds the holidays', () => {
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(thanksgiving(2026), '2026-11-26');
  assert.equal(memorialDay(2027), '2027-05-31');
  assert.equal(laborDay(2027), '2027-09-06');
});

test('picks holidays a little ahead and seasons otherwise', () => {
  const cases = {
    '2026-11-02': 'fall', '2026-11-12': 'thanksgiving', '2026-11-30': 'christmas', '2026-12-31': 'newyear',
    '2027-01-15': 'winter', '2027-02-10': 'valentines', '2027-03-20': 'easter', '2027-04-20': 'spring',
    '2027-05-28': 'patriotic', '2027-07-04': 'patriotic', '2027-07-20': 'summer', '2027-09-03': 'patriotic',
    '2027-10-15': 'fall',
  };
  for (const [date, want] of Object.entries(cases)) assert.equal(at(date), want, date);
});
