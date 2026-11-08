// water-bill-bd \u2014 node unit tests (no dependencies).
// Usage: node tests/logic.test.js
const L = require('../js/logic.js');

let count = 0, failures = 0;
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}

// --- bill engine: hand-verified against the 1 Jul 2024 WASA rates ---
// Residential 10,000 L = 10 units: water 10x1670=16700, sewerage 16700,
// subtotal 33400, VAT 15% = 5010, total 38410.
let b = L.calcBill({ category: 'residential', litres: 10000, sewerageConnected: true, vatOn: true, arrearsPaisa: 0, rates: L.DEFAULT_RATES });
check('res 10000L water 16700', b.waterPaisa === 16700, JSON.stringify(b));
check('res 10000L sewerage 16700', b.seweragePaisa === 16700);
check('res 10000L subtotal 33400', b.subtotalPaisa === 33400);
check('res 10000L VAT 5010', b.vatPaisa === 5010);
check('res 10000L total 38410', b.totalPaisa === 38410);
check('res 10000L units 10', b.units === 10);
check('res 10000L perDay 1280 (38410/30=1280.33)', b.perDayPaisa === 1280);

// Residential 30,000 L: water 50100, sewerage 50100, subtotal 100200, VAT 15030, total 115230.
b = L.calcBill({ category: 'residential', litres: 30000, sewerageConnected: true, vatOn: true, arrearsPaisa: 0, rates: L.DEFAULT_RATES });
check('res 30000L total 115230', b.totalPaisa === 115230, JSON.stringify(b));
check('res 30000L VAT 15030', b.vatPaisa === 15030);

// Commercial 5,000 L: water 23100, sewerage 23100, subtotal 46200, VAT 6930, total 53130.
b = L.calcBill({ category: 'commercial', litres: 5000, sewerageConnected: true, vatOn: true, arrearsPaisa: 0, rates: L.DEFAULT_RATES });
check('com 5000L total 53130', b.totalPaisa === 53130, JSON.stringify(b));

// No sewerage: res 10000L -> water 16700, VAT 2505, total 19205.
b = L.calcBill({ category: 'residential', litres: 10000, sewerageConnected: false, vatOn: true, arrearsPaisa: 0, rates: L.DEFAULT_RATES });
check('no-sewerage total 19205', b.totalPaisa === 19205, JSON.stringify(b));
check('no-sewerage sewerage 0', b.seweragePaisa === 0);

// No VAT: total = subtotal.
b = L.calcBill({ category: 'residential', litres: 10000, sewerageConnected: true, vatOn: false, arrearsPaisa: 0, rates: L.DEFAULT_RATES });
check('no-VAT total 33400', b.totalPaisa === 33400 && b.vatPaisa === 0);

// Partial unit pro-rata: 500 L res -> water 835, sewerage 835, subtotal 1670,
// VAT round(250.5)=251, total 1921.
b = L.calcBill({ category: 'residential', litres: 500, sewerageConnected: true, vatOn: true, arrearsPaisa: 0, rates: L.DEFAULT_RATES });
check('500L total 1921 (VAT .5 rounds up)', b.totalPaisa === 1921, JSON.stringify(b));

// Arrears added: 10000L + 5000 paisa arrears -> 43410.
b = L.calcBill({ category: 'residential', litres: 10000, sewerageConnected: true, vatOn: true, arrearsPaisa: 5000, rates: L.DEFAULT_RATES });
check('arrears 5000 -> total 43410', b.totalPaisa === 43410);

// Validation.
check('bad category rejected', L.calcBill({ category: 'x', litres: 1000, rates: L.DEFAULT_RATES }).ok === false);
check('zero litres rejected', L.calcBill({ category: 'residential', litres: 0, rates: L.DEFAULT_RATES }).ok === false);
check('negative litres rejected', L.calcBill({ category: 'residential', litres: -5, rates: L.DEFAULT_RATES }).ok === false);
check('huge litres rejected', L.calcBill({ category: 'residential', litres: 99999999, rates: L.DEFAULT_RATES }).ok === false);

// --- meter readings ---
let c = L.consumptionFromReadings(123.5, 128.5, 'm3');
check('meter 123.5->128.5 m3 = 5000 L', c.ok && c.litres === 5000, JSON.stringify(c));
c = L.consumptionFromReadings(1000, 6000, 'litres');
check('meter 1000->6000 L = 5000 L', c.ok && c.litres === 5000);
check('current below previous rejected', L.consumptionFromReadings(10, 9, 'm3').error === 'current-below-previous');
check('equal readings rejected', L.consumptionFromReadings(10, 10, 'm3').error === 'no-consumption');
check('negative reading rejected', L.consumptionFromReadings(-1, 5, 'm3').ok === false);

