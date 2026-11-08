# Water Bill BD

Offline bilingual (English / বাংলা) Dhaka WASA water & sewerage bill calculator.
Enter your water use — in litres or from meter readings — and get an exact,
itemised bill: water charge + sewerage charge + 15% VAT, with arrears, plus a
monthly usage estimator, a WASA Water ATM (prepaid booth) price checker, an
editable rate table, a verified rate history, and a saved-bill history with
export/import. 100% offline — no data leaves your device.

Live site: https://fahad3235.github.io/water-bill-bd/

## Problem

Dhaka WASA bills are hard to check: the bill shows a total but most households
cannot verify whether the water charge, sewerage charge and VAT on it are
right, and the rates have changed four times since 2020. This tool lets any
household recompute its bill from its own meter in seconds, and keep a history
of past bills.

## Features

1. **Bill calculator** — residential / commercial, direct litres or previous →
   current meter readings (m³ or litres), sewerage on/off, VAT on/off, arrears.
   Itemised breakdown (water, sewerage, subtotal, VAT, arrears, total) plus
   units used, per-day cost, litres per day, and effective cost per 1,000 L.
2. **Usage estimator** — people × litres/person/day × days → monthly litres and
   an estimated bill (planning estimate, labelled as such).
3. **WASA Water ATM checker** — prepaid booth water at ৳1.00/litre incl. VAT
   (from 1 March 2026): price any number of litres, or find how many litres a
   sum of money buys, with a piped-water comparison for the same volume.
4. **Editable rates + verified rate history** — water/sewerage/VAT/ATM rates are
   editable and saved on-device, with a reset to the 1 July 2024 circular
   defaults; a history table shows the water rate at each revision since 2020.
5. **Saved-bill history** — save bills with a label, monthly totals, an SVG bar
   chart of recent bills, delete, JSON export / strict import, typed-DELETE
   erase-all. All in localStorage.
6. **Bilingual UI** — EN/বাংলা toggle persisted, Bengali digits, 390px mobile
   layout, zero network requests.

## Rate basis (defaults)

| Item | Residential | Commercial | Source |
|---|---|---|---|
| Water, per 1,000 L | ৳16.70 | ৳46.20 | WASA circular, 1 July 2024 (Prothom Alo 29 May 2024; Dhaka Tribune 1 July 2024 confirms implementation) |
| Sewerage, per 1,000 L | ৳16.70 | ৳46.20 | Same as water — Financial Express 2011 ("Tk 6.34 water + Tk 6.34 sewerage + 15% VAT = Tk 14.56") and 2017 ("Tk 8.09 + Tk 8.09 + 15% VAT = Tk 18.60") |
| VAT | 15% on (water + sewerage) | 15% on (water + sewerage) | Same two Financial Express pieces |
| Water ATM booth | ৳1.00 / litre incl. VAT | ৳1.00 / litre incl. VAT | Ittefaq / Financial Express, 1 March 2026 |

Rate history (water charge per 1,000 L): 1 Sep 2020 — ৳11.57 / ৳37.04;
1 Apr 2021 — ৳14.46 / ৳40.00 (UNB); 1 Jul 2022 — ৳15.18 / ৳42.00 (+5%,
Dhaka Tribune); 1 Jul 2024 — ৳16.70 / ৳46.20 (+10%, Prothom Alo / Daily Star).

## Stack

Vanilla HTML + CSS + JavaScript. No build step, no dependencies, no CDN.
Money is integer paisa throughout (no float error). Pure-ASCII sources —
Bengali is emitted as `\uXXXX` escapes in JS and numeric entities in HTML.

## Prerequisites

Any modern browser. For tests: Node.js 18+ and a headless Chromium
(the smoke test uses the Playwright headless shell if present, else
`CHROME_BIN`).

## Install & run

```sh
# just open it — no install step
open index.html
# or serve locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Testing

```sh
node tests/logic.test.js   # 59 unit checks (bill engine, readings, estimator, ATM, formatting, import)
node tests/smoke.js        # 50 headless-Chrome checks (UI flows, persistence, i18n, 390px, zero network)
```

See `TEST_RESULTS.md` for the recorded results.

## Deployment

Static site — publish the repo root on GitHub Pages (main branch, `/`).

## Limitations (read before relying on it)

- **Personal estimator, not an official WASA bill.** WASA revises rates; verify
  against your own bill and edit the rates in the Rates tab if they change.
- **Partial units are charged pro-rata** in this tool (e.g. 500 L = half a unit).
  Your real bill may round consumption up to whole units.
- **Sewerage = water rate** is the structure reported in the cited Financial
  Express pieces (2011, 2017). If your bill shows a different sewerage rate,
  edit it in the Rates tab.
- **The estimator's litres/person/day (default 120) is a planning figure**,
  not a measured average.
- **Piped WASA water is not potable without boiling** (Financial Express).
  ATM booth water is treated drinking water.
- The July 2024 circular also mentions minimum bills for unmetered holdings,
  deep tube-wells and under-construction buildings; no minimum-bill figure is
  published in the cited sources, so none is assumed — enter any fixed charge
  as arrears if your bill carries one.
- A proposed tiered tariff (24–147% hike, Financial Express editorial) is a
  proposal only and is **not** implemented here.

## Status

Built 2026-11-08 (MUSE Project Factory run #277). Tests green (see
TEST_RESULTS.md). Rates current as of the 1 July 2024 circular; no later
metered-rate change was found in press coverage up to 8 Nov 2026 (only the
1 Mar 2026 ATM-booth change, which is included).
