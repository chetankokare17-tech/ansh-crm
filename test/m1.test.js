'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const tally = require('../src/tally');
const { RetryPolicy } = require('../src/retry');
const settings = require('../src/settings');

function fake(handler) {
  return new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
}
const companyXml = '<ENVELOPE><BODY><DATA><COLLECTION><COMPANY NAME="A Co"><NAME>A Co</NAME></COMPANY><COMPANY NAME="B Co"><NAME>B Co</NAME></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>';

test('lists companies and current company from fake Tally', async () => {
  const s = await fake((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    res.end(b.includes('AmficoCurrent') ? '<ENVELOPE><AMFICOCURRENT>B Co</AMFICOCURRENT></ENVELOPE>' : companyXml); }); });
  const r = await tally.checkConnection('http://localhost:' + s.address().port);
  s.close();
  assert.deepStrictEqual(r.companies, ['A Co', 'B Co']); assert.strictEqual(r.current, 'B Co'); assert.ok(r.ok);
});

test('connection refused gives real reason, not empty AggregateError message', async () => {
  const s = await fake(() => {}); const port = s.address().port; await new Promise(r => s.close(r));
  const r = await tally.checkConnection('http://localhost:' + port, { timeoutMs: 2000 });
  assert.strictEqual(r.ok, false); assert.match(r.raw, /ECONNREFUSED/); assert.match(r.message, /connect nahi hua/);
});

test('unwrapError unwraps AggregateError with empty message', () => {
  const a = new AggregateError([Object.assign(new Error('x'), { code: 'ECONNREFUSED', address: '::1', port: 9000 }), Object.assign(new Error('y'), { code: 'ECONNREFUSED', address: '127.0.0.1', port: 9000 })], '');
  const m = tally.unwrapError(a); assert.match(m, /127\.0\.0\.1:9000/); assert.match(m, /::1:9000/);
});

test('timeout does not hang', async () => {
  const s = await fake(() => {});
  const t = Date.now();
  const r = await tally.checkConnection('http://127.0.0.1:' + s.address().port, { timeoutMs: 300 });
  s.closeAllConnections(); s.close();
  assert.strictEqual(r.code, 'TIMEOUT'); assert.ok(Date.now() - t < 3000);
});

test('abort cancels in-flight request', async () => {
  const s = await fake(() => {}); const ac = new AbortController();
  setTimeout(() => ac.abort(), 100);
  await assert.rejects(tally.post('http://127.0.0.1:' + s.address().port, '<x/>', { signal: ac.signal, timeoutMs: 5000 }), { name: 'AbortError' });
  s.closeAllConnections(); s.close();
});

test('malformed answer is reported, raw body kept', async () => {
  const s = await fake((q, res) => res.end('<html>nope</html>'));
  const r = await tally.checkConnection('http://127.0.0.1:' + s.address().port); s.close();
  assert.strictEqual(r.ok, false); assert.strictEqual(r.rawBody, '<html>nope</html>');
});

test('pickCompany rules', () => {
  assert.strictEqual(tally.pickCompany('A', ['A', 'B'], 'B').company, 'A');
  assert.strictEqual(tally.pickCompany('', ['A', 'B'], 'B').company, 'B');
  assert.ok(tally.pickCompany('Z', ['A'], 'A').error);
});

test('retry: 30/60/120s then stops after 3 failures; reset restarts', () => {
  const timers = []; const p = new RetryPolicy({ setTimer: (f, d) => { timers.push(d); return 1; }, clearTimer() {} });
  assert.deepStrictEqual([p.onFailure(() => {}).delayMs, p.onFailure(() => {}).delayMs, p.onFailure(() => {}).delayMs], [30000, 60000, 120000]);
  assert.strictEqual(p.onFailure(() => {}).retry, false); assert.ok(p.stopped);
  p.reset(); assert.strictEqual(p.onFailure(() => {}).delayMs, 30000);
});

test('settings validate bad input', () => {
  const v = settings.validate({ tallyUrl: 'not a url', timeoutMs: -5, autoSyncMin: 7 });
  assert.strictEqual(v.tallyUrl, 'http://localhost:9000'); assert.strictEqual(v.timeoutMs, 30000); assert.strictEqual(v.autoSyncMin, 0);
});
