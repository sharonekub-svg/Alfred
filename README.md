# Alfred — Discipline-first AI investing co-pilot

Alfred researches real market data and proposes data-backed trades. **You set the
rules. You approve every single one.** This repo contains the marketing landing
page plus a working **$10,000 paper-trading demo** driven by a research agent.

Built to deploy on **Vercel** with zero config: a static front-end plus one
serverless function for the AI + market data.

## What's here

| Path | What it is |
|------|------------|
| `index.html` | Landing page (faithful build of the Claude Design handoff). Its "Request access" form sends you into the demo. |
| `onboarding.html` | The **mandatory questionnaire**. Alfred can't propose a trade until you've answered every required question — your answers become guardrails. |
| `dashboard.html` | The demo dashboard: $10k paper account, holdings, the agent's proposals, approve/decline, and your guardrails. |
| `api/propose.js` | **Serverless research agent.** Pulls live quotes + analyst recommendations (Finnhub) and asks Claude (`claude-opus-4-8`) for one rule-compliant idea. Falls back to a simulated engine if keys aren't set. |
| `app/` | Front-end logic: `state.js` (demo state in `localStorage`), `onboarding.js`, `dashboard.js`. |
| `styles.css`, `app.js` | Shared design tokens / animations and the landing-page coin canvas + counters. |
| `design/` | Original Claude Design handoff bundle, kept for reference. |

## The flow

1. **Landing → Request access.** Enter your email on `index.html`; it's saved and you're taken to onboarding. (Google sign-in is planned; email is the demo entry for now.)
2. **Onboarding (rules first).** Answer risk tolerance, horizon, max position size, leverage, daily cap, allowed assets, and banned sectors. *Every required question must be answered before trading unlocks.* "Require my approval" is locked on and can never be disabled.
3. **Dashboard.** Start with **$10,000 in demo funds**. Tap **Ask Alfred to research** → the agent returns one proposal checked against your rules → you **Approve** or **Decline**. Approvals update the paper portfolio. The daily proposal cap is enforced.

## Real data + Claude (env vars)

The agent runs in **real mode** when these are set as Vercel **Environment
Variables** (Project → Settings → Environment Variables). They stay server-side
and never reach the browser:

| Variable | Used for | Get one |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Claude reasoning (`claude-opus-4-8`) | https://console.anthropic.com |
| `FINNHUB_API_KEY` | Live quotes + analyst recommendation trends | https://finnhub.io (free tier) |

Without them, `api/propose.js` automatically falls back to a **simulated**
engine so the demo still works — and upgrades to live data + Claude the moment
the keys are present. No code change needed.

## Deploy on Vercel

1. Import `sharonekub-svg/alfred` in the Vercel dashboard.
2. Vercel detects a static site + serverless functions in `/api` — no build command needed; it installs `@anthropic-ai/sdk` automatically.
3. Add the two environment variables above (optional for the simulated demo, required for real mode).
4. Deploy.

## Run locally

The static pages work from any static server, but `/api/propose` only runs on
Vercel (or `vercel dev`). For the full agent locally:

```bash
npm install
npx vercel dev   # serves the site + the serverless function
```

Plain `python3 -m http.server` serves the pages; the dashboard will show a
friendly notice if `/api/propose` isn't running.

## Roadmap

- Google sign-in and real accounts (currently email → dashboard, demo state in `localStorage`).
- Connect a real broker (the demo is paper-only by design).
