# Boiler Room

A dependency-free local mockup of consensus intelligence for enterprise sales teams.

Boiler Room's core thesis is that the market is not merely a human prediction market and not merely an ML model wrapper. It is a signal-consolidation layer where machine learning, AI agents, sales reps, managers, and VPs contribute different kinds of information to one live probability. Every forecast action is treated as an information act that can either reduce uncertainty or add noise.

The product measures that directly: ML prior, AI-agent market, human forecast, and final consensus market are scored against hidden outcomes with Brier score, log loss, directional accuracy, and calibration.

## What is included

- Synthetic Salesforce-style opportunity markets
- Dashboard with official, CRM, and consensus-implied forecast signals
- Searchable and filterable markets table
- Market detail pages with CRM context, probability history, forecasts, comments, alerts, and virtual-credit forecasting
- LMSR-style price impact for YES / NO forecasts
- Calibration-first leaderboard with synthetic revenue personas
- Admin flow for creating markets from synthetic CRM opportunities
- Local state persistence through `localStorage`
- Supabase-backed, turn-based Boiler Room Practice Runs
- 500-scenario gameplay evaluator for ML, AI-agent market, human forecast, and consensus-market quality

## Run locally

Open `index.html` directly in a browser for the static mockup views.

Boiler Room Practice Runs use local API routes, so run the Node server for the full experience:

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
npm run test:smoke
npm run evaluate:gameplay
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

The `synthetic_pipeline/` package generates 10,000 synthetic training deals, trains baseline ML models, exports held-out Practice Run deals, and can load the result into Supabase.

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

## Practice Run

The Practice Run is now a turn-based consensus-intelligence loop:

- Human player label: `You`
- Selectable 5, 15, or 30 daily turns per run, displayed as `Day n / max`
- Gameplay modes: Team, Agent Focus, and Silent Market
- Deal counts: 1, 3, 5, or 10
- Server-assigned high-disagreement live deals and per-deal ML priors
- Daily priority-stack intel cards from deal fields, pipeline events, agent activity, and noisy gossip
- Required user forecast or hold decision for every deal before the day advances
- Final probability comparison: ML prior vs. consensus market vs. you, with P&L shown as a secondary score

The game reads safe live-deal fields and model baselines from Supabase. Hidden outcomes remain server-side until a run settles after the selected final day.

## Theory of the Product

Older corporate prediction-market programs showed that markets can surface distributed knowledge, but many were mostly human opinion aggregation systems. Boiler Room's stronger claim is that revenue forecasting improves when human and artificial intelligence are combined in the market itself.

The four signal layers are:

- **ML Prior:** the model's statistical starting point from historical deal patterns.
- **AI-Agent Market:** synthetic deal-team agents inspect process, legal, security, procurement, champion, and activity signals.
- **Human Forecast:** sales reps, managers, VPs, and the FNG contribute field judgment, social context, and political information that may not appear in CRM.
- **Consensus Market:** the live LMSR probability after AI and human signals have been compressed into one price.

The important question is not "does a market always beat ML?" The important question is whether adding agentic and human intelligence increases information signal:

```text
signal lift = Brier(earlier layer) - Brier(later layer)
```

A positive lift means the new layer moved the probability closer to the eventual outcome. A negative lift means it added disorder.

## Gameplay Evaluation

Run the full local evaluator:

```bash
npm run evaluate:gameplay
```

It runs 500 deterministic scenarios across game modes, deal counts, durations, and FNG policies. It writes:

```text
data/generated/evaluation/gameplay_500_summary.json
data/generated/evaluation/gameplay_500_summary.md
data/generated/evaluation/gameplay_500_runs.csv
data/generated/evaluation/gameplay_500_deals.csv
```

Those four evaluation outputs are intentionally trackable even though the larger generated dataset remains ignored.

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

## Demo password gate

Set `BOILER_ROOM_DEMO_PASSWORD` to require a shared password on `/api/*` routes:

```bash
BOILER_ROOM_DEMO_PASSWORD=hunter2 node server.js
```

The static UI remains public so it can prompt for the password. For Vercel, add `BOILER_ROOM_DEMO_PASSWORD` in Settings -> Environment Variables and redeploy.
