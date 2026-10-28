'use strict';
const fs = require('fs');
const path = require('path');
// On every failure keep the first ~3 MB of Tally's raw answer for inspection.
function saveRaw(dir, raw) {
  if (!raw) return null;
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'tally_debug.xml');
  fs.writeFileSync(f, String(raw).slice(0, 3 * 1024 * 1024));
  return f;
}
module.exports = { saveRaw };
