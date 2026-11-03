# Macro Pulse (v2)

A mobile-first U.S. economy dashboard: a 0–100 composite conditions score and a momentum map for 17 FRED indicators.

**Live:** https://macro-pulse-xi.vercel.app

> **v2 is a full rewrite.** The original Flask/Dash + React tracker lives at tag [`v1.0.0`](https://github.com/eriksyvertsen/Macro-Model-2-22/tree/v1.0.0) / branch `legacy-v1`. See [CHANGELOG.md](CHANGELOG.md) for what changed and what was removed.

- **Composite:** each indicator is standardized over a 30-year window (Nov 1996 on), sign-adjusted so higher is healthier, and blended with weights calibrated against NBER recessions (leave-one-recession-out validation). Weights are adjustable and shareable by link.
- **Momentum map:** 3-month change per indicator, scaled to its own history, grouped by category.
- **No API key or database:** data comes from FRED's keyless CSV endpoint. A snapshot is written at build time (`public/data.json`) and refreshed live through `/api/data` (Vercel function, cached 6h).

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run snapshot     # refresh public/data.json from FRED
npm run calibrate    # refit weights -> shared/calibration.json
npm run build
```

Indicators live in `shared/catalog.js`. Methodology and calibration results are on the site's Method and Composite pages.
