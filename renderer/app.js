'use strict';
const $ = id => document.getElementById(id);
window.mis.getSettings().then(s => { $('url').value = s.tallyUrl; });
$('refresh').onclick = () => window.mis.refresh();
$('save').onclick = async () => { const s = await window.mis.getSettings(); s.tallyUrl = $('url').value; window.mis.saveSettings(s); };
window.mis.onStatus(s => {
  const chip = $('chip'); chip.className = ''; $('msg').textContent = '';
  if (s.state === 'checking') chip.textContent = 'checking…';
  else if (s.state === 'connected') {
    chip.className = 'ok'; chip.textContent = 'Tally connected · ' + new Date(s.lastSync).toLocaleTimeString();
    $('co').innerHTML = ''; (s.companies || []).forEach(c => { const o = document.createElement('option'); o.textContent = c; o.selected = c === s.company; $('co').appendChild(o); });
    $('msg').textContent = s.error || '';
  } else {
    chip.className = 'bad';
    chip.textContent = 'offline · saved data' + (s.lastSync ? ' · ' + new Date(s.lastSync).toLocaleTimeString() : '');
    $('msg').textContent = s.message + ' [' + s.raw + '] ' + (s.gaveUp ? 'Retry 3 baar fail hua, ruk gaya. Refresh dabaiye.' : 'Dobara try: ' + s.retryInSec + 's (' + s.attempt + '/3)');
  }
});
