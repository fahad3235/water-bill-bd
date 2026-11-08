# TEST_RESULTS.md — water-bill-bd (run #277, 2026-11-08)

## Unit tests — `node tests/logic.test.js`
**59/59 passed, 0 failed** (run 2026-11-08 ~17:15 +06).

Hand-verified cases (all against the 1 July 2024 defaults: residential water
1670 paisa/1000 L, commercial 4620, sewerage = water, VAT 15%):
- Residential 10,000 L: water 16700 + sewerage 16700 = 33400, VAT 5010, **total 38410**; units 10; per-day 1280.
- Residential 30,000 L: **total 115230** (VAT 15030).
- Commercial 5,000 L: **total 53130** (VAT 6930).
- No sewerage, residential 10,000 L: **total 19205**.
- No VAT, residential 10,000 L: **total 33400**.
- Partial unit 500 L: water 835 + sewerage 835 = 1670, VAT round(250.5) = 251, **total 1921**.
- Arrears +5000 paisa on 10,000 L: **total 43410**.
- Meter readings 123.5 -> 128.5 m3 = 5000 L; litres mode 1000 -> 6000 = 5000 L; current<previous and equal readings rejected.
- Estimator 4 people x 120 L x 30 days = 14,400 L: water 24048 + sewerage 24048 = 48096, VAT 7214, **total 55310**.
- ATM: 20 L = 2000 paisa; 1 L = 100; Tk 100 = 100 L.
- Formatting: 38410 -> "৳384.10" / "৳৩৮৪.১০"; 115230 -> "৳1,152.30" / "৳১,১৫২.৩০".
- Rates: defaults 1670/4620, VAT 15, ATM 100; history 4 rows (1157/3704 -> 1670/4620); invalid rates rejected.
- Import validation: good payload ok; wrong app/version/bad JSON/bad record/bad rates rejected; empty history ok.
- History totals: 2 bills -> count 2, total 153640, litres 40000.

## Headless-Chrome smoke — `node tests/smoke.js`
**50/50 passed, 0 failed** (run 2026-11-08 ~17:17 +06, raw CDP, headless shell, file:// + ?asof=2026-11-08).

- Title/tabs/rate hints (৳16.70 / ৳46.20) / disclaimer render.
- Calculator: res 10,000 L -> ৳384.10 (water ৳167.00, VAT ৳50.10, units 10.00, per-day ৳12.80); com 5,000 L -> ৳531.30; no-sewerage res 10,000 L -> ৳192.05; zero-litres inline error.
- Meter mode: 123.5 -> 128.5 m3 -> ৳192.05; current<previous inline error.
- Save bill ("October bill") -> history total ৳384.10, chart 1 bar, persists after reload.
- Estimator defaults -> 14,400 L, ৳553.10.
- ATM: 20 L -> ৳20.00, piped comparison ৳0.76; Tk 100 -> 100 L.
- Rates: history 4 rows (৳16.70, ৳14.46); edit res water to ৳20.00 -> 10,000 L total ৳422.05; reset restores 16.70.
- Export/import round-trip via test hooks; wrong-app import rejected with data intact; eraseAll clears.
- Language toggle: Bengali title + tab labels, persists after reload, back to EN.
- 390px mobile: no horizontal overflow on calc / rates / history tabs.
- Zero non-file network requests; 0 console/page errors.

Repairs: 2 test-side fixes only (pretty-printed JSON assertion; double-JSON.stringify in erase check). 0 app bugs found in smoke.

## Source hygiene
- `grep -rP '[^\x00-\x7F]'` over *.js/*.html/*.css: zero matches (Bengali as \uXXXX escapes / numeric entities).
- No secrets in code. No fabricated data: all rates sourced (see README).
