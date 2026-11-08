// water-bill-bd \u2014 UI wiring. Depends on js/logic.js + js/data.js.
(function () {
  'use strict';
  var L = window.WaterBillLogic;
  var I18N = window.WaterBillData.I18N;
  var LS_KEY = 'water-bill-bd-v1';

  function asofToday() {
    var q = new URLSearchParams(window.location.search).get('asof');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  var state = {
    lang: 'en',
    rates: L.cloneRates(L.DEFAULT_RATES),
    history: [],
    lastBill: null
  };

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.lang === 'bn' || data.lang === 'en') state.lang = data.lang;
      if (data.rates && L.validRates(data.rates)) state.rates = L.cloneRates(data.rates);
      if (Array.isArray(data.history)) {
        state.history = data.history.filter(function (r) { return L.validBillRecord(r); }).slice(0, 500);
      }
    } catch (e) { /* corrupted storage: start fresh */ }
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        lang: state.lang, rates: state.rates, history: state.history
      }));
    } catch (e) { /* storage full/blocked: app still works in-memory */ }
  }

  function t(key) {
    return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
  }

  function $(id) { return document.getElementById(id); }
  function money(paisa) { return L.formatTaka(paisa, state.lang); }
  function num(n, dec) { return L.formatNumber(n, state.lang, dec == null ? 0 : dec); }

  function show(el, on) { el.hidden = !on; }
  function showError(el, key) {
    if (key) { el.textContent = t(key); show(el, true); }
    else show(el, false);
  }

  // ---------- i18n ----------
  function applyLang() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    $('title').textContent = t('title');
    $('langBtn').textContent = t('langBtn');
    renderRateHints();
    renderRateHistory();
    renderHistory();
    if (state.lastBill) renderBill(state.lastBill);
  }

  function renderRateHints() {
    $('resRateHint').textContent = '(' + money(state.rates.water.residential) + ' / 1,000 L)';
    $('comRateHint').textContent = '(' + money(state.rates.water.commercial) + ' / 1,000 L)';
  }

  // ---------- tabs ----------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.hidden = p.id !== 'tab-' + name;
    });
    if (name === 'rates') fillRateForm();
    if (name === 'history') renderHistory();
  }

  // ---------- bill rendering ----------
  function billRows(bill) {
    var rows = '';
    rows += '<tr><td>' + t('waterCharge') + '</td><td>' + money(bill.waterPaisa) + '</td></tr>';
    if (bill.seweragePaisa > 0 || bill.seweragePaisa === 0) {
      rows += '<tr><td>' + t('sewerageCharge') + '</td><td>' + money(bill.seweragePaisa) + '</td></tr>';
    }
    rows += '<tr><td>' + t('subtotal') + '</td><td>' + money(bill.subtotalPaisa) + '</td></tr>';
    if (bill.vatPaisa > 0) {
      rows += '<tr><td>' + t('vatRow') + ' (' + num(bill.vatPct, 0) + '%)</td><td>' + money(bill.vatPaisa) + '</td></tr>';
    }
    if (bill.arrearsPaisa > 0) {
      rows += '<tr><td>' + t('arrearsRow') + '</td><td>' + money(bill.arrearsPaisa) + '</td></tr>';
    }
    rows += '<tr class="total-row"><td>' + t('total') + '</td><td>' + money(bill.totalPaisa) + '</td></tr>';
    return rows;
  }

  function renderBill(bill) {
    state.lastBill = bill;
    $('billTotal').textContent = money(bill.totalPaisa);
    $('billRows').innerHTML = billRows(bill);
    $('statUnits').textContent = num(bill.units, 2);
    $('statPerDay').textContent = money(bill.perDayPaisa);
    $('statLpd').textContent = num(bill.litresPerDay, 0);
    $('statPer1000').textContent = money(Math.round(bill.effectivePer1000L));
    show($('billCard'), true);
    show($('savedMsg'), false);
  }

  function currentCategory() {
    var r = document.querySelector('input[name="category"]:checked');
    return r ? r.value : 'residential';
  }

  function doCalculate() {
    var mode = document.querySelector('input[name="inputMode"]:checked').value;
    var litres = null;
    if (mode === 'direct') {
      var v = parseFloat($('litresInput').value);
      if (!isFinite(v) || v <= 0 || v > 10000000) { showError($('calcError'), 'errBadLitres'); return; }
      litres = v;
    } else {
      var unit = document.querySelector('input[name="readUnit"]:checked').value;
      var prev = parseFloat($('prevReading').value);
      var curr = parseFloat($('currReading').value);
      if (!isFinite(prev) || !isFinite(curr) || prev < 0 || curr < 0) { showError($('calcError'), 'errBadReading'); return; }
      var c = L.consumptionFromReadings(prev, curr, unit);
      if (!c.ok) {
        showError($('calcError'), c.error === 'current-below-previous' ? 'errCurrBelowPrev'
          : c.error === 'no-consumption' ? 'errNoConsumption' : 'errBadReading');
        return;
      }
      litres = c.litres;
    }
    var arrearsTaka = parseFloat($('arrearsInput').value);
    var bill = L.calcBill({
      category: currentCategory(),
      litres: litres,
      sewerageConnected: $('sewerageChk').checked,
      vatOn: $('vatChk').checked,
      arrearsPaisa: isFinite(arrearsTaka) && arrearsTaka > 0 ? Math.round(arrearsTaka * 100) : 0,
      rates: state.rates
    });
    if (!bill.ok) { showError($('calcError'), 'errBadLitres'); return; }
    showError($('calcError'), null);
    renderBill(bill);
  }

  function saveBill() {
    if (!state.lastBill) return;
    var rec = {
      date: asofToday(),
      label: $('billLabel').value.trim().slice(0, 60),
      category: state.lastBill.category,
      litres: state.lastBill.litres,
      totalPaisa: state.lastBill.totalPaisa
    };
    if (!L.validBillRecord(rec)) return;
    state.history.unshift(rec);
    state.history = state.history.slice(0, 500);
    save();
    $('savedMsg').textContent = t('savedMsg');
    show($('savedMsg'), true);
  }

  // ---------- estimator ----------
  function doEstimate() {
    var people = parseInt($('estPeople').value, 10);
    var lppd = parseFloat($('estLppd').value);
    var days = parseInt($('estDays').value, 10);
    var res = L.estimateUsage({
      people: people, litresPerPersonPerDay: lppd, days: days,
      category: $('estCategory').value,
      sewerageConnected: true, vatOn: true, rates: state.rates
    });
    if (!res.ok) { showError($('estError'), 'errBadLitres'); return; }
    showError($('estError'), null);
    $('estLitresOut').textContent = num(res.litres, 0) + ' L';
    $('estRows').innerHTML = billRows(res);
    $('estTotal').textContent = t('total') + ': ' + money(res.totalPaisa);
    show($('estCard'), true);
  }

  // ---------- ATM ----------
  function doAtmPrice() {
    var litres = parseFloat($('atmLitres').value);
    var r = L.atmCost(litres, state.rates);
    if (!r.ok) { $('atmCostOut').textContent = '\u2014'; $('atmCompare').hidden = true; return; }
    $('atmCostOut').textContent = t('atmCost') + ': ' + money(r.paisa);
    var piped = L.calcBill({
      category: 'residential', litres: litres,
      sewerageConnected: true, vatOn: true, arrearsPaisa: 0, rates: state.rates
    });
    $('atmCompare').textContent = t('atmPiped') + ' ' + money(piped.totalPaisa) + '.';
    $('atmCompare').hidden = false;
  }

  function doAtmLitres() {
    var taka = parseFloat($('atmMoney').value);
    var r = L.atmLitresForMoney(taka, state.rates);
    if (!r.ok) { $('atmLitresOut').textContent = '\u2014'; return; }
    $('atmLitresOut').textContent = t('atmLitresOut') + ': ' + num(r.litres, 0) + ' L';
  }

  // ---------- rates ----------
  function fillRateForm() {
    $('rateWaterRes').value = (state.rates.water.residential / 100).toFixed(2);
    $('rateWaterCom').value = (state.rates.water.commercial / 100).toFixed(2);
    $('rateSewerRes').value = (state.rates.sewerage.residential / 100).toFixed(2);
    $('rateSewerCom').value = (state.rates.sewerage.commercial / 100).toFixed(2);
    $('rateVat').value = state.rates.vatPct;
    $('rateAtm').value = state.rates.atmPaisaPerLitre;
  }

  function readRateForm() {
    var g = function (id) { return parseFloat($(id).value); };
    return {
      water: {
        residential: Math.round(g('rateWaterRes') * 100),
        commercial: Math.round(g('rateWaterCom') * 100)
      },
      sewerage: {
        residential: Math.round(g('rateSewerRes') * 100),
        commercial: Math.round(g('rateSewerCom') * 100)
      },
      vatPct: g('rateVat'),
      atmPaisaPerLitre: g('rateAtm')
    };
  }

  function doSaveRates() {
    var r = readRateForm();
    if (!L.validRates(r)) { showError($('ratesError'), 'errBadLitres'); return; }
    showError($('ratesError'), null);
    state.rates = L.cloneRates(r);
    save();
    renderRateHints();
    $('ratesMsg').textContent = t('ratesSaved');
    show($('ratesMsg'), true);
  }

  function doResetRates() {
    state.rates = L.cloneRates(L.DEFAULT_RATES);
    save();
    fillRateForm();
    renderRateHints();
    $('ratesMsg').textContent = t('ratesReset');
    show($('ratesMsg'), true);
  }

  function renderRateHistory() {
    var body = $('rateHistBody');
    body.innerHTML = L.RATE_HISTORY.map(function (row) {
      return '<tr><td>' + row.from + '</td><td>' + money(row.residential) + '</td><td>' + money(row.commercial) + '</td></tr>';
    }).join('');
  }

  // ---------- history ----------
  function renderHistory() {
    var totals = L.historyTotals(state.history);
    $('histTotalOut').textContent = money(totals.totalPaisa);
    $('histCountOut').textContent = num(totals.count, 0) + ' ' + t('histCount') + ' \u00b7 ' + num(totals.litres, 0) + ' L';
    show($('histEmpty'), state.history.length === 0);
    var body = $('histBody');
    body.innerHTML = state.history.map(function (rec, i) {
      return '<tr><td>' + rec.date + '</td><td>' + escapeHtml(rec.label || '') + '</td><td>' +
        num(rec.litres, 0) + '</td><td>' + money(rec.totalPaisa) +
        '</td><td><button type="button" class="del-btn" data-del="' + i + '">' + t('deleteBtn') + '</button></td></tr>';
    }).join('');
    body.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.history.splice(+btn.getAttribute('data-del'), 1);
        save();
        renderHistory();
      });
    });
    renderChart();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderChart() {
    var svg = $('histChart');
    var last = state.history.slice(0, 8).reverse();
    if (!last.length) { svg.innerHTML = ''; return; }
    var max = Math.max.apply(null, last.map(function (r) { return r.totalPaisa; })) || 1;
    var W = 800, H = 160, bw = 70, gap = 20;
    var html = '';
    last.forEach(function (rec, i) {
      var h = Math.max(4, Math.round(rec.totalPaisa / max * 120));
      var x = 10 + i * (bw + gap);
      var y = 140 - h;
      html += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h +
        '" fill="#0e7c7b"><title>' + rec.date + ' \u2014 ' + money(rec.totalPaisa) + '</title></rect>';
      html += '<text x="' + (x + bw / 2) + '" y="156" font-size="11" text-anchor="middle" fill="#5b6b7a">' +
        rec.date.slice(5) + '</text>';
    });
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = html;
  }

  function exportPayload() {
    return JSON.stringify({ app: L.APP, version: L.VERSION, rates: state.rates, history: state.history }, null, 2);
  }

  function doExport() {
    var blob = new Blob([exportPayload()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'water-bill-bd-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function importPayload(text) {
    var v = L.validateImport(text);
    if (!v.ok) return { ok: false, error: v.error };
    if (v.data.rates) state.rates = L.cloneRates(v.data.rates);
    if (Array.isArray(v.data.history)) state.history = v.data.history.slice(0, 500);
    save();
    applyLang();
    return { ok: true };
  }

  function eraseAll() {
    state.history = [];
    state.rates = L.cloneRates(L.DEFAULT_RATES);
    state.lastBill = null;
    save();
    applyLang();
  }

  // ---------- wiring ----------
  function init() {
    load();
    applyLang();
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });
    $('langBtn').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      save();
      applyLang();
    });
    document.querySelectorAll('input[name="inputMode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var meter = document.querySelector('input[name="inputMode"]:checked').value === 'meter';
        show($('meterRows'), meter);
        show($('directRow'), !meter);
      });
    });
    $('calcBtn').addEventListener('click', doCalculate);
    $('saveBillBtn').addEventListener('click', saveBill);
    $('estBtn').addEventListener('click', doEstimate);
    $('atmBtn').addEventListener('click', doAtmPrice);
    $('atmMoneyBtn').addEventListener('click', doAtmLitres);
    $('saveRatesBtn').addEventListener('click', doSaveRates);
    $('resetRatesBtn').addEventListener('click', doResetRates);
    $('exportBtn').addEventListener('click', doExport);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function () {
      var f = $('importFile').files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var r = importPayload(String(rd.result));
        if (r.ok) {
          $('importMsg').textContent = t('importOk');
          show($('importMsg'), true);
          showError($('importError'), null);
        } else {
          showError($('importError'), null);
          $('importError').textContent = t('importBad') + r.error;
          show($('importError'), true);
        }
        renderHistory();
      };
      rd.readAsText(f);
      $('importFile').value = '';
    });
    $('eraseBtn').addEventListener('click', function () {
      var ans = window.prompt(t('eraseConfirm'));
      if (ans === 'DELETE') {
        eraseAll();
        $('importMsg').textContent = t('eraseDone');
        show($('importMsg'), true);
      }
    });
  }

  // Test hooks (used by tests/smoke.js only).
  window.__water = {
    state: state,
    exportPayload: exportPayload,
    importPayload: importPayload,
    eraseAll: eraseAll,
    renderHistory: renderHistory
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
