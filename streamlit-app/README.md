# SimFin — Streamlit App (Deprecated)

> **WARNING: This Streamlit app is deprecated and is no longer the primary product.**
>
> - The main product is the PWA at [`index.html`](../index.html) in the repository root.
> - This app is kept for reference only and may be removed in a future release.
> - New features will **not** be added here.
> - Bug fixes are not guaranteed.

## What This App Does

SimFin Streamlit is a Python-based personal finance tool for Brazilians that includes a CLT vs PJ payroll simulator, a B3/Tesouro Direto portfolio tracker with real-time quotes via yfinance, and a net-worth evolution dashboard. It is backed by Supabase (PostgreSQL + Auth) and renders interactive charts via Plotly. To run it locally:

```bash
streamlit run streamlit-app/app.py
```

## Primary Product

The actively maintained product is the **PWA** located at [`index.html`](../index.html) in the repository root.

- Works offline via Service Worker
- No build step required — pure static HTML/CSS/JS
- All features (payroll simulator, portfolio tracker, projections) are available there

Use the PWA. This Streamlit app exists only as a historical reference.
