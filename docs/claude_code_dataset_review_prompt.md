# Claude Code Review Prompt

```text
You are Claude Code reviewing a plan to create a synthetic B2B sales-deal dataset for an internal prediction market.

Context:
We are building "Polymarket for enterprise sales teams." The app needs 10,000 synthetic historical sales deals stored in Supabase. These deals will train baseline ML models that produce probabilities for outcomes like close-won, close-won by original date, slip to next quarter, legal approval, security completion, and close above amount. A separate held-out/live-deal set will be used in a Practice Run where LLM sales personas forecast against model probabilities.

Your tasks:
1. Do your own research on what fields make up a real B2B sales opportunity/deal unit.
2. Prefer academic research, CRM documentation, and professional sales/revenue-operations sources.
3. Evaluate whether the proposed deal parameters are sufficient.
4. Identify missing variables, especially around buying committees, activity history, procurement, legal, security, competitive pressure, seller behavior, and forecast governance.
5. Propose a Supabase schema for:
   - synthetic_dataset_runs
   - synthetic_deals
   - synthetic_deal_outcomes
   - synthetic_deal_events
   - model_runs
   - model_predictions
   - agent_sim_live_deals
6. Design a synthetic data generator for 10,000 deals with correlated features, realistic missingness, latent outcomes, and reproducible seeds.
7. Design an ML pipeline that trains calibrated baseline probability models and evaluates whether they beat stage-only forecasts.
8. Call out leakage risks, unrealistic assumptions, and how to separate training deals from held-out/live Practice Run deals.
9. Produce implementation-ready recommendations, including table schemas, scripts, validation checks, and test cases.

Important constraints:
- Hidden outcomes must never be exposed to Practice Run agents before settlement.
- Not every synthetic deal should have every parameter populated.
- Missingness itself should sometimes be predictive.
- The dataset should be useful for demo ML, not claimed as real production forecasting evidence.
- Store data in Supabase using environment variables from /Users/joellang/.env without printing secrets.
```
