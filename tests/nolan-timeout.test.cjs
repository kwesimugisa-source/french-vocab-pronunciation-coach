const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const createLoader = require('./load-typescript.cjs');

for (const full of [true, false]) test(`${full ? 'full Nolan' : 'reduced'} application deadline and late-result protection`, async t => {
  const load = createLoader();
  const {prepareDramaticDirection} = load('lib/theatre-direction.ts');
  const items = load('lib/theatre.ts').parseTheatreItems('ALICE: Bonjour.');
  t.mock.timers.enable({apis:['setTimeout']});
  let calls = 0, signal, resolve;
  const pending = prepareDramaticDirection(items, (_json, s) => {
    calls++; signal = s; return new Promise(r => {resolve = r;});
  }, undefined, undefined, full ? {characters:[]} : undefined);
  await Promise.resolve();
  t.mock.timers.tick((full ? 60000 : 20000) - 1);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(signal.aborted, true);
  assert.equal(result.analysis, null);
  assert.equal(result.metadata.fallbackReason, 'timeout');
  resolve({}); await Promise.resolve();
  t.mock.timers.tick(120000);
  assert.equal(calls, 1);
  assert.equal(result.analysis, null);
});

for (const [enabled, requested, timeout] of [[true,true,60000],[false,true,20000],[true,false,20000]]) {
  test(`SDK timeout ${timeout}, Director ${enabled}/${requested}, no retry`, async () => {
    const {requestDramaticAnalysis} = createLoader()('lib/theatre-direction.ts');
    let calls = 0;
    const abort = new AbortController();
    const client = {responses:{create:async (_body, options) => {
      calls++; assert.equal(options.timeout,timeout); assert.equal(options.maxRetries,0);
      assert.equal(options.signal,abort.signal);
      return {status:'completed',output_text:'{}'};
    }}};
    await requestDramaticAnalysis(client,JSON.stringify({directorRequested:requested}),abort.signal,8192,enabled);
    assert.equal(calls,1);
  });
}

test('Theatre TTS retains independent 55-second SDK and 65-second route limits', () => {
  const source = fs.readFileSync('app/api/theatre-clip/route.ts','utf8');
  assert.match(source,/timeout:55_000,maxRetries:0/);
  assert.match(source,/deadlineMs:65_000/);
});
