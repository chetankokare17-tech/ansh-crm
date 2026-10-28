'use strict';
// Read-only connection test. Usage: node checktally.js [url]
const fs = require('fs');
const path = require('path');
const tally = require('./src/tally');
const url = process.argv[2] || process.env.TALLY_URL || tally.DEFAULT_URL;
(async () => {
  const r = await tally.checkConnection(url, { timeoutMs: 15000 });
  const L = [`CHECKTALLY ${new Date().toISOString()}`, `URL: ${url}`];
  if (r.ok) {
    L.push('RESULT: CONNECTED', `Time: ${r.ms} ms`, `Current company: ${r.current || '(unknown)'}`, `Open companies (${r.companies.length}):`, ...r.companies.map(c => '  - ' + c));
    if (!r.companies.length) L.push('DIAGNOSIS: Tally is reachable but no company is open. Open a company in TallyPrime.');
  } else {
    L.push('RESULT: NOT CONNECTED', `Reason: ${r.raw}`, `Advice: ${r.message}`);
    L.push('Likely causes: port 9000 not enabled (F1>Settings>Connectivity), Tally not running, company not open, firewall blocking, wrong port/IP.');
  }
  const out = L.join('\n'); console.log(out);
  fs.writeFileSync(path.join(__dirname, 'checktally.txt'), out + '\n');
  process.exit(r.ok ? 0 : 1);
})();
