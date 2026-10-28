'use strict';
// Tally connection layer (M1). Read-only: only ever sends export/list requests.
const http = require('http');
const { XMLParser } = require('fast-xml-parser');

const DEFAULT_URL = 'http://localhost:9000';

function unwrapError(err) {
  // WHY: Node wraps several failed addresses (::1 + 127.0.0.1) in an AggregateError
  // whose .message is EMPTY. Show the real reason of each inner error instead.
  if (!err) return 'Unknown error';
  if (Array.isArray(err.errors) && err.errors.length) {
    const parts = err.errors.map(e => describe(e));
    return [...new Set(parts)].join('; ');
  }
  return describe(err);
}
function describe(e) {
  const code = e.code || '';
  const addr = e.address ? ` ${e.address}${e.port ? ':' + e.port : ''}` : '';
  const msg = e.message || '';
  return (code + addr + (msg && !msg.startsWith(code) ? ' ' + msg : '')).trim() || String(e);
}

function friendly(err) {
  const raw = unwrapError(err);
  const codes = [err && err.code, ...((err && err.errors) || []).map(e => e.code)];
  if (err && err.name === 'AbortError') return { code: 'ABORTED', message: 'Request cancelled.', raw };
  if (codes.includes('ETIMEDOUT') || (err && err.code === 'TALLY_TIMEOUT'))
    return { code: 'TIMEOUT', message: 'Tally ne samay par uttar nahi diya (timeout). Tally busy ho sakta hai; timeout badhaiye ya baad me try kijiye.', raw };
  if (codes.some(c => ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(c)))
    return { code: codes.find(c => c) , message: 'Tally se connect nahi hua. Check karein: (1) TallyPrime open hai, (2) company load hai, (3) F1 > Settings > Connectivity > Client/Server = Both, port 9000 enabled.', raw };
  return { code: (err && err.code) || 'ERROR', message: 'Tally error: ' + raw, raw };
}

function candidateUrls(urlStr) {
  // WHY: 'localhost' may resolve to IPv6 ::1 while Tally listens on IPv4 only -> try 127.0.0.1 first.
  const u = new URL(urlStr || DEFAULT_URL);
  const out = [];
  if (u.hostname === 'localhost') { const v4 = new URL(u); v4.hostname = '127.0.0.1'; out.push(v4.toString()); }
  out.push(u.toString());
  return out;
}

function postOnce(urlStr, body, { timeoutMs = 30000, signal, maxBytes = 512 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; return reject(e); }
    const u = new URL(urlStr);
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname || '/', method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      const chunks = []; let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > maxBytes) { req.destroy(Object.assign(new Error('Response too large'), { code: 'TALLY_TOO_BIG' })); return; }
        chunks.push(c);
      });
      res.on('end', () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); });
      res.on('error', e => { cleanup(); reject(e); });
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'TALLY_TIMEOUT' })), timeoutMs);
    const onAbort = () => req.destroy(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    function cleanup() { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
    req.on('error', e => { cleanup(); reject(e); });
    req.end(body);
  });
}

async function post(urlStr, body, opts = {}) {
  let lastErr;
  for (const url of candidateUrls(urlStr)) {
    try { return await postOnce(url, body, opts); }
    catch (e) {
      if (e.name === 'AbortError' || e.code === 'TALLY_TIMEOUT') throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

const COMPANY_LIST_XML = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>AmficoCompanyList</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="AmficoCompanyList" ISMODIFY="No"><TYPE>Company</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

const CURRENT_COMPANY_XML = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>AmficoCurrent</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="AmficoCurrent"><FORMS>AmficoCurrent</FORMS></REPORT><FORM NAME="AmficoCurrent"><PARTS>AmficoCurrent</PARTS></FORM><PART NAME="AmficoCurrent"><LINES>AmficoCurrent</LINES></PART><LINE NAME="AmficoCurrent"><FIELDS>AmficoCurrent</FIELDS></LINE><FIELD NAME="AmficoCurrent"><SET>$$CurrentCompany</SET></FIELD></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });

function asArray(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
function text(v) { return typeof v === 'string' ? v : (v && v['#text']) || ''; }

function parseCompanies(xml) {
  const doc = parser.parse(xml);
  const coll = doc && doc.ENVELOPE && doc.ENVELOPE.BODY && doc.ENVELOPE.BODY.DATA && doc.ENVELOPE.BODY.DATA.COLLECTION;
  if (!coll) {
    const err = new Error('Unexpected answer from Tally (no company collection).'); err.code = 'TALLY_MALFORMED'; throw err;
  }
  return asArray(coll.COMPANY).map(c => text(c['@_NAME'] ? c['@_NAME'] : c.NAME)).filter(Boolean);
}

function parseCurrent(xml) {
  const m = /<AMFICOCURRENT>([\s\S]*?)<\/AMFICOCURRENT>/i.exec(xml);
  return m ? m[1].trim() : '';
}

async function listCompanies(url, opts) {
  const xml = await post(url, COMPANY_LIST_XML, opts);
  try { return parseCompanies(xml); }
  catch (e) { e.rawBody = xml; throw e; }
}
async function currentCompany(url, opts) {
  try { return parseCurrent(await post(url, CURRENT_COMPANY_XML, opts)); } catch { return ''; }
}

/** Full connection check used by status chip and CHECKTALLY. Never throws. */
async function checkConnection(url, opts = {}) {
  const started = Date.now();
  try {
    const companies = await listCompanies(url, opts);
    const current = await currentCompany(url, opts);
    return { ok: true, companies, current, ms: Date.now() - started };
  } catch (e) {
    const f = friendly(e);
    return { ok: false, code: f.code, message: f.message, raw: f.raw, ms: Date.now() - started, rawBody: e.rawBody };
  }
}

/** Decide which company to use: chosen (if open) else Tally's current company. */
function pickCompany(chosen, companies, current) {
  if (chosen) {
    if (companies.includes(chosen)) return { company: chosen };
    return { company: null, error: `Company "${chosen}" Tally me open nahi hai. Open companies: ${companies.join(', ') || '(none)'}.` };
  }
  if (current && companies.includes(current)) return { company: current };
  return companies.length ? { company: companies[0] } : { company: null, error: 'Tally me koi company open nahi hai.' };
}

module.exports = { unwrapError, friendly, candidateUrls, post, postOnce, listCompanies, currentCompany, checkConnection, parseCompanies, pickCompany, DEFAULT_URL };
