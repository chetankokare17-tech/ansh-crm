'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = { tallyUrl: 'http://localhost:9000', company: '', timeoutMs: 30000, fyBack: 2, autoSyncMin: 0 };

function validate(s) {
  const out = { ...DEFAULTS, ...s };
  try { const u = new URL(out.tallyUrl); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { out.tallyUrl = DEFAULTS.tallyUrl; }
  out.timeoutMs = Number.isFinite(+out.timeoutMs) && +out.timeoutMs >= 1000 ? +out.timeoutMs : DEFAULTS.timeoutMs;
  out.fyBack = Number.isInteger(+out.fyBack) && +out.fyBack >= 0 ? +out.fyBack : DEFAULTS.fyBack;
  out.autoSyncMin = [0, 1, 2, 5, 10, 30].includes(+out.autoSyncMin) ? +out.autoSyncMin : 0;
  out.company = String(out.company || '');
  return out;
}

function load(dir) {
  try { return validate(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'))); }
  catch { return validate({}); }
}
function save(dir, s) {
  fs.mkdirSync(dir, { recursive: true });
  const v = validate(s); const f = path.join(dir, 'settings.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f);
  return v;
}
module.exports = { load, save, validate, DEFAULTS };
