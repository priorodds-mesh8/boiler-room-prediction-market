# Boiler Room

A dependency-free local mockup of an internal prediction market for enterprise sales teams.

## What is included

- Synthetic Salesforce-style opportunity markets
- Dashboard with official, CRM, and market-implied forecast signals
- Searchable and filterable markets table
- Market detail pages with CRM context, probability history, trades, comments, alerts, and virtual-credit trading
- LMSR-style price impact for YES / NO trades
- Calibration-first leaderboard with synthetic revenue personas
- Admin flow for creating markets from synthetic CRM opportunities
- Local state persistence through `localStorage`
- Supabase-backed, turn-based Agent Sim / Boiler Room sessions

## Run locally

Open `index.html` directly in a browser for the static mockup views.

The Agent Sim / Boiler Room uses local API routes, so run the Node server for the full experience:

```bash
node server.js
```

Then visit:

```text
http://127.0.0.1:4173
```

You can also serve the static-only demo with any static server:

```bash
python3 -m http.server 4173
```

Then visit:

```text
http://localhost:4173
```

No package install is required. Supabase loading uses `/Users/joellang/.env` through `server.js`. If Supabase variables are absent, the Boiler Room API falls back to `data/generated/` for local testing.

## Deploy to GitHub and Vercel

This repo is ready for GitHub/Vercel hosting. Generated data and trained model artifacts are intentionally ignored because they are reproducible and large; Supabase remains the source of truth for live demo data.

Before deploying, set these Vercel environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
```

`OPENAI_API_KEY` is optional and only used for daily briefing polish. The app falls back to deterministic template summaries when the key is absent or an API call fails. Do not put service-role or OpenAI keys in browser code.

Useful commands:

```bash
npm run check
vercel
vercel --prod
```

The deployed app serves static files from the repo root and uses Vercel API routes for:

```text
/api/live-deals
/api/agent-decision
/api/game/start
/api/game/session
/api/game/actions
/api/game/results
```

## Synthetic 10,000-deal dataset

The `synthetic_pipeline/` package generates 10,000 synthetic training deals, trains baseline ML models, exports held-out Agent Sim deals, and can load the result into Supabase.

Run the local pipeline:

```bash
python3 -m synthetic_pipeline.run_full_pipeline --n 10000 --live-n 200
```

Generated files are written to:

```text
data/generated/
```

Create the Supabase tables by running:

```text
schema/supabase_schema.sql
```

in the Supabase SQL editor. Then load generated rows:

```bash
python3 -m synthetic_pipeline.load_to_supabase
```

The loader reads `/Users/joellang/.env` and supports both standard variables like `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and the labeled format used in the local env note.

If your `.env` includes a reachable Postgres host, pooler URL, or `DATABASE_URL`, the schema can also be applied from the command line:

```bash
python3 -m synthetic_pipeline.apply_supabase_schema
```

If direct DB DNS is unavailable, use the Supabase SQL editor path above.

Research notes and the Claude Code review prompt are in:

```text
docs/research_deal_parameters.md
docs/claude_code_dataset_review_prompt.md
```

## Agent simulation

The `Agent Sim` tab is now a turn-based Boiler Room:

- Human player label: `FNG`
- 30 daily turns per run, displayed as `Day n / 30`
- Gameplay modes: Team, Agent Focus, and Silent Market
- Deal counts: 1, 3, 5, or 10
- Server-assigned high-disagreement live deals and per-deal ML targets
- Daily priority-stack intel cards from deal fields, pipeline events, agent activity, and noisy gossip
- Required FNG buy/hold/sell plus confidence for every deal before the day advances
- Final probability comparison: ML baseline vs. market vs. FNG, with P&L shown prominently

The game reads safe live-deal fields and model baselines from Supabase. Hidden outcomes remain server-side until a run settles after Day 30.

## OpenAI API key

For local development, run:

```bash
OPENAI_API_KEY=your_key_here node server.js
```

Then visit:

```text
http://127.0.0.1:4173
```

For Vercel:

1. Open your Vercel project.
2. Go to Settings -> Environment Variables.
3. Add `OPENAI_API_KEY` with your key value.
4. Add `OPENAI_MODEL` only if you want to override the default.
5. Redeploy the project.
