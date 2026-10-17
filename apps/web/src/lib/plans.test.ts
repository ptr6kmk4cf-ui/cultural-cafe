import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyAiLimit } from './plans';

test('the daily AI limit can be changed or turned off with a setting', () => {
  const keep = { f: process.env.AI_DAILY_LIMIT_FREE, p: process.env.AI_DAILY_LIMIT_PREMIUM };
  try {
    delete process.env.AI_DAILY_LIMIT_FREE;
    delete process.env.AI_DAILY_LIMIT_PREMIUM;
    assert.equal(dailyAiLimit('FREE'), 300);
    assert.equal(dailyAiLimit('PREMIUM'), 600);
    process.env.AI_DAILY_LIMIT_FREE = '2000';
    assert.equal(dailyAiLimit('FREE'), 2000);
    for (const off of ['unlimited', 'off', '0', 'UNLIMITED']) {
      process.env.AI_DAILY_LIMIT_FREE = off;
      assert.equal(dailyAiLimit('FREE'), null, off);
    }
    process.env.AI_DAILY_LIMIT_FREE = 'lots';
    assert.equal(dailyAiLimit('FREE'), 300);
  } finally {
    if (keep.f === undefined) delete process.env.AI_DAILY_LIMIT_FREE; else process.env.AI_DAILY_LIMIT_FREE = keep.f;
    if (keep.p === undefined) delete process.env.AI_DAILY_LIMIT_PREMIUM; else process.env.AI_DAILY_LIMIT_PREMIUM = keep.p;
  }
});
