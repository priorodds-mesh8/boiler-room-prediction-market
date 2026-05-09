-- Prism synthetic B2B sales-deal dataset schema.
-- Run in the Supabase SQL editor before loading data with scripts/load_to_supabase.py.

create extension if not exists pgcrypto;

create table if not exists synthetic_dataset_runs (
  run_id text primary key,
  dataset_version text not null,
  seed integer not null,
  row_count integer not null,
  live_row_count integer not null default 0,
  generator_config jsonb not null default '{}'::jsonb,
  research_basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists synthetic_deals (
  deal_id text primary key,
  run_id text not null references synthetic_dataset_runs(run_id) on delete cascade,
  dataset_version text not null,
  dataset_role text not null check (dataset_role in ('training_pool', 'live_pool')),
  ml_split text not null check (ml_split in ('train', 'validation', 'test', 'live')),
  opportunity_id text not null,
  account_name text not null,
  account_domain text,
  account_segment text not null,
  region text not null,
  territory text,
  industry text,
  employee_count integer,
  annual_revenue_band text,
  existing_customer_flag boolean,
  account_health_score numeric,
  lead_source text,
  partner_sourced_flag boolean,
  deal_amount_arr numeric not null,
  deal_type text,
  product_line text,
  crm_stage text not null,
  forecast_category text,
  rep_stated_probability numeric,
  crm_model_probability numeric,
  historical_win_rate_similar_deals numeric,
  created_date date not null,
  close_date date not null,
  original_close_date date not null,
  days_to_close integer,
  close_date_change_count integer,
  sales_cycle_age_days integer,
  stage_age_days integer,
  stage_regression_count integer,
  prior_slipped_quarter_count integer,
  last_activity_date date,
  activity_count_last_14_days integer,
  next_step_quality integer,
  mutual_action_plan_status text,
  champion_strength integer,
  champion_seniority text,
  champion_responsiveness integer,
  economic_buyer_identified boolean,
  executive_sponsor_engaged boolean,
  executive_meeting_completed boolean,
  buyer_stakeholder_count integer,
  buying_committee_contact_count integer,
  active_detractor_count integer,
  decision_process_clarity integer,
  decision_criteria_known boolean,
  compelling_event_strength integer,
  business_pain_severity integer,
  quantified_value_roi_present boolean,
  urgency_score integer,
  budget_confirmed boolean,
  budget_owner_identified boolean,
  procurement_status text,
  legal_status text,
  security_review_status text,
  contract_paper_type text,
  data_residency_requirement text,
  sso_saml_requirement boolean,
  infosec_questionnaire_length integer,
  implementation_complexity integer,
  pilot_completed_flag boolean,
  pilot_success_score integer,
  implementation_start_date_dependency boolean,
  discount_requested numeric,
  required_discount_approval_level text,
  payment_terms_requested text,
  multi_year_term_requested boolean,
  competitor_present boolean,
  competitor_name text,
  competitive_displacement_difficulty integer,
  incumbent_vendor_status text,
  renewal_date_proximity_days integer,
  product_usage_signal numeric,
  prior_support_escalations integer,
  reference_call_completed boolean,
  buyer_sentiment_score numeric,
  sensitive_deal_flag boolean,
  compliance_requirements jsonb not null default '[]'::jsonb,
  integration_requirements jsonb not null default '[]'::jsonb,
  account_team_members jsonb not null default '[]'::jsonb,
  stakeholder_map jsonb not null default '{}'::jsonb,
  missingness_mask jsonb not null default '{}'::jsonb,
  source_profile jsonb not null default '{}'::jsonb,
  private_signal_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists synthetic_deal_outcomes (
  deal_id text primary key references synthetic_deals(deal_id) on delete cascade,
  run_id text not null references synthetic_dataset_runs(run_id) on delete cascade,
  closed_won boolean not null,
  closed_won_by_original_date boolean not null,
  slipped_to_next_quarter boolean not null,
  legal_approved_by_date boolean not null,
  security_completed_by_date boolean not null,
  closed_above_threshold boolean not null,
  final_arr numeric,
  actual_close_date date,
  close_lost_reason text,
  latent_win_probability numeric not null,
  latent_slip_probability numeric not null,
  latent_approval_probability numeric not null,
  latent_drivers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists synthetic_deal_events (
  event_id text primary key,
  deal_id text not null references synthetic_deals(deal_id) on delete cascade,
  run_id text not null references synthetic_dataset_runs(run_id) on delete cascade,
  event_date date not null,
  event_type text not null,
  event_source text not null,
  event_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists model_runs (
  model_run_id text primary key,
  run_id text not null references synthetic_dataset_runs(run_id) on delete cascade,
  dataset_version text not null,
  target text not null,
  model_kind text not null,
  model_version text not null,
  training_config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  feature_columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists model_predictions (
  prediction_id text primary key,
  model_run_id text not null references model_runs(model_run_id) on delete cascade,
  run_id text not null references synthetic_dataset_runs(run_id) on delete cascade,
  deal_id text not null references synthetic_deals(deal_id) on delete cascade,
  target text not null,
  model_kind text not null,
  probability numeric not null,
  calibration_band text not null,
  ml_split text not null,
  created_at timestamptz not null default now(),
  unique (model_run_id, deal_id, target, model_kind)
);

create table if not exists agent_sim_live_deals (
  live_deal_id text primary key,
  deal_id text not null references synthetic_deals(deal_id) on delete cascade,
  run_id text not null references synthetic_dataset_runs(run_id) on delete cascade,
  market_question text not null,
  baseline_probabilities jsonb not null default '{}'::jsonb,
  observable_payload jsonb not null default '{}'::jsonb,
  agent_private_signal_seed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (deal_id)
);

create table if not exists game_sessions (
  session_id text primary key,
  mode text not null check (mode in ('team', 'focus', 'silent')),
  deal_count integer not null check (deal_count in (1, 3, 5, 10)),
  status text not null check (status in ('active', 'settled', 'abandoned')),
  current_day integer not null default 1 check (current_day between 1 and 30),
  max_days integer not null default 30,
  fng_wallet numeric not null default 0,
  player_label text not null default 'FNG',
  source text not null default 'supabase',
  pnl numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_session_deals (
  session_deal_id text primary key,
  session_id text not null references game_sessions(session_id) on delete cascade,
  sort_order integer not null default 0,
  live_deal_id text references agent_sim_live_deals(live_deal_id) on delete set null,
  deal_id text not null references synthetic_deals(deal_id) on delete cascade,
  target text not null check (target in (
    'closed_won',
    'closed_won_by_original_date',
    'slipped_to_next_quarter',
    'legal_approved_by_date',
    'security_completed_by_date',
    'closed_above_threshold'
  )),
  target_label text not null,
  account_name text not null,
  market_question text not null,
  baseline_probability numeric not null,
  market_probability numeric not null,
  fng_probability numeric not null,
  q_yes numeric not null,
  q_no numeric not null,
  liquidity numeric not null default 520,
  volume numeric not null default 0,
  fng_pnl numeric not null default 0,
  agent_pnl numeric not null default 0,
  actual_outcome boolean,
  forecast_winner text,
  observable_payload jsonb not null default '{}'::jsonb,
  agent_roster jsonb not null default '[]'::jsonb,
  fng_state jsonb not null default '{}'::jsonb,
  agent_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_turns (
  turn_id text primary key,
  session_id text not null references game_sessions(session_id) on delete cascade,
  day_number integer not null check (day_number between 1 and 30),
  status text not null default 'ready',
  intel_cards jsonb not null default '[]'::jsonb,
  probability_snapshots jsonb not null default '[]'::jsonb,
  summary text,
  summary_source text not null default 'template',
  created_at timestamptz not null default now(),
  unique (session_id, day_number)
);

create table if not exists game_actions (
  action_id text primary key,
  session_id text not null references game_sessions(session_id) on delete cascade,
  session_deal_id text not null references game_session_deals(session_deal_id) on delete cascade,
  day_number integer not null check (day_number between 1 and 30),
  actor_type text not null check (actor_type in ('fng', 'agent')),
  actor_name text not null,
  action text not null check (action in ('BUY', 'HOLD', 'SELL')),
  side text not null check (side in ('YES', 'NO', 'HOLD')),
  confidence integer not null default 0,
  stake numeric not null default 0,
  probability_before numeric not null,
  probability_after numeric not null,
  implied_probability numeric not null,
  rationale text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists synthetic_deals_run_split_idx on synthetic_deals (run_id, dataset_role, ml_split);
create index if not exists synthetic_deals_stage_idx on synthetic_deals (crm_stage);
create index if not exists synthetic_deals_segment_idx on synthetic_deals (account_segment);
create index if not exists synthetic_deal_events_deal_date_idx on synthetic_deal_events (deal_id, event_date);
create index if not exists model_predictions_deal_target_idx on model_predictions (deal_id, target, model_kind);
create index if not exists game_sessions_status_idx on game_sessions (status, created_at desc);
create index if not exists game_session_deals_session_idx on game_session_deals (session_id, sort_order);
create index if not exists game_turns_session_day_idx on game_turns (session_id, day_number desc);
create index if not exists game_actions_session_day_idx on game_actions (session_id, day_number desc);