// --- estimator: 4 people x 120 L x 30 days = 14400 L ---
// water 14.4x1670=24048, sewerage 24048, subtotal 48096, VAT round(7214.4)=7214, total 55310.
let e = L.estimateUsage({ people: 4, litresPerPersonPerDay: 120, days: 30, category: 'residential', sewerageConnected: true, vatOn: true, rates: L.DEFAULT_RATES });
check('estimator litres 14400', e.ok && e.litres === 14400, JSON.stringify(e));
check('estimator total 55310', e.totalPaisa === 55310);
check('estimator bad people rejected', L.estimateUsage({ people: 0, litresPerPersonPerDay: 120, days: 30, category: 'residential', rates: L.DEFAULT_RATES }).ok === false);
check('estimator bad lppd rejected', L.estimateUsage({ people: 4, litresPerPersonPerDay: 0, days: 30, category: 'residential', rates: L.DEFAULT_RATES }).ok === false);

// --- ATM booth: Tk 1.00/litre ---
let a = L.atmCost(20, L.DEFAULT_RATES);
check('ATM 20 L = 2000 paisa', a.ok && a.paisa === 2000, JSON.stringify(a));
a = L.atmCost(1, L.DEFAULT_RATES);
check('ATM 1 L = 100 paisa', a.ok && a.paisa === 100);
a = L.atmLitresForMoney(100, L.DEFAULT_RATES);
check('ATM Tk 100 = 100 L', a.ok && a.litres === 100, JSON.stringify(a));
check('ATM zero litres rejected', L.atmCost(0, L.DEFAULT_RATES).ok === false);

// --- formatting ---
check('formatTaka EN 38410', L.formatTaka(38410, 'en') === '\u09f3384.10', L.formatTaka(38410, 'en'));
check('formatTaka EN 115230', L.formatTaka(115230, 'en') === '\u09f31,152.30');
check('formatTaka BN 38410', L.formatTaka(38410, 'bn') === '\u09f3\u09e9\u09ee\u09ea.\u09e7\u09e6', L.formatTaka(38410, 'bn'));
check('formatTaka BN 115230', L.formatTaka(115230, 'bn') === '\u09f3\u09e7,\u09e7\u09eb\u09e8.\u09e9\u09e6');
check('formatTaka zero', L.formatTaka(0, 'en') === '\u09f30.00');
check('toBnDigits 2026', L.toBnDigits('2026') === '\u09e8\u09e6\u09e8\u09ec');
check('formatNumber BN', L.formatNumber(14400, 'bn') === '\u09e7\u09ea,\u09ea\u09e6\u09e6');

// --- rates ---
check('default res water 1670', L.DEFAULT_RATES.water.residential === 1670);
check('default com water 4620', L.DEFAULT_RATES.water.commercial === 4620);
check('default VAT 15', L.DEFAULT_RATES.vatPct === 15);
check('default ATM 100 paisa/L', L.DEFAULT_RATES.atmPaisaPerLitre === 100);
check('rate history has 4 rows', L.RATE_HISTORY.length === 4);
check('rate history latest 1670/4620', L.RATE_HISTORY[3].residential === 1670 && L.RATE_HISTORY[3].commercial === 4620);
check('rate history first 1157/3704', L.RATE_HISTORY[0].residential === 1157 && L.RATE_HISTORY[0].commercial === 3704);
check('validRates accepts defaults', L.validRates(L.DEFAULT_RATES) === true);
check('validRates rejects negative water', L.validRates({ water: { residential: -1, commercial: 4620 }, sewerage: { residential: 1670, commercial: 4620 }, vatPct: 15, atmPaisaPerLitre: 100 }) === false);
check('validRates rejects VAT 101', L.validRates({ water: { residential: 1670, commercial: 4620 }, sewerage: { residential: 1670, commercial: 4620 }, vatPct: 101, atmPaisaPerLitre: 100 }) === false);

// --- import validation ---
const good = JSON.stringify({ app: 'water-bill-bd', version: 1, rates: L.DEFAULT_RATES, history: [{ date: '2026-11-08', label: 'Oct', category: 'residential', litres: 10000, totalPaisa: 38410 }] });
check('import good payload ok', L.validateImport(good).ok === true);
check('import wrong app rejected', L.validateImport(JSON.stringify({ app: 'dua-bd', version: 1 })).ok === false);
check('import wrong version rejected', L.validateImport(JSON.stringify({ app: 'water-bill-bd', version: 2 })).ok === false);
check('import bad json rejected', L.validateImport('{nope').ok === false);
check('import bad record rejected', L.validateImport(JSON.stringify({ app: 'water-bill-bd', version: 1, history: [{ date: 'x', category: 'residential', litres: 1, totalPaisa: 1 }] })).ok === false);
check('import bad rates rejected', L.validateImport(JSON.stringify({ app: 'water-bill-bd', version: 1, rates: { water: { residential: -5 } } })).ok === false);
check('import empty history ok', L.validateImport(JSON.stringify({ app: 'water-bill-bd', version: 1, history: [] })).ok === true);

// --- history totals ---
const ht = L.historyTotals([
  { date: '2026-11-01', category: 'residential', litres: 10000, totalPaisa: 38410 },
  { date: '2026-10-01', category: 'residential', litres: 30000, totalPaisa: 115230 }
]);
check('history totals count 2', ht.count === 2);
check('history totals 153640', ht.totalPaisa === 153640);
check('history totals litres 40000', ht.litres === 40000);

console.log('\n' + count + ' checks, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
