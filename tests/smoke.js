// water-bill-bd \u2014 headless-Chrome smoke test via raw CDP (no puppeteer dependency).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
// ?asof=2026-11-08 pins "today" for saved-bill dates.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9348;
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?asof=2026-11-08';
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/water-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
    }
  };
  function send(method, params) {
    return new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };

  check('page title contains Water Bill', (await ev('document.title'))?.includes('Water Bill'));
  check('5 tabs render', (await ev(`document.querySelectorAll('.tab').length`)) === 5);
  check('calc tab visible by default', (await ev(`document.getElementById('tab-calc').hidden`)) === false);
  check('residential rate hint shows \u09f316.70', (await ev(`document.getElementById('resRateHint').textContent`)).includes('16.70'));
  check('commercial rate hint shows \u09f346.20', (await ev(`document.getElementById('comRateHint').textContent`)).includes('46.20'));
  check('disclaimer renders', (await ev(`document.querySelector('footer p').textContent.length`)) > 40);

  // Calculator: residential 10,000 L -> total \u09f3384.10.
  await ev(`document.getElementById('litresInput').value='10000';`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('res 10000L total \u09f3384.10', (await ev(`document.getElementById('billTotal').textContent`)) === '\u09f3384.10');
  check('breakdown shows water \u09f3167.00', (await ev(`document.getElementById('billRows').textContent`)).includes('\u09f3167.00'));
  check('breakdown shows VAT \u09f350.10', (await ev(`document.getElementById('billRows').textContent`)).includes('\u09f350.10'));
  check('units stat 10', (await ev(`document.getElementById('statUnits').textContent`)) === '10.00');
  check('per-day stat \u09f312.80', (await ev(`document.getElementById('statPerDay').textContent`)) === '\u09f312.80');

  // Commercial 5,000 L -> \u09f3531.30.
  await ev(`document.querySelector('input[name="category"][value="commercial"]').click();`);
  await ev(`document.getElementById('litresInput').value='5000';`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('com 5000L total \u09f3531.30', (await ev(`document.getElementById('billTotal').textContent`)) === '\u09f3531.30');

  // No sewerage: residential 10,000 L -> \u09f3192.05.
  await ev(`document.querySelector('input[name="category"][value="residential"]').click();`);
  await ev(`document.getElementById('sewerageChk').click();`);
  await ev(`document.getElementById('litresInput').value='10000';`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('no-sewerage total \u09f3192.05', (await ev(`document.getElementById('billTotal').textContent`)) === '\u09f3192.05');
  await ev(`document.getElementById('sewerageChk').click();`);

  // Validation: zero litres shows inline error.
  await ev(`document.getElementById('litresInput').value='0';`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('zero litres shows error', (await ev(`document.getElementById('calcError').hidden`)) === false);

  // Meter mode: 123.5 -> 128.5 m3 = 5000 L residential -> \u09f3192.05.
  await ev(`document.querySelector('input[name="inputMode"][value="meter"]').click();`);
  check('meter rows shown', (await ev(`document.getElementById('meterRows').hidden`)) === false);
  await ev(`document.getElementById('prevReading').value='123.5'; document.getElementById('currReading').value='128.5';`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('meter 5000L total \u09f3192.05', (await ev(`document.getElementById('billTotal').textContent`)) === '\u09f3192.05');
  // Meter error: current below previous.
  await ev(`document.getElementById('currReading').value='100';`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('meter current<prev shows error', (await ev(`document.getElementById('calcError').hidden`)) === false);
  await ev(`document.querySelector('input[name="inputMode"][value="direct"]').click();`);

  // Save bill + history totals + reload persistence.
  await ev(`document.getElementById('litresInput').value='10000';`);
  await ev(`document.getElementById('calcBtn').click()`);
  await ev(`document.getElementById('billLabel').value='October bill'; document.getElementById('saveBillBtn').click();`);
  check('saved message shows', (await ev(`document.getElementById('savedMsg').hidden`)) === false);
  await ev(`document.getElementById('tabbtn-history').click()`);
  check('history total \u09f3384.10', (await ev(`document.getElementById('histTotalOut').textContent`)) === '\u09f3384.10');
  check('history row label October bill', (await ev(`document.getElementById('histBody').textContent`)).includes('October bill'));
  check('history chart has 1 bar', (await ev(`document.querySelectorAll('#histChart rect').length`)) === 1);
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  await ev(`document.getElementById('tabbtn-history').click()`);
  check('saved bill persists after reload', (await ev(`document.getElementById('histTotalOut').textContent`)) === '\u09f3384.10');

  // Estimator: 4 people x 120 L x 30 days = 14400 L -> \u09f3553.10.
  await ev(`document.getElementById('tabbtn-estimate').click()`);
  await ev(`document.getElementById('estBtn').click()`);
  check('estimator litres 14,400 L', (await ev(`document.getElementById('estLitresOut').textContent`)).includes('14,400'));
  check('estimator total \u09f3553.10', (await ev(`document.getElementById('estTotal').textContent`)).includes('\u09f3553.10'));

  // ATM: 20 L -> \u09f320.00, piped comparison \u09f30.76 (20L res: water 33 + sewer 33 = 66, VAT 10 -> 76 paisa).
  await ev(`document.getElementById('tabbtn-atm').click()`);
  await ev(`document.getElementById('atmBtn').click()`);
  check('ATM 20L = \u09f320.00', (await ev(`document.getElementById('atmCostOut').textContent`)).includes('\u09f320.00'));
  check('ATM piped comparison shows', (await ev(`document.getElementById('atmCompare').hidden`)) === false);
  check('ATM piped comparison \u09f30.76', (await ev(`document.getElementById('atmCompare').textContent`)).includes('\u09f30.76'));
  await ev(`document.getElementById('atmMoneyBtn').click()`);
  check('ATM \u09f3100 = 100 L', (await ev(`document.getElementById('atmLitresOut').textContent`)).includes('100 L'));

  // Rates tab: 4 history rows; edit water res rate to 20.00, save, calc reflects it.
  await ev(`document.getElementById('tabbtn-rates').click()`);
  check('rate history has 4 rows', (await ev(`document.querySelectorAll('#rateHistBody tr').length`)) === 4);
  check('rate history shows \u09f316.70', (await ev(`document.getElementById('rateHistBody').textContent`)).includes('\u09f316.70'));
  check('rate history shows 2021 row \u09f314.46', (await ev(`document.getElementById('rateHistBody').textContent`)).includes('\u09f314.46'));
  await ev(`document.getElementById('rateWaterRes').value='20.00';`);
  await ev(`document.getElementById('saveRatesBtn').click()`);
  check('rates saved message', (await ev(`document.getElementById('ratesMsg').hidden`)) === false);
  await ev(`document.getElementById('tabbtn-calc').click()`);
  await ev(`document.getElementById('litresInput').value='10000';`);
  await ev(`document.getElementById('calcBtn').click()`);
  // 10000L at 20.00 water + 16.70 sewer: water 20000, sewer 16700, subtotal 36700, VAT 5505, total 42205.
  check('edited rate total \u09f3422.05', (await ev(`document.getElementById('billTotal').textContent`)) === '\u09f3422.05');
  // Reset rates.
  await ev(`document.getElementById('tabbtn-rates').click()`);
  await ev(`document.getElementById('resetRatesBtn').click()`);
  check('rate reset to 16.70', (await ev(`document.getElementById('rateWaterRes').value`)) === '16.70');

  // Export / import round-trip + invalid import via test hooks.
  const payload = await ev(`window.__water.exportPayload()`);
  check('export payload is water-bill-bd v1', payload.includes('"app": "water-bill-bd"') && payload.includes('"version": 1'), payload);
  check('export payload carries saved bill', payload.includes('October bill'));
  await ev(`window.__water.eraseAll()`);
  check('eraseAll clears history total', (await ev(`window.__water.exportPayload()`)).includes('"history": []'));
  const imp = await ev(`JSON.stringify(window.__water.importPayload(${JSON.stringify(payload)}))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import restores saved bill', (await ev(`JSON.stringify(window.__water.exportPayload())`)).includes('October bill'));
  const badImp = await ev(`JSON.stringify(window.__water.importPayload('{"app":"dua-bd","version":1}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`JSON.stringify(window.__water.exportPayload())`)).includes('October bill'));
  await ev(`window.__water.eraseAll()`);

  // Language toggle: Bengali title + digits, persists after reload.
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: title in Bengali', (await ev(`document.getElementById('title').textContent`)) === '\u09aa\u09be\u09a8\u09bf\u09b0 \u09ac\u09bf\u09b2 \u09ac\u09bf\u09a1\u09bf');
  check('BN toggle: tab label in Bengali', (await ev(`document.getElementById('tabbtn-calc').textContent`)) === '\u0995\u09cd\u09af\u09be\u09b2\u0995\u09c1\u09b2\u09c7\u099f\u09b0');
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('BN toggle persists after reload', (await ev(`window.__water.state.lang`)) === 'bn');
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__water.state.lang`)) === 'en');

  // Mobile 390px: no horizontal overflow on calc + rates + history tabs.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow (calc)', overflow <= 0, 'overflow=' + overflow);
  await ev(`document.getElementById('tabbtn-rates').click()`);
  const overflow2 = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow (rates)', overflow2 <= 0, 'overflow=' + overflow2);
  await ev(`document.getElementById('tabbtn-history').click()`);
  const overflow3 = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow (history)', overflow3 <= 0, 'overflow=' + overflow3);

  // Zero network requests: app is fully offline (only file:// loads).
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
