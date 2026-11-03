# Changelog

## 2.0.0 — Macro Pulse (breaking rewrite)

A ground-up rebuild. The v1 Flask/Dash + React app is preserved at tag [`v1.0.0`](https://github.com/eriksyvertsen/Macro-Model-2-22/tree/v1.0.0) and branch `legacy-v1`.

### Why
- The v1 heatmap was a 15 × 60 grid of tiny cells colored by noisy month-over-month % changes: hard to read, unusable on phones.
- The v1 composite averaged rebased index *levels*, so the most volatile series dominated.
- v1 required a Replit DB, a FRED API key and an always-on Python process.

### Changed
- **Momentum map** replaces the heatmap: 3-month change per indicator, scaled to its own history (robust MAD scale), grouped by category. On phones each indicator is a card with a full-width strip.
- **Composite** is now a 0–100 score: z-scores over a 30-year window (Nov 1996 on), sign-adjusted so higher is healthier, blended with weights **calibrated against NBER recessions** (non-negative regularized logistic fit, leave-one-recession-out validation). Out-of-sample AUC 0.969 vs 0.968 for equal weights, so the calibration is a modest tilt.
- **New UI:** sticky nav (bottom tab bar on mobile), overview, indicator browser and detail pages, recession shading, driver breakdown, weight sliders, presets, shareable weight links, dark mode.
- **Stack:** Vite + React + TypeScript, deployed on Vercel. Data from FRED's keyless CSV endpoint, build-time snapshot plus a cached `/api/data` function.
- Series set is now 17 indicators in `shared/catalog.js`. S&P 500 → Nasdaq Composite and ICE high-yield spread → Baa–10y spread (FRED history limits).

### Removed (breaking)
- Python backend (`main.py`, Dash, Replit DB, `schedule` thread), Replit config, and the `Documentation/` folder (see `legacy-v1`).
- **"Add any FRED series by ID"** and the per-row Up+/Up− direction toggle. Direction is now defined per indicator in the catalog.
- All v1 environment variables (`FRED_API_KEY`). None are needed.

## 1.0.0
Flask/Dash + React macro tracker on Replit. See tag `v1.0.0`.
