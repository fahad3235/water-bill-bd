// water-bill-bd \u2014 pure bill logic (no DOM). Node-testable.
// Money is integer paisa everywhere (1 taka = 100 paisa).
// Rates are paisa per 1,000 litres (1 WASA unit).
// Rate basis (see README for sources):
//   * Water rates from the 1 July 2024 WASA circular: residential 1670, commercial 4620.
//   * Sewerage charge equals the water charge (Financial Express, 2011 and 2017:
//     domestic water Tk 6.34 + sewerage Tk 6.34 + 15% VAT = Tk 14.56;
//     later Tk 8.09 + Tk 8.09 + 15% VAT = Tk 18.60).
//   * VAT 15% on (water + sewerage) \u2014 same two sources.
// All rates are user-editable in the app; these are defaults only.
(function (root) {
  'use strict';

  var APP = 'water-bill-bd';
  var VERSION = 1;

  var CATEGORIES = ['residential', 'commercial'];

  var DEFAULT_RATES = {
    water: { residential: 1670, commercial: 4620 },
    sewerage: { residential: 1670, commercial: 4620 },
    vatPct: 15,
    atmPaisaPerLitre: 100 // WASA Water ATM booths: Tk 1.00/litre incl. VAT, from 1 Mar 2026
  };

  // Verified water-rate history (paisa per 1,000 litres), water charge only.
  // 2020-09-01: 11.57/37.04 (UNB, Apr 2021 hike article: "last raised ... Sep 1 ...
  //   price ... was set at Tk 11.57 from Tk 11.02 ... Tk 37.04 from 35.28").
  // 2021-04-01: 14.46/40.00 (UNB: residential 14.46 from 11.57, commercial 40 from 37.04).
  // 2022-07-01: 15.18/42.00 (+5%; Dhaka Tribune 1 Jul 2024: "last price hike was in
  //   July 2022 when Dhaka Wasa increased water prices by 5%").
  // 2024-07-01: 16.70/46.20 (+10%; Prothom Alo / Daily Star / Dhaka Tribune, 29 May-1 Jul 2024).
  var RATE_HISTORY = [
    { from: '2020-09-01', residential: 1157, commercial: 3704 },
    { from: '2021-04-01', residential: 1446, commercial: 4000 },
    { from: '2022-07-01', residential: 1518, commercial: 4200 },
    { from: '2024-07-01', residential: 1670, commercial: 4620 }
  ];

  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];

  function toBnDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
  }

  function groupThousands(intPart) {
    return String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Format integer paisa as "\u09f31,152.30" (en) or "\u09f3\u09e7,\u09e7\u09eb\u09e8.\u09e9\u09e6" (bn).
  function formatTaka(paisa, lang) {
    var neg = paisa < 0;
    var abs = Math.abs(Math.round(paisa));
    var taka = Math.floor(abs / 100);
    var p = abs % 100;
    var s = '\u09f3' + groupThousands(taka) + '.' + (p < 10 ? '0' : '') + p;
    if (neg) s = '-' + s;
    return lang === 'bn' ? toBnDigits(s) : s;
  }

  // Format a plain number with grouping, optional decimals, optional Bengali digits.
  function formatNumber(n, lang, decimals) {
    var fixed = Number(n).toFixed(decimals == null ? 0 : decimals);
    var parts = fixed.split('.');
    var s = groupThousands(parts[0]) + (parts[1] != null ? '.' + parts[1] : '');
    return lang === 'bn' ? toBnDigits(s) : s;
  }

  function isFiniteNumber(x) { return typeof x === 'number' && isFinite(x); }

  function validRates(r) {
    if (!r || typeof r !== 'object') return false;
    if (!r.water || !r.sewerage) return false;
    var ok = true;
    CATEGORIES.forEach(function (c) {
      if (!isFiniteNumber(r.water[c]) || r.water[c] < 0 || r.water[c] > 100000) ok = false;
      if (!isFiniteNumber(r.sewerage[c]) || r.sewerage[c] < 0 || r.sewerage[c] > 100000) ok = false;
    });
    if (!isFiniteNumber(r.vatPct) || r.vatPct < 0 || r.vatPct > 100) ok = false;
    if (!isFiniteNumber(r.atmPaisaPerLitre) || r.atmPaisaPerLitre < 0 || r.atmPaisaPerLitre > 100000) ok = false;
    return ok;
  }

  function cloneRates(r) {
    return {
      water: { residential: r.water.residential, commercial: r.water.commercial },
      sewerage: { residential: r.sewerage.residential, commercial: r.sewerage.commercial },
      vatPct: r.vatPct,
      atmPaisaPerLitre: r.atmPaisaPerLitre
    };
  }

  // Core bill engine. opts: {category, litres, sewerageConnected, vatOn, arrearsPaisa, rates}
  // Partial units are charged pro-rata (labelled assumption in UI/README).
  function calcBill(opts) {
    var o = opts || {};
    if (CATEGORIES.indexOf(o.category) === -1) return { ok: false, error: 'bad-category' };
    if (!isFiniteNumber(o.litres) || o.litres <= 0 || o.litres > 10000000) return { ok: false, error: 'bad-litres' };
    var rates = validRates(o.rates) ? o.rates : DEFAULT_RATES;
    var arrears = isFiniteNumber(o.arrearsPaisa) && o.arrearsPaisa >= 0 && o.arrearsPaisa <= 100000000
      ? Math.round(o.arrearsPaisa) : 0;
    var units = o.litres / 1000;
    var waterPaisa = Math.round(units * rates.water[o.category]);
    var seweragePaisa = o.sewerageConnected === false ? 0
      : Math.round(units * rates.sewerage[o.category]);
    var subtotalPaisa = waterPaisa + seweragePaisa;
    var vatPaisa = o.vatOn === false ? 0 : Math.round(subtotalPaisa * rates.vatPct / 100);
    var totalPaisa = subtotalPaisa + vatPaisa + arrears;
    return {
      ok: true,
      category: o.category,
      litres: o.litres,
      units: units,
      waterPaisa: waterPaisa,
      seweragePaisa: seweragePaisa,
      subtotalPaisa: subtotalPaisa,
      vatPaisa: vatPaisa,
      vatPct: o.vatOn === false ? 0 : rates.vatPct,
      arrearsPaisa: arrears,
      totalPaisa: totalPaisa,
      perDayPaisa: Math.round(totalPaisa / 30),
      litresPerDay: o.litres / 30,
      effectivePer1000L: units > 0 ? totalPaisa / units : 0
    };
  }

  // Meter readings -> litres. unit: 'm3' (1 m3 = 1000 L) or 'litres'.
  function consumptionFromReadings(prev, curr, unit) {
    if (!isFiniteNumber(prev) || !isFiniteNumber(curr)) return { ok: false, error: 'bad-reading' };
    if (prev < 0 || curr < 0 || prev > 1000000 || curr > 1000000) return { ok: false, error: 'bad-reading' };
    if (curr < prev) return { ok: false, error: 'current-below-previous' };
    var diff = curr - prev;
    var litres = unit === 'litres' ? diff : diff * 1000;
    if (litres <= 0) return { ok: false, error: 'no-consumption' };
    return { ok: true, litres: litres, units: litres / 1000 };
  }

  // Usage estimator: people x litres/person/day x days -> litres + bill.
  function estimateUsage(opts) {
    var o = opts || {};
    if (!isFiniteNumber(o.people) || o.people < 1 || o.people > 100 || Math.floor(o.people) !== o.people)
      return { ok: false, error: 'bad-people' };
    if (!isFiniteNumber(o.litresPerPersonPerDay) || o.litresPerPersonPerDay < 1 || o.litresPerPersonPerDay > 1000)
      return { ok: false, error: 'bad-litres-per-person' };
    if (!isFiniteNumber(o.days) || o.days < 1 || o.days > 366 || Math.floor(o.days) !== o.days)
      return { ok: false, error: 'bad-days' };
    var litres = o.people * o.litresPerPersonPerDay * o.days;
    var bill = calcBill({
      category: o.category, litres: litres,
      sewerageConnected: o.sewerageConnected, vatOn: o.vatOn,
      arrearsPaisa: 0, rates: o.rates
    });
    if (!bill.ok) return bill;
    bill.people = o.people;
    bill.litresPerPersonPerDay = o.litresPerPersonPerDay;
    bill.days = o.days;
    return bill;
  }

  // WASA Water ATM (prepaid booth) calculator: Tk 1.00/litre incl. VAT.
  function atmCost(litres, rates) {
    if (!isFiniteNumber(litres) || litres <= 0 || litres > 1000000) return { ok: false, error: 'bad-litres' };
    var r = validRates(rates) ? rates : DEFAULT_RATES;
    return { ok: true, litres: litres, paisa: Math.round(litres * r.atmPaisaPerLitre) };
  }

  function atmLitresForMoney(taka, rates) {
    if (!isFiniteNumber(taka) || taka <= 0 || taka > 1000000) return { ok: false, error: 'bad-money' };
    var r = validRates(rates) ? rates : DEFAULT_RATES;
    if (r.atmPaisaPerLitre <= 0) return { ok: false, error: 'bad-rate' };
    return { ok: true, taka: taka, litres: taka * 100 / r.atmPaisaPerLitre };
  }

  // --- history record validation ---
  function validBillRecord(rec) {
    if (!rec || typeof rec !== 'object') return false;
    if (typeof rec.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) return false;
    if (CATEGORIES.indexOf(rec.category) === -1) return false;
    if (!isFiniteNumber(rec.litres) || rec.litres <= 0 || rec.litres > 10000000) return false;
    if (!isFiniteNumber(rec.totalPaisa) || rec.totalPaisa < 0 || rec.totalPaisa > 1000000000) return false;
    if (rec.label != null && typeof rec.label !== 'string') return false;
    return true;
  }

  function validateImport(payload) {
    var data = payload;
    if (typeof payload === 'string') {
      try { data = JSON.parse(payload); } catch (e) { return { ok: false, error: 'bad-json' }; }
    }
    if (!data || typeof data !== 'object') return { ok: false, error: 'bad-payload' };
    if (data.app !== APP) return { ok: false, error: 'wrong-app' };
    if (data.version !== VERSION) return { ok: false, error: 'wrong-version' };
    if (data.rates != null && !validRates(data.rates)) return { ok: false, error: 'bad-rates' };
    if (data.history != null) {
      if (!Array.isArray(data.history) || data.history.length > 500) return { ok: false, error: 'bad-history' };
      for (var i = 0; i < data.history.length; i++) {
        if (!validBillRecord(data.history[i])) return { ok: false, error: 'bad-history-record' };
      }
    }
    return { ok: true, data: data };
  }

  function historyTotals(history) {
    var total = 0, litres = 0;
    (history || []).forEach(function (rec) { total += rec.totalPaisa; litres += rec.litres; });
    return { count: history ? history.length : 0, totalPaisa: total, litres: litres };
  }

  var api = {
    APP: APP, VERSION: VERSION, CATEGORIES: CATEGORIES,
    DEFAULT_RATES: DEFAULT_RATES, RATE_HISTORY: RATE_HISTORY,
    toBnDigits: toBnDigits, formatTaka: formatTaka, formatNumber: formatNumber,
    validRates: validRates, cloneRates: cloneRates,
    calcBill: calcBill, consumptionFromReadings: consumptionFromReadings,
    estimateUsage: estimateUsage, atmCost: atmCost, atmLitresForMoney: atmLitresForMoney,
    validBillRecord: validBillRecord, validateImport: validateImport,
    historyTotals: historyTotals
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WaterBillLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
