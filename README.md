# Alfred — Landing Page

Marketing landing page for **Alfred**, a discipline-first AI investing co-pilot
that researches real market data and proposes data-backed trades — where *you*
set the rules and approve every single trade.

This page is a faithful, production implementation of the
[Claude Design](https://claude.ai/design) handoff `Alfred Landing.dc.html`.
The prototype's `<x-dc>` framework has been stripped out and rebuilt as a
zero-dependency static site:

- the design's `style-hover` attributes → real CSS `:hover` rules
- the `DCLogic` React-style component → plain `app.js` (spinning 3D coin canvas
  + scroll-triggered stat counters)
- `prefers-reduced-motion` is respected in both CSS and JS

## Structure

```
index.html      # the page (markup + inline styles, verbatim from the design)
styles.css      # CSS variables, keyframes, hover states, responsive layer
app.js          # canvas coin animation + IntersectionObserver stat counters
design/         # original Claude Design handoff bundle, kept for reference
```

## Run locally

It's a static site — open `index.html` directly, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on Vercel

No build step or configuration is required. Vercel detects this as a static
site and serves `index.html` at the root. Import the repository in the Vercel
dashboard (or run `vercel`) and deploy.
