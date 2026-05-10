const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { findOutputText, supabaseConfig } = require("./_utils");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data", "generated");
const MAX_DAYS = 30;
const VALID_MODES = new Set(["team", "focus", "silent"]);
const VALID_COUNTS = new Set([1, 3, 5, 10]);
const TARGETS = [
  "closed_won",
  "closed_won_by_original_date",
  "slipped_to_next_quarter",
  "legal_approved_by_date",
  "security_completed_by_date",
  "closed_above_threshold"
];
const TARGET_LABELS = {
  closed_won: "Close won",
  closed_won_by_original_date: "Close won by original date",
  slipped_to_next_quarter: "Slip to next quarter",
  legal_approved_by_date: "Legal approved by date",
  security_completed_by_date: "Security completed by date",
  closed_above_threshold: "Close above threshold"
};

const memoryStore = {
  sessions: new Map(),
  sessionDeals: new Map(),
  turns: new Map(),
  actions: new Map()
};

async function startGame(body) {
  const mode = VALID_MODES.has(body.mode) ? body.mode : "team";
  const dealCount = VALID_COUNTS.has(Number(body.dealCount)) ? Number(body.dealCount) : 3;
  const store = makeStore();
  const liveRows = await store.fetchLiveDeals(Math.max(50, dealCount * 12));
  if (liveRows.length < dealCount) {
    throw new PublicError(409, "Not enough live deals are available for this run.");
  }

  const assignedRows = selectAssignedDeals(liveRows, dealCount);
  const dealIds = assignedRows.map(row => row.deal_id).filter(Boolean);
  const eventsByDeal = await store.fetchEvents(dealIds);
  const sessionId = makeId("game");
  const wallet = startingWallet(dealCount);
  const session = {
    session_id: sessionId,
    mode,
    deal_count: dealCount,
    status: "active",
    current_day: 1,
    max_days: MAX_DAYS,
    fng_wallet: wallet,
    player_label: "FNG",
    source: store.source,
    pnl: 0,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  const sessionDeals = assignedRows.map((row, index) => makeSessionDeal(sessionId, row, index));
  const prepared = await prepareDay(session, sessionDeals, eventsByDeal, 1, store);
  await store.createSession(session, sessionDeals, prepared.turn, prepared.agentActions);
  return safePayload(session, sessionDeals, prepared.turn, [], null);
}

async function getSession(sessionId) {
  const store = makeStore();
  const bundle = await store.getSessionBundle(sessionId);
  if (!bundle) throw new PublicError(404, "Game session not found.");
  const results = bundle.session.status === "settled" ? buildResults(bundle.session, bundle.deals) : null;
  return safePayload(bundle.session, bundle.deals, bundle.turn, bundle.actions, results);
}

async function submitActions(body) {
  const sessionId = String(body.sessionId || "");
  const day = Number(body.day);
  const actions = Array.isArray(body.actions) ? body.actions : [];
  const store = makeStore();
  const bundle = await store.getSessionBundle(sessionId);
  if (!bundle) throw new PublicError(404, "Game session not found.");
  const session = bundle.session;
  const deals = bundle.deals;
  if (session.status === "settled") throw new PublicError(409, "This run is already settled.");
  if (day !== Number(session.current_day)) throw new PublicError(409, "Submitted day does not match the active game day.");

  const normalized = normalizeFngActions(actions, deals);
  const fngActions = applyFngActions(session, deals, normalized);
  let turn = bundle.turn;
  let agentActions = [];
  let results = null;

  if (Number(session.current_day) >= MAX_DAYS) {
    await settleSession(session, deals, store);
    results = buildResults(session, deals);
  } else {
    session.current_day = Number(session.current_day) + 1;
    session.updated_at = nowIso();
    const eventsByDeal = await store.fetchEvents(deals.map(deal => deal.deal_id));
    const prepared = await prepareDay(session, deals, eventsByDeal, Number(session.current_day), store);
    turn = prepared.turn;
    agentActions = prepared.agentActions;
  }

  await store.saveProgress(session, deals, session.status === "settled" ? null : turn, fngActions.concat(agentActions));
  return safePayload(session, deals, turn, fngActions.concat(agentActions), results);
}

async function getResults(sessionId) {
  const store = makeStore();
  const bundle = await store.getSessionBundle(sessionId);
  if (!bundle) throw new PublicError(404, "Game session not found.");
  if (bundle.session.status !== "settled") throw new PublicError(409, "This run has not settled yet.");
  return safePayload(bundle.session, bundle.deals, bundle.turn, bundle.actions, buildResults(bundle.session, bundle.deals));
}

function makeStore() {
  const config = supabaseConfig();
  if (process.env.BOILER_ROOM_FORCE_LOCAL_GAME === "1" || !config.url || !config.key) return makeLocalStore();
  return makeSupabaseStore(config);
}

function makeSupabaseStore(config) {
  async function request(tableAndQuery, options = {}) {
    const response = await fetch(`${config.url}/rest/v1/${tableAndQuery}`, {
      ...options,
      headers: {
        "apikey": config.key,
        "Authorization": `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new PublicError(502, "Supabase returned a non-JSON response.");
    }
    if (!response.ok) {
      throw new PublicError(response.status, payload && payload.message ? payload.message : "Supabase request failed.", payload);
    }
    return payload;
  }

  return {
    source: "supabase",
    async fetchLiveDeals(limit) {
      const params = new URLSearchParams({
        select: "live_deal_id,deal_id,market_question,baseline_probabilities,observable_payload,agent_private_signal_seed",
        order: "created_at.asc",
        limit: String(limit)
      });
      return request(`agent_sim_live_deals?${params.toString()}`) || [];
    },
    async fetchEvents(dealIds) {
      if (!dealIds.length) return {};
      const params = new URLSearchParams({
        select: "deal_id,event_date,event_type,event_source,event_value",
        order: "event_date.asc"
      });
      params.set("deal_id", `in.(${dealIds.join(",")})`);
      const rows = await request(`synthetic_deal_events?${params.toString()}`) || [];
      return groupByDeal(rows);
    },
    async fetchOutcomes(dealIds) {
      if (!dealIds.length) return {};
      const params = new URLSearchParams({
        select: ["deal_id"].concat(TARGETS).join(",")
      });
      params.set("deal_id", `in.(${dealIds.join(",")})`);
      const rows = await request(`synthetic_deal_outcomes?${params.toString()}`) || [];
      return Object.fromEntries(rows.map(row => [row.deal_id, row]));
    },
    async createSession(session, deals, turn, actions) {
      await request("game_sessions", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify(session)
      });
      await request("game_session_deals", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify(deals)
      });
      await request("game_turns", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify(turn)
      });
      if (actions.length) {
        await request("game_actions", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify(actions)
        });
      }
    },
    async getSessionBundle(sessionId) {
      const sessionRows = await request(`game_sessions?session_id=eq.${encodeURIComponent(sessionId)}&select=*`);
      if (!sessionRows || !sessionRows.length) return null;
      const session = normalizeSession(sessionRows[0]);
      const deals = (await request(`game_session_deals?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=sort_order.asc`) || []).map(normalizeDeal);
      const turnRows = await request(`game_turns?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=day_number.desc&limit=1`);
      const actions = await request(`game_actions?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.desc&limit=80`) || [];
      return { session, deals, turn: normalizeTurn(turnRows && turnRows[0]), actions };
    },
    async saveProgress(session, deals, turn, actions) {
      await request(`game_sessions?session_id=eq.${encodeURIComponent(session.session_id)}`, {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify(session)
      });
      await Promise.all(deals.map(deal => request(`game_session_deals?session_deal_id=eq.${encodeURIComponent(deal.session_deal_id)}`, {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify(deal)
      })));
      if (turn) {
        await request("game_turns", {
          method: "POST",
          headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(turn)
        });
      }
      if (actions.length) {
        await request("game_actions", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify(actions)
        });
      }
    }
  };
}

function makeLocalStore() {
  return {
    source: "local",
    async fetchLiveDeals(limit) {
      return readLocalJson("agent_sim_live_deals.json", "agent_sim_live_deals.jsonl").slice(0, limit);
    },
    async fetchEvents(dealIds) {
      const rows = readLocalJson(null, "synthetic_deal_events.jsonl").filter(row => dealIds.includes(row.deal_id));
      return groupByDeal(rows);
    },
    async fetchOutcomes(dealIds) {
      const rows = readLocalJson(null, "synthetic_deal_outcomes.jsonl").filter(row => dealIds.includes(row.deal_id));
      return Object.fromEntries(rows.map(row => [row.deal_id, row]));
    },
    async createSession(session, deals, turn, actions) {
      memoryStore.sessions.set(session.session_id, clone(session));
      memoryStore.sessionDeals.set(session.session_id, clone(deals));
      memoryStore.turns.set(session.session_id, [clone(turn)]);
      memoryStore.actions.set(session.session_id, clone(actions));
    },
    async getSessionBundle(sessionId) {
      const session = memoryStore.sessions.get(sessionId);
      if (!session) return null;
      const turns = memoryStore.turns.get(sessionId) || [];
      return {
        session: clone(session),
        deals: clone(memoryStore.sessionDeals.get(sessionId) || []),
        turn: clone(turns[turns.length - 1] || null),
        actions: clone(memoryStore.actions.get(sessionId) || []).slice(-80).reverse()
      };
    },
    async saveProgress(session, deals, turn, actions) {
      memoryStore.sessions.set(session.session_id, clone(session));
      memoryStore.sessionDeals.set(session.session_id, clone(deals));
      const turns = memoryStore.turns.get(session.session_id) || [];
      if (turn && !turns.some(item => item.turn_id === turn.turn_id)) turns.push(clone(turn));
      memoryStore.turns.set(session.session_id, turns);
      const existing = memoryStore.actions.get(session.session_id) || [];
      memoryStore.actions.set(session.session_id, existing.concat(clone(actions)));
    }
  };
}

function selectAssignedDeals(rows, dealCount) {
  return rows
    .map(row => ({ row, score: assignmentScore(row) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, dealCount)
    .map(item => item.row);
}

function assignmentScore(row) {
  const payload = row.observable_payload || {};
  const probs = row.baseline_probabilities || {};
  const targetUncertainty = Math.max(...TARGETS.map(target => uncertainty(Number(probs[target]))));
  const rep = Number(payload.rep_stated_probability);
  const crm = Number(payload.crm_model_probability);
  const disagreement = Number.isFinite(rep) && Number.isFinite(crm) ? Math.abs(rep - crm) : 0;
  const risk = ["legal_status", "security_review_status", "procurement_status"].reduce((total, key) => {
    return total + Math.abs(statusImpact(payload[key] || "") || 0);
  }, 0);
  return targetUncertainty + disagreement + risk * 0.35;
}

function chooseTarget(row) {
  const probs = row.baseline_probabilities || {};
  const candidates = TARGETS
    .map(target => ({ target, probability: Number(probs[target]) }))
    .filter(item => Number.isFinite(item.probability));
  if (!candidates.length) return { target: "closed_won", probability: fallbackProbability(row.observable_payload || {}) };
  return candidates.sort((a, b) => uncertainty(b.probability) - uncertainty(a.probability))[0];
}

function makeSessionDeal(sessionId, row, index) {
  const payload = row.observable_payload || {};
  const picked = chooseTarget(row);
  const baseline = clamp(Number(picked.probability), 0.03, 0.97);
  const q = qFromProbability(baseline, 520);
  const accountName = payload.account_name || row.deal_id || `Deal ${index + 1}`;
  return {
    session_deal_id: makeId("sd"),
    session_id: sessionId,
    sort_order: index,
    live_deal_id: row.live_deal_id || null,
    deal_id: row.deal_id,
    target: picked.target,
    target_label: TARGET_LABELS[picked.target],
    account_name: accountName,
    market_question: questionForTarget(accountName, picked.target, payload),
    baseline_probability: baseline,
    market_probability: baseline,
    fng_probability: baseline,
    q_yes: q.yes,
    q_no: q.no,
    liquidity: 520,
    volume: 0,
    fng_pnl: 0,
    agent_pnl: 0,
    actual_outcome: null,
    forecast_winner: null,
    observable_payload: payload,
    agent_roster: agentRoster(payload),
    fng_state: { yes: 0, no: 0, cost: 0, lastAction: "HOLD", lastConfidence: 3, walletSpent: 0 },
    agent_state: { yes: 0, no: 0, cost: 0, trades: 0 },
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

async function prepareDay(session, deals, eventsByDeal, day, store) {
  let cards = [];
  let agentActions = [];
  for (const deal of deals) {
    const dealCards = buildDailyCards(deal, eventsByDeal[deal.deal_id] || [], day, session.mode);
    cards = cards.concat(dealCards);
    const actions = applyAgentPhase(session, deal, dealCards, day);
    agentActions = agentActions.concat(actions);
  }
  cards = cards
    .map(card => ({ ...card, priority: cardPriority(card, deals.find(deal => deal.session_deal_id === card.session_deal_id)) }))
    .sort((a, b) => b.priority - a.priority);
  const briefing = await buildBriefing(session, deals, cards);
  const turn = {
    turn_id: `${session.session_id}_day_${day}`,
    session_id: session.session_id,
    day_number: day,
    status: "ready",
    intel_cards: cards,
    probability_snapshots: probabilitySnapshots(deals),
    summary: briefing.summary,
    summary_source: briefing.source,
    created_at: nowIso()
  };
  session.updated_at = nowIso();
  return { turn, agentActions };
}

function buildDailyCards(deal, events, day, mode) {
  const payload = deal.observable_payload || {};
  const cards = [];
  const metricPool = metricCards(deal);
  const metric = metricPool[(day + deal.sort_order) % metricPool.length];
  if (metric) cards.push(metric);

  const event = pickEventForDay(events, day);
  if (event) cards.push(eventCard(deal, event));

  const process = processCard(deal, day);
  if (process) cards.push(process);

  if (mode !== "silent") cards.push(agentCard(deal, day, mode));
  const gossip = gossipCard(deal, day);
  if (gossip) cards.push(gossip);

  const maxCards = clamp(1 + ((day + deal.sort_order) % 5), 1, 5);
  return cards.slice(0, maxCards).map(card => ({
    ...card,
    card_id: `${deal.session_deal_id}_${day}_${card.kind}_${hash(card.title).slice(0, 6)}`,
    session_deal_id: deal.session_deal_id,
    deal_id: deal.deal_id,
    account_name: deal.account_name,
    target: deal.target,
    target_label: deal.target_label,
    day
  }));
}

function metricCards(deal) {
  const p = deal.observable_payload || {};
  return [
    card("metric", "Model baseline", `${TARGET_LABELS[deal.target]} starts at ${formatPercent(deal.baseline_probability)}.`, 0, "blue", "Metric"),
    card("metric", "Rep vs CRM read", `Rep probability ${formatMaybePercent(p.rep_stated_probability)} vs CRM model ${formatMaybePercent(p.crm_model_probability)}.`, numeric(p.rep_stated_probability) - numeric(p.crm_model_probability), "violet", "Metric"),
    card("metric", "Pipeline age", `${p.crm_stage || "Unknown stage"} for ${safeValue(p.stage_age_days, "unknown")} days; close has moved ${safeValue(p.close_date_change_count, 0)} time(s).`, -0.02 * numeric(p.close_date_change_count), "amber", "Metric"),
    card("metric", "Buyer sentiment", `Buyer sentiment ${safeValue(p.buyer_sentiment_score, "unknown")} with champion strength ${safeValue(p.champion_strength, "unknown")}/5.`, (numeric(p.buyer_sentiment_score) - 0.5) * 0.16, "green", "Metric")
  ];
}

function processCard(deal, day) {
  const p = deal.observable_payload || {};
  const options = [
    ["Legal lane", `Legal is ${safeValue(p.legal_status, "not recorded")}.`, statusImpact(p.legal_status), "Process"],
    ["Security lane", `Security review is ${safeValue(p.security_review_status, "not recorded")}.`, statusImpact(p.security_review_status), "Process"],
    ["Procurement lane", `Procurement is ${safeValue(p.procurement_status, "not recorded")}.`, statusImpact(p.procurement_status), "Process"],
    ["Budget lane", `Budget confirmed: ${boolLabel(p.budget_confirmed)}; budget owner identified: ${boolLabel(p.budget_owner_identified)}.`, (p.budget_confirmed ? 0.1 : -0.08), "Process"]
  ];
  const picked = options[(day + deal.sort_order) % options.length];
  return card("process", picked[0], picked[1], picked[2], picked[2] >= 0 ? "green" : "red", picked[3]);
}

function eventCard(deal, event) {
  const value = event.event_value || {};
  const body = event.event_type === "activity"
    ? `${titleCase(value.kind || "activity")} logged by ${event.event_source}.`
    : `${titleCase(event.event_type.replace(/_/g, " "))}: ${safeValue(value.stage || value.status || value.move_number, "updated")}.`;
  return card("event", titleCase(event.event_type.replace(/_/g, " ")), body, impactForEvent(event), "teal", "Pipeline");
}

function agentCard(deal, day, mode) {
  const roster = deal.agent_roster || [];
  const agent = roster[(day + deal.sort_order) % Math.max(1, roster.length)] || { name: "Deal team", role: "Agent" };
  const edge = agentBelief(deal, agent.role, day) - deal.market_probability;
  const text = mode === "focus"
    ? `${agent.name} is the focus seat today and sees ${edge >= 0 ? "upside" : "risk"} in ${deal.target_label.toLowerCase()}.`
    : `${agent.role} ${agent.name} ${Math.abs(edge) > 0.05 ? "trades the edge" : "does not see a clean edge"} on this deal.`;
  return card("agent", `${agent.role} read`, text, edge, edge >= 0 ? "green" : "red", "Agent");
}

function gossipCard(deal, day) {
  const p = deal.observable_payload || {};
  const fragments = [
    `Someone says the champion is ${safeValue(p.champion_seniority, "hard to read")}, but nobody agrees how much authority they have.`,
    `The hallway version is that ${safeValue(p.competitor_name, "the incumbent")} is making noise late in the cycle.`,
    `A rep claims the next step is real; the calendar says activity count is ${safeValue(p.activity_count_last_14_days, "unknown")}.`,
    `There is chatter that procurement timing may be softer than the forecast says.`
  ];
  return card("gossip", "Office gossip", fragments[(day + deal.sort_order) % fragments.length], 0, "rumor", "Rumor");
}

function applyAgentPhase(session, deal, cards, day) {
  const mode = session.mode;
  const roster = deal.agent_roster && deal.agent_roster.length ? deal.agent_roster : agentRoster({});
  const count = mode === "team" ? Math.min(3, roster.length) : 1;
  if (mode === "silent") return [applyAgentTrade(session, deal, { name: "Agent market", role: "Aggregate" }, cards, day, true)].filter(Boolean);
  const actions = [];
  for (let i = 0; i < count; i += 1) {
    const agent = roster[(day + deal.sort_order + i) % roster.length];
    const action = applyAgentTrade(session, deal, agent, cards, day, false);
    if (action) actions.push(action);
  }
  return actions;
}

function applyAgentTrade(session, deal, agent, cards, day, silent) {
  const belief = agentBelief(deal, agent.role, day) + cards.reduce((sum, item) => sum + Number(item.impact || 0) * 0.25, 0);
  const edge = clamp(belief, 0.02, 0.98) - deal.market_probability;
  if (Math.abs(edge) < (silent ? 0.035 : 0.045)) return null;
  const side = edge >= 0 ? "YES" : "NO";
  const stake = clamp(Math.round((28 + Math.abs(edge) * 520 + day * 1.5) / 5) * 5, 20, 220);
  const before = deal.market_probability;
  const trade = quoteTrade(deal, side, stake);
  if (side === "YES") {
    deal.q_yes += trade.shares;
    deal.agent_state.yes += trade.shares;
  } else {
    deal.q_no += trade.shares;
    deal.agent_state.no += trade.shares;
  }
  deal.market_probability = lmsrPrice(deal.q_yes, deal.q_no, deal.liquidity);
  deal.volume += stake;
  deal.agent_state.cost += stake;
  deal.agent_state.trades += 1;
  deal.updated_at = nowIso();
  return makeAction(session.session_id, deal, day, "agent", agent.name, side === "YES" ? "BUY" : "SELL", confidenceFromEdge(edge), stake, side, before, deal.market_probability, clamp(belief, 0.02, 0.98), silent ? "Aggregate agent market moved." : `${agent.role} traded on a ${formatPercent(Math.abs(edge))} edge.`);
}

function normalizeFngActions(actions, deals) {
  const byDeal = new Map(actions.map(action => [String(action.sessionDealId || action.session_deal_id), action]));
  const normalized = [];
  for (const deal of deals) {
    const action = byDeal.get(deal.session_deal_id);
    if (!action) throw new PublicError(400, "FNG must submit an action for every active deal.");
    const choice = String(action.action || "").toUpperCase();
    if (!["BUY", "HOLD", "SELL"].includes(choice)) throw new PublicError(400, "Each action must be BUY, HOLD, or SELL.");
    const confidence = clamp(Number(action.confidence || 3), 1, 5);
    normalized.push({ deal, action: choice, confidence });
  }
  return normalized;
}

function applyFngActions(session, deals, normalized) {
  const requested = normalized.map(item => ({ ...item, requestedStake: item.action === "HOLD" ? 0 : fngStake(item.confidence, session.deal_count) }));
  const total = requested.reduce((sum, item) => sum + item.requestedStake, 0);
  const scale = total > Number(session.fng_wallet) && total > 0 ? Number(session.fng_wallet) / total : 1;
  const records = [];
  for (const item of requested) {
    const stake = Math.round(item.requestedStake * scale);
    const before = item.deal.market_probability;
    const implied = impliedFngProbability(item.action, item.confidence, before);
    if (stake > 0) {
      const side = item.action === "BUY" ? "YES" : "NO";
      const trade = quoteTrade(item.deal, side, stake);
      if (side === "YES") {
        item.deal.q_yes += trade.shares;
        item.deal.fng_state.yes += trade.shares;
      } else {
        item.deal.q_no += trade.shares;
        item.deal.fng_state.no += trade.shares;
      }
      item.deal.market_probability = lmsrPrice(item.deal.q_yes, item.deal.q_no, item.deal.liquidity);
      item.deal.volume += stake;
      item.deal.fng_state.cost += stake;
      item.deal.fng_state.walletSpent += stake;
      session.fng_wallet = Math.max(0, Number(session.fng_wallet) - stake);
    }
    item.deal.fng_probability = implied;
    item.deal.fng_state.lastAction = item.action;
    item.deal.fng_state.lastConfidence = item.confidence;
    item.deal.updated_at = nowIso();
    records.push(makeAction(session.session_id, item.deal, session.current_day, "fng", "FNG", item.action, item.confidence, stake, item.action === "BUY" ? "YES" : item.action === "SELL" ? "NO" : "HOLD", before, item.deal.market_probability, implied, "FNG daily decision."));
  }
  session.pnl = deals.reduce((sum, deal) => sum + Number(deal.fng_pnl || 0), 0);
  session.updated_at = nowIso();
  return records;
}

async function settleSession(session, deals, store) {
  const outcomes = await store.fetchOutcomes(deals.map(deal => deal.deal_id));
  session.status = "settled";
  session.updated_at = nowIso();
  let totalPnl = 0;
  for (const deal of deals) {
    const outcomeRow = outcomes[deal.deal_id] || {};
    const actual = Boolean(outcomeRow[deal.target]);
    deal.actual_outcome = actual;
    const fngPayout = actual ? Number(deal.fng_state.yes || 0) : Number(deal.fng_state.no || 0);
    const agentPayout = actual ? Number(deal.agent_state.yes || 0) : Number(deal.agent_state.no || 0);
    deal.fng_pnl = fngPayout - Number(deal.fng_state.cost || 0);
    deal.agent_pnl = agentPayout - Number(deal.agent_state.cost || 0);
    deal.forecast_winner = forecastWinner(deal, actual);
    deal.updated_at = nowIso();
    totalPnl += deal.fng_pnl;
    session.fng_wallet = Number(session.fng_wallet) + fngPayout;
  }
  session.pnl = totalPnl;
}

function buildResults(session, deals) {
  const perDeal = deals.map(deal => {
    const actual = deal.actual_outcome === true ? 1 : 0;
    return {
      sessionDealId: deal.session_deal_id,
      accountName: deal.account_name,
      target: deal.target,
      targetLabel: deal.target_label,
      actualOutcome: Boolean(deal.actual_outcome),
      baselineProbability: deal.baseline_probability,
      marketProbability: deal.market_probability,
      fngProbability: deal.fng_probability,
      forecastWinner: deal.forecast_winner,
      fngPnl: deal.fng_pnl,
      agentPnl: deal.agent_pnl,
      errors: {
        ml: Math.abs(Number(deal.baseline_probability) - actual),
        market: Math.abs(Number(deal.market_probability) - actual),
        fng: Math.abs(Number(deal.fng_probability) - actual)
      }
    };
  });
  const totals = perDeal.reduce((acc, deal) => {
    acc.ml += deal.errors.ml;
    acc.market += deal.errors.market;
    acc.fng += deal.errors.fng;
    acc.fngPnl += deal.fngPnl;
    acc.agentPnl += deal.agentPnl;
    return acc;
  }, { ml: 0, market: 0, fng: 0, fngPnl: 0, agentPnl: 0 });
  const count = Math.max(1, perDeal.length);
  const aggregateErrors = { ml: totals.ml / count, market: totals.market / count, fng: totals.fng / count };
  return {
    status: session.status,
    forecastWinner: lowestKey(aggregateErrors),
    aggregateErrors,
    fngPnl: totals.fngPnl,
    agentPnl: totals.agentPnl,
    perDeal
  };
}

function safePayload(session, deals, turn, actions, results) {
  return {
    source: session.source,
    session: {
      sessionId: session.session_id,
      mode: session.mode,
      dealCount: Number(session.deal_count),
      status: session.status,
      currentDay: Number(session.current_day),
      maxDays: Number(session.max_days),
      fngWallet: Number(session.fng_wallet),
      playerLabel: session.player_label,
      pnl: Number(session.pnl || 0),
      forecastLeader: session.status === "settled" && results ? results.forecastWinner : forecastLeader(deals)
    },
    deals: deals.map(safeDeal),
    turn: turn ? {
      turnId: turn.turn_id,
      day: Number(turn.day_number),
      cards: turn.intel_cards || [],
      summary: turn.summary || "",
      summarySource: turn.summary_source || "template",
      probabilitySnapshots: turn.probability_snapshots || []
    } : null,
    recentActions: (actions || []).slice(0, 80).map(safeAction),
    results
  };
}

function safeDeal(deal) {
  const payload = deal.observable_payload || {};
  return {
    sessionDealId: deal.session_deal_id,
    dealId: deal.deal_id,
    liveDealId: deal.live_deal_id,
    accountName: deal.account_name,
    target: deal.target,
    targetLabel: deal.target_label,
    marketQuestion: deal.market_question,
    baselineProbability: Number(deal.baseline_probability),
    marketProbability: Number(deal.market_probability),
    fngProbability: Number(deal.fng_probability),
    volume: Number(deal.volume || 0),
    fngPnl: Number(deal.fng_pnl || 0),
    agentPnl: Number(deal.agent_pnl || 0),
    actualOutcome: deal.actual_outcome,
    forecastWinner: deal.forecast_winner,
    fngState: deal.fng_state || {},
    context: {
      amount: payload.deal_amount_arr,
      stage: payload.crm_stage,
      segment: payload.account_segment,
      region: payload.region,
      closeDate: payload.close_date,
      productLine: payload.product_line,
      forecastCategory: payload.forecast_category
    }
  };
}

function safeAction(action) {
  return {
    actionId: action.action_id,
    sessionDealId: action.session_deal_id,
    day: Number(action.day_number),
    actorType: action.actor_type,
    actorName: action.actor_name,
    action: action.action,
    confidence: Number(action.confidence || 0),
    stake: Number(action.stake || 0),
    probabilityBefore: Number(action.probability_before),
    probabilityAfter: Number(action.probability_after),
    impliedProbability: Number(action.implied_probability),
    rationale: action.rationale
  };
}

async function buildBriefing(session, deals, cards) {
  const template = templateBriefing(session, deals, cards);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.BOILER_ROOM_DISABLE_LLM_BRIEFING === "1") return { summary: template, source: "template" };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1",
        instructions: "Write a concise executive-safe daily briefing for a forecasting game. Use only the supplied cards. Gossip is unreliable and must be labeled as such. Do not invent facts.",
        input: JSON.stringify({ mode: session.mode, day: session.current_day, cards: cards.slice(0, 10).map(card => ({ title: card.title, body: card.body, badge: card.badge, account: card.account_name })) }),
        max_output_tokens: 180
      })
    });
    const data = await response.json();
    if (!response.ok) return { summary: template, source: "template" };
    const text = data.output_text || findOutputText(data);
    return { summary: String(text || template).slice(0, 500), source: "llm" };
  } catch (error) {
    return { summary: template, source: "template" };
  }
}

function templateBriefing(session, deals, cards) {
  const top = cards[0];
  const spread = deals.reduce((max, deal) => Math.max(max, Math.abs(Number(deal.market_probability) - Number(deal.baseline_probability))), 0);
  if (!top) return `Day ${session.current_day}/30 is ready. Review the deal stack and submit FNG actions.`;
  return `Day ${session.current_day}/30: biggest disagreement is ${formatPercent(spread)}. Priority item: ${top.account_name} - ${top.title}.`;
}

function probabilitySnapshots(deals) {
  return deals.map(deal => ({
    sessionDealId: deal.session_deal_id,
    accountName: deal.account_name,
    target: deal.target,
    baselineProbability: Number(deal.baseline_probability),
    marketProbability: Number(deal.market_probability),
    fngProbability: Number(deal.fng_probability)
  }));
}

function makeAction(sessionId, deal, day, actorType, actorName, action, confidence, stake, side, before, after, implied, rationale) {
  return {
    action_id: makeId("act"),
    session_id: sessionId,
    session_deal_id: deal.session_deal_id,
    day_number: Number(day),
    actor_type: actorType,
    actor_name: actorName,
    action,
    side,
    confidence,
    stake,
    probability_before: before,
    probability_after: after,
    implied_probability: implied,
    rationale,
    metadata: {},
    created_at: nowIso()
  };
}

function card(kind, title, body, impact, tone, badge) {
  return { kind, title, body, impact: Number(impact || 0), tone, badge };
}

function agentBelief(deal, role, day) {
  const p = deal.observable_payload || {};
  let belief = Number(deal.baseline_probability);
  belief += statusImpact(p.legal_status) * 0.4;
  belief += statusImpact(p.security_review_status) * 0.4;
  belief += statusImpact(p.procurement_status) * 0.45;
  belief += p.budget_confirmed ? 0.045 : -0.025;
  belief += p.economic_buyer_identified ? 0.04 : -0.035;
  belief += (numeric(p.buyer_sentiment_score) - 0.5) * 0.08;
  if (/SE|Solution/i.test(role)) belief += statusImpact(p.security_review_status) * 0.35;
  if (/Legal/i.test(role)) belief += statusImpact(p.legal_status) * 0.35;
  if (/BDR/i.test(role)) belief += (numeric(p.activity_count_last_14_days) - 5) * 0.006;
  belief += (((day + deal.sort_order) % 5) - 2) * 0.012;
  return clamp(belief, 0.02, 0.98);
}

function cardPriority(card, deal) {
  if (!deal) return 0;
  return Math.abs(Number(deal.market_probability) - Number(deal.baseline_probability)) * 2
    + Math.abs(Number(deal.fng_probability) - Number(deal.market_probability))
    + Math.abs(Number(card.impact || 0))
    + (Number(deal.observable_payload && deal.observable_payload.deal_amount_arr) || 0) / 8000000;
}

function forecastLeader(deals) {
  if (!deals.length) return "ml";
  const fngGap = average(deals.map(deal => Math.abs(Number(deal.fng_probability) - Number(deal.market_probability))));
  const mlGap = average(deals.map(deal => Math.abs(Number(deal.baseline_probability) - Number(deal.market_probability))));
  return fngGap <= mlGap ? "fng" : "ml";
}

function forecastWinner(deal, actual) {
  const outcome = actual ? 1 : 0;
  return lowestKey({
    ml: Math.abs(Number(deal.baseline_probability) - outcome),
    market: Math.abs(Number(deal.market_probability) - outcome),
    fng: Math.abs(Number(deal.fng_probability) - outcome)
  });
}

function lowestKey(values) {
  return Object.keys(values).sort((a, b) => values[a] - values[b])[0];
}

function questionForTarget(account, target, payload) {
  if (target === "closed_won_by_original_date") return `Will ${account} close-won by the original close date ${safeValue(payload.original_close_date, "on file")}?`;
  if (target === "slipped_to_next_quarter") return `Will ${account} slip to next quarter?`;
  if (target === "legal_approved_by_date") return `Will legal be approved for ${account} by the target date?`;
  if (target === "security_completed_by_date") return `Will security review be completed for ${account} by the target date?`;
  if (target === "closed_above_threshold") return `Will ${account} close above the ARR threshold?`;
  return `Will ${account} close-won?`;
}

function agentRoster(payload) {
  const members = Array.isArray(payload.account_team_members) ? payload.account_team_members : [];
  if (members.length) return members.map((member, index) => ({ name: member.name || `${member.role || "Agent"} ${index + 1}`, role: member.role || "Agent" }));
  return [
    { name: "AE Seat", role: "AE" },
    { name: "BDR Seat", role: "BDR" },
    { name: "SE Seat", role: "SE" },
    { name: "Manager Seat", role: "Sales Manager" }
  ];
}

function pickEventForDay(events, day) {
  if (!events.length) return null;
  return events[(day - 1) % events.length];
}

function impactForEvent(event) {
  const value = event.event_value || {};
  if (event.event_type === "activity") return 0.03;
  if (event.event_type === "stage_change") return 0.04;
  if (event.event_type === "close_date_changed") return -0.06;
  if (event.event_type === "legal_status" || event.event_type === "security_status") return statusImpact(value.status);
  return 0;
}

function statusImpact(status) {
  return {
    "Approved": 0.08,
    "Passed": 0.08,
    "Not required": 0.04,
    "PO requested": 0.03,
    "Vendor setup": -0.02,
    "In review": -0.02,
    "Review scheduled": -0.01,
    "Questionnaire sent": -0.05,
    "Redlines pending": -0.07,
    "Not started": -0.08,
    "Blocked": -0.18
  }[status] || 0;
}

function fallbackProbability(payload) {
  const stageMap = {
    Discovery: 0.18,
    Qualified: 0.31,
    "Technical Validation": 0.48,
    "Business Case": 0.58,
    Negotiation: 0.72,
    Procurement: 0.81
  };
  return Number(payload.crm_model_probability) || stageMap[payload.crm_stage] || 0.5;
}

function fngStake(confidence, dealCount) {
  const base = [0, 35, 70, 115, 165, 230][confidence] || 115;
  const scale = dealCount >= 10 ? 0.72 : dealCount >= 5 ? 0.86 : 1;
  return Math.round(base * scale);
}

function impliedFngProbability(action, confidence, marketProbability) {
  if (action === "BUY") return clamp(0.5 + confidence * 0.08, 0.54, 0.9);
  if (action === "SELL") return clamp(0.5 - confidence * 0.08, 0.1, 0.46);
  return clamp(Number(marketProbability), 0.03, 0.97);
}

function confidenceFromEdge(edge) {
  return clamp(Math.ceil(Math.abs(edge) / 0.045), 1, 5);
}

function startingWallet(dealCount) {
  return 1400 + dealCount * 420;
}

function qFromProbability(probability, b) {
  const p = clamp(probability, 0.02, 0.98);
  const logit = Math.log(p / (1 - p));
  return { yes: (logit * b) / 2, no: (-logit * b) / 2 };
}

function quoteTrade(deal, side, budget) {
  let low = 0;
  let high = Math.max(1, budget / 0.02);
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const nextCost = lmsrCost(
      Number(deal.q_yes) + (side === "YES" ? mid : 0),
      Number(deal.q_no) + (side === "NO" ? mid : 0),
      Number(deal.liquidity)
    );
    const currentCost = lmsrCost(Number(deal.q_yes), Number(deal.q_no), Number(deal.liquidity));
    if (nextCost - currentCost > budget) high = mid;
    else low = mid;
  }
  return { shares: low };
}

function lmsrCost(qYes, qNo, b) {
  const maxQ = Math.max(qYes, qNo);
  return b * (maxQ / b + Math.log(Math.exp((qYes - maxQ) / b) + Math.exp((qNo - maxQ) / b)));
}

function lmsrPrice(qYes, qNo, b) {
  const yes = Math.exp(qYes / b);
  const no = Math.exp(qNo / b);
  return yes / (yes + no);
}

function readLocalJson(jsonFile, jsonlFile) {
  if (jsonFile) {
    const jsonPath = path.join(DATA_DIR, jsonFile);
    if (fs.existsSync(jsonPath)) return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }
  if (!jsonlFile) return [];
  const jsonlPath = path.join(DATA_DIR, jsonlFile);
  if (!fs.existsSync(jsonlPath)) return [];
  return fs.readFileSync(jsonlPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function groupByDeal(rows) {
  return rows.reduce((groups, row) => {
    if (!groups[row.deal_id]) groups[row.deal_id] = [];
    groups[row.deal_id].push(row);
    return groups;
  }, {});
}

function normalizeSession(session) {
  return { ...session, fng_wallet: Number(session.fng_wallet), pnl: Number(session.pnl || 0) };
}

function normalizeDeal(deal) {
  return {
    ...deal,
    baseline_probability: Number(deal.baseline_probability),
    market_probability: Number(deal.market_probability),
    fng_probability: Number(deal.fng_probability),
    q_yes: Number(deal.q_yes),
    q_no: Number(deal.q_no),
    liquidity: Number(deal.liquidity),
    volume: Number(deal.volume || 0),
    fng_pnl: Number(deal.fng_pnl || 0),
    agent_pnl: Number(deal.agent_pnl || 0),
    fng_state: deal.fng_state || {},
    agent_state: deal.agent_state || {},
    observable_payload: deal.observable_payload || {},
    agent_roster: deal.agent_roster || []
  };
}

function normalizeTurn(turn) {
  if (!turn) return null;
  return { ...turn, intel_cards: turn.intel_cards || [], probability_snapshots: turn.probability_snapshots || [] };
}

function PublicError(status, message, details) {
  this.status = status;
  this.message = message;
  this.details = details || null;
}
PublicError.prototype = Object.create(Error.prototype);

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function uncertainty(value) {
  if (!Number.isFinite(value)) return 0;
  return 1 - Math.abs(clamp(value, 0, 1) - 0.5) * 2;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function formatMaybePercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? formatPercent(number) : "unknown";
}

function safeValue(value, fallback) {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function boolLabel(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, char => char.toUpperCase());
}

module.exports = {
  PublicError,
  getResults,
  getSession,
  startGame,
  submitActions,
  TARGETS
};
