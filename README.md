# Prism Revenue Market

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
- Optional Supabase-backed Agent Sim sessions from `agent_sim_live_deals`

## Run locally

Open `index.html` directly in a browser for the fully local demo.

For Agent Sim sessions backed by Supabase live deals, run the local Node server:

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

No package install is required. Supabase loading uses `/Users/joellang/.env` through `server.js`.

## Deploy to GitHub and Vercel

This repo is ready for GitHub/Vercel hosting. Generated data and trained model artifacts are intentionally ignored because they are reproducible and large; Supabase remains the source of truth for live demo data.

Before deploying, set these Vercel environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
```

`OPENAI_API_KEY` is only required for the optional remote LLM mode. The app still works with local persona decisions when that variable is absent.

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

The `Agent Sim` tab runs a live held-out market session:

- 20 hidden-outcome synthetic deals, with focused sessions of 1, 3, 5, or 10 active deals
- 6 autonomous sales personas: 3 AEs, 1 BDR, 1 SE, and 1 VP
- Fragmented private signals per agent
- Public information shocks over time
- Automatic YES / NO trades, thought bubbles, and settlement results
- Human player trading desk
- `Load From Supabase` pulls 1, 3, 5, or 10 sealed live deals from `agent_sim_live_deals`

Supabase-loaded sessions keep hidden outcomes sealed and disable settlement in the UI. Use the local demo pool when you want to reveal outcomes at the end of a session.

By default the simulation uses a local persona engine. To test the optional remote LLM adapter, run:

```bash
OPENAI_API_KEY=your_key_here node server.js
```

Then visit:

```text
http://127.0.0.1:4173
```

Turn on `Remote LLM` in the Agent Sim tab. If the key or API call is unavailable, the app falls back to the local persona engine.
