#!/usr/bin/env node

process.env.BOILER_ROOM_FORCE_LOCAL_GAME = process.env.BOILER_ROOM_FORCE_LOCAL_GAME || "1";
process.env.BOILER_ROOM_DISABLE_LLM_BRIEFING = process.env.BOILER_ROOM_DISABLE_LLM_BRIEFING || "1";

const fs = require("fs");
const path = require("path");
const { startGame, submitActions } = require("../api/_game");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "generated", "evaluation");
const POLICIES = [
  "hold_ml",
  "follow_market",
  "calibrated_blend",
  "high_conviction",
  "contrarian",
  "optimistic",
  "pessimistic",
  "noisy",
  "random"
];
const MODES = ["team", "focus", "silent"];
const DEAL_COUNTS = [1, 3, 5, 10];
const MAX_DAYS = [5, 15, 30];
const STAKES = [25, 50, 100, 250];

function parseArgs(argv) {
  const args = { count: 500, seed: 4260521 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--count") {
      args.count = positiveInt(argv[i + 1], args.count);
      i += 1;
    } else if (arg === "--seed") {
      args.seed = positiveInt(argv[i + 1], args.seed);
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const runs = [];
  const deals = [];
  const failures = [];

  for (let index = 0; index < args.count; index += 1) {
    const scenario = scenarioFor(index, args.seed);
    try {
      const result = await playScenario(scenario);
      runs.push(runRow(scenario, result));
      deals.push(...dealRows(scenario, result));
      if ((index + 1) % 25 === 0 || index + 1 === args.count) {
        console.log(`completed ${index + 1}/${args.count}`);
      }
    } catch (error) {
      failures.push({
        scenarioId: scenario.scenarioId,
        mode: scenario.mode,
        dealCount: scenario.dealCount,
        maxDays: scenario.maxDays,
        policy: scenario.policy,
        error: error.message || String(error)
      });
      console.error(`failed ${scenario.scenarioId}: ${error.message || error}`);
    }
  }

  const summary = buildSummary(args, runs, deals, failures);
  writeJson("gameplay_500_summary.json", summary);
  writeCsv("gameplay_500_runs.csv", runs);
  writeCsv("gameplay_500_deals.csv", deals);
  writeMarkdown("gameplay_500_summary.md", summary);
  console.log(JSON.stringify({
    requested: args.count,
    completed: runs.length,
    failed: failures.length,
    resolvedDeals: deals.length,
    summary: path.relative(ROOT, path.join(OUT_DIR, "gameplay_500_summary.json"))
  }, null, 2));
}

function scenarioFor(index, seed) {
  const rng = makeRng(seed + index * 9973);
  return {
    scenarioId: `scenario_${String(index + 1).padStart(4, "0")}`,
    index,
    seed: seed + index * 9973,
    mode: MODES[index % MODES.length],
    dealCount: DEAL_COUNTS[Math.floor(index / MODES.length) % DEAL_COUNTS.length],
    maxDays: MAX_DAYS[Math.floor(index / (MODES.length * DEAL_COUNTS.length)) % MAX_DAYS.length],
    policy: POLICIES[Math.floor(index / (MODES.length * DEAL_COUNTS.length * MAX_DAYS.length)) % POLICIES.length],
    jitter: rng()
  };
}

async function playScenario(scenario) {
  const rng = makeRng(scenario.seed);
  let payload = await startGame({
    mode: scenario.mode,
    dealCount: scenario.dealCount,
    maxDays: scenario.maxDays
  });
  let turns = 0;
  let actionsSubmitted = 0;
  let buyCount = 0;
  let holdCount = 0;
  let sellCount = 0;
  const finalAgentMarketByDeal = {};

  while (payload.session.status !== "settled") {
    const day = payload.session.currentDay;
    if (Number(day) >= Number(payload.session.maxDays || scenario.maxDays)) {
      payload.deals.forEach(deal => {
        finalAgentMarketByDeal[deal.sessionDealId] = Number(deal.marketProbability);
      });
    }
    const actions = payload.deals.map((deal, dealIndex) => {
      const action = chooseAction(scenario.policy, payload, deal, dealIndex, rng);
      if (action.action === "BUY") buyCount += 1;
      if (action.action === "HOLD") holdCount += 1;
      if (action.action === "SELL") sellCount += 1;
      return action;
    });
    actionsSubmitted += actions.length;
    payload = await submitActions({ sessionId: payload.session.sessionId, day, actions });
    turns += 1;
    if (turns > scenario.maxDays + 1) throw new Error("Scenario exceeded expected turn count.");
  }

  payload.evaluation = { turns, actionsSubmitted, buyCount, holdCount, sellCount, finalAgentMarketByDeal };
  return payload;
}

function chooseAction(policy, payload, deal, dealIndex, rng) {
  const baseline = clamp(Number(deal.baselineProbability || 0.5), 0.02, 0.98);
  const market = clamp(Number(deal.marketProbability || baseline), 0.02, 0.98);
  const fng = clamp(Number(deal.fngProbability || baseline), 0.02, 0.98);
  const day = Number(payload.session.currentDay || 1);
  const intel = visibleIntelSignal(payload, deal.sessionDealId);
  const wave = (((day + dealIndex) % 5) - 2) * 0.015;
  let probability = baseline;

  if (policy === "follow_market") probability = market + intel * 0.35 + wave;
  if (policy === "calibrated_blend") probability = baseline * 0.55 + market * 0.35 + 0.5 * 0.1 + intel * 0.25 + wave;
  if (policy === "high_conviction") probability = market >= 0.5 ? Math.max(baseline, market) + 0.16 + intel * 0.25 : Math.min(baseline, market) - 0.16 + intel * 0.25;
  if (policy === "contrarian") probability = baseline - (market - baseline) * 0.75 - intel * 0.2 + wave;
  if (policy === "optimistic") probability = Math.max(baseline, market, fng) + 0.12 + intel * 0.2 + wave;
  if (policy === "pessimistic") probability = Math.min(baseline, market, fng) - 0.12 + intel * 0.2 + wave;
  if (policy === "noisy") probability = baseline * 0.45 + market * 0.35 + 0.1 + (rng() - 0.5) * 0.34 + intel * 0.1;
  if (policy === "random") probability = 0.05 + rng() * 0.9;

  probability = clamp(probability, 0.02, 0.98);
  const edge = probability - market;
  const action = actionForEdge(edge, policy);
  if (action === "HOLD") return { sessionDealId: deal.sessionDealId, action };
  return {
    sessionDealId: deal.sessionDealId,
    action,
    probability,
    stake: stakeFor(edge, policy)
  };
}

function visibleIntelSignal(payload, sessionDealId) {
  const cards = payload.turn && Array.isArray(payload.turn.cards) ? payload.turn.cards : [];
  const relevant = cards.filter(card => card.session_deal_id === sessionDealId || card.sessionDealId === sessionDealId);
  if (!relevant.length) return 0;
  const sum = relevant.reduce((total, card) => total + Number(card.impact || 0), 0);
  return clamp(sum / relevant.length, -0.2, 0.2);
}

function actionForEdge(edge, policy) {
  const threshold = policy === "high_conviction" ? 0.02 : policy === "random" ? 0.08 : 0.035;
  if (edge >= threshold) return "BUY";
  if (edge <= -threshold) return "SELL";
  return "HOLD";
}

function stakeFor(edge, policy) {
  const absolute = Math.abs(edge);
  if (policy === "random") return STAKES[Math.floor(absolute * 1000) % STAKES.length];
  if (absolute >= 0.24) return 250;
  if (absolute >= 0.14) return 100;
  if (absolute >= 0.07) return 50;
  return 25;
}

function runRow(scenario, payload) {
  const results = payload.results || {};
  const aggregateBrier = results.aggregateBrier || {};
  const aggregateErrors = results.aggregateErrors || {};
  const evaluation = payload.evaluation || {};
  return {
    scenario_id: scenario.scenarioId,
    session_id: payload.session.sessionId,
    mode: scenario.mode,
    deal_count: scenario.dealCount,
    max_days: scenario.maxDays,
    policy: scenario.policy,
    status: payload.session.status,
    turns: evaluation.turns || 0,
    actions_submitted: evaluation.actionsSubmitted || 0,
    buy_count: evaluation.buyCount || 0,
    hold_count: evaluation.holdCount || 0,
    sell_count: evaluation.sellCount || 0,
    forecast_winner: results.forecastWinner || "",
    brier_winner: lowestKey(aggregateBrier),
    ml_brier: numberOrBlank(aggregateBrier.ml),
    market_brier: numberOrBlank(aggregateBrier.market),
    fng_brier: numberOrBlank(aggregateBrier.fng),
    ml_abs_error: numberOrBlank(aggregateErrors.ml),
    market_abs_error: numberOrBlank(aggregateErrors.market),
    fng_abs_error: numberOrBlank(aggregateErrors.fng),
    fng_pnl: numberOrBlank(results.fngPnl),
    agent_pnl: numberOrBlank(results.agentPnl)
  };
}

function dealRows(scenario, payload) {
  const results = payload.results || {};
  const finalAgentMarketByDeal = payload.evaluation && payload.evaluation.finalAgentMarketByDeal ? payload.evaluation.finalAgentMarketByDeal : {};
  const safeDealsById = new Map((payload.deals || []).map(deal => [deal.sessionDealId, deal]));
  return (results.perDeal || []).map(deal => {
    const safeDeal = safeDealsById.get(deal.sessionDealId) || {};
    const context = safeDeal.context || {};
    const outcome = deal.actualOutcome ? 1 : 0;
    const ml = clamp(Number(deal.baselineProbability), 0, 1);
    const consensus = clamp(Number(deal.marketProbability), 0, 1);
    const agentMarket = clamp(Number(finalAgentMarketByDeal[deal.sessionDealId]), 0, 1);
    const agent = Number.isFinite(agentMarket) ? agentMarket : consensus;
    const fng = clamp(Number(deal.fngProbability), 0, 1);
    const oracle = outcome ? 0.95 : 0.05;
    return {
      scenario_id: scenario.scenarioId,
      session_id: payload.session.sessionId,
      session_deal_id: deal.sessionDealId,
      mode: scenario.mode,
      deal_count: scenario.dealCount,
      max_days: scenario.maxDays,
      policy: scenario.policy,
      account_name: deal.accountName,
      target: deal.target,
      stage: context.stage || "",
      segment: context.segment || "",
      region: context.region || "",
      forecast_category: context.forecastCategory || "",
      amount: numberOrBlank(context.amount),
      outcome,
      ml_prob: ml,
      agent_market_prob: agent,
      consensus_market_prob: consensus,
      market_prob: consensus,
      fng_prob: fng,
      oracle_shadow_prob: oracle,
      ml_right: rightAtHalf(ml, outcome),
      agent_market_right: rightAtHalf(agent, outcome),
      consensus_market_right: rightAtHalf(consensus, outcome),
      market_right: rightAtHalf(consensus, outcome),
      fng_right: rightAtHalf(fng, outcome),
      ml_brier: brier(ml, outcome),
      agent_market_brier: brier(agent, outcome),
      consensus_market_brier: brier(consensus, outcome),
      market_brier: brier(consensus, outcome),
      fng_brier: brier(fng, outcome),
      oracle_shadow_brier: brier(oracle, outcome),
      ml_log_loss: logLoss(ml, outcome),
      agent_market_log_loss: logLoss(agent, outcome),
      consensus_market_log_loss: logLoss(consensus, outcome),
      market_log_loss: logLoss(consensus, outcome),
      fng_log_loss: logLoss(fng, outcome),
      agent_market_move_from_ml: agent - ml,
      consensus_market_move_from_ml: consensus - ml,
      human_consensus_delta: consensus - agent,
      market_move_from_ml: consensus - ml,
      fng_move_from_ml: fng - ml,
      per_deal_winner_brier: lowestKey({ ml: brier(ml, outcome), market: brier(consensus, outcome), fng: brier(fng, outcome) }),
      signal_layer_winner_brier: lowestKey({
        ml: brier(ml, outcome),
        agentMarket: brier(agent, outcome),
        consensusMarket: brier(consensus, outcome),
        fng: brier(fng, outcome)
      }),
      per_deal_winner_abs_error: deal.forecastWinner || ""
    };
  });
}

function buildSummary(args, runs, deals, failures) {
  const byPolicy = groupBy(deals, "policy");
  const byMode = groupBy(runs, "mode");
  const policySummary = Object.fromEntries(Object.entries(byPolicy).map(([policy, rows]) => [policy, metricBlock(rows)]));
  return {
    generatedAt: new Date().toISOString(),
    requestedScenarios: args.count,
    completedScenarios: runs.length,
    failedScenarios: failures.length,
    resolvedDeals: deals.length,
    definitionOfWorking: {
      mechanicalHealthPass: runs.length === args.count && failures.length === 0,
      scoringIntegrityPass: scoringIntegrity(runs, deals).mismatches === 0,
      noLeakagePolicy: "Action policies use only pre-settlement payload fields; oracle_shadow is report-only.",
      primaryScore: "Brier score",
      directionalRightThreshold: 0.5
    },
    overall: metricBlock(deals),
    policies: policySummary,
    modes: Object.fromEntries(Object.entries(byMode).map(([mode, rows]) => [mode, {
      runs: rows.length,
      completionRate: rows.filter(row => row.status === "settled").length / Math.max(1, rows.length),
      avgActionsSubmitted: mean(rows.map(row => row.actions_submitted)),
      avgBuys: mean(rows.map(row => row.buy_count)),
      avgHolds: mean(rows.map(row => row.hold_count)),
      avgSells: mean(rows.map(row => row.sell_count))
    }])),
    runWinners: counts(runs.map(row => row.brier_winner)),
    forecastWinnerField: counts(runs.map(row => row.forecast_winner)),
    signalLayerWinners: counts(deals.map(row => row.signal_layer_winner_brier)),
    scoringIntegrity: scoringIntegrity(runs, deals),
    lrMarketVsMl: lrBlock(deals),
    subsets: buildSubsetReport(deals),
    calibration: {
      ml: calibrationBins(deals, "ml_prob", 10),
      market: calibrationBins(deals, "market_prob", 10),
      fng: calibrationBins(deals, "fng_prob", 10)
    },
    failures
  };
}

function metricBlock(rows) {
  return {
    n: rows.length,
    rightOff: {
      mlRight: sum(rows.map(row => row.ml_right)),
      mlOff: rows.length - sum(rows.map(row => row.ml_right)),
      agentMarketRight: sum(rows.map(row => row.agent_market_right)),
      agentMarketOff: rows.length - sum(rows.map(row => row.agent_market_right)),
      consensusMarketRight: sum(rows.map(row => row.consensus_market_right)),
      consensusMarketOff: rows.length - sum(rows.map(row => row.consensus_market_right)),
      marketRight: sum(rows.map(row => row.consensus_market_right)),
      marketOff: rows.length - sum(rows.map(row => row.consensus_market_right)),
      fngRight: sum(rows.map(row => row.fng_right)),
      fngOff: rows.length - sum(rows.map(row => row.fng_right))
    },
    brier: {
      ml: distribution(rows.map(row => row.ml_brier)),
      agentMarket: distribution(rows.map(row => row.agent_market_brier)),
      consensusMarket: distribution(rows.map(row => row.consensus_market_brier)),
      market: distribution(rows.map(row => row.consensus_market_brier)),
      fng: distribution(rows.map(row => row.fng_brier)),
      oracleShadow: distribution(rows.map(row => row.oracle_shadow_brier))
    },
    logLoss: {
      ml: mean(rows.map(row => row.ml_log_loss)),
      agentMarket: mean(rows.map(row => row.agent_market_log_loss)),
      consensusMarket: mean(rows.map(row => row.consensus_market_log_loss)),
      market: mean(rows.map(row => row.consensus_market_log_loss)),
      fng: mean(rows.map(row => row.fng_log_loss))
    },
    perDealBrierWinners: counts(rows.map(row => row.per_deal_winner_brier)),
    signalLayerWinners: counts(rows.map(row => row.signal_layer_winner_brier)),
    agentMarketBeatsMl: rows.filter(row => row.agent_market_brier < row.ml_brier).length,
    consensusMarketBeatsMl: rows.filter(row => row.consensus_market_brier < row.ml_brier).length,
    consensusMarketBeatsAgentMarket: rows.filter(row => row.consensus_market_brier < row.agent_market_brier).length,
    marketBeatsMl: rows.filter(row => row.consensus_market_brier < row.ml_brier).length,
    fngBeatsMl: rows.filter(row => row.fng_brier < row.ml_brier).length,
    fngBeatsMarket: rows.filter(row => row.fng_brier < row.consensus_market_brier).length,
    avgAgentMarketMoveFromMl: mean(rows.map(row => row.agent_market_move_from_ml)),
    avgConsensusMarketMoveFromMl: mean(rows.map(row => row.consensus_market_move_from_ml)),
    avgHumanConsensusDelta: mean(rows.map(row => row.human_consensus_delta)),
    avgMarketMoveFromMl: mean(rows.map(row => row.consensus_market_move_from_ml)),
    avgFngMoveFromMl: mean(rows.map(row => row.fng_move_from_ml))
  };
}

function buildSubsetReport(deals) {
  const specs = [];
  addSubset(specs, "ML uncertainty 40-60", "uncertainty", rows => rows.filter(row => row.ml_prob >= 0.4 && row.ml_prob <= 0.6));
  addSubset(specs, "ML uncertainty 35-65", "uncertainty", rows => rows.filter(row => row.ml_prob >= 0.35 && row.ml_prob <= 0.65));
  addSubset(specs, "High ML confidence", "uncertainty", rows => rows.filter(row => row.ml_prob < 0.25 || row.ml_prob > 0.75));
  addSubset(specs, "Consensus disagrees with ML >= 3pp", "disagreement", rows => rows.filter(row => Math.abs(row.consensus_market_prob - row.ml_prob) >= 0.03));
  addSubset(specs, "Consensus disagrees with ML >= 5pp", "disagreement", rows => rows.filter(row => Math.abs(row.consensus_market_prob - row.ml_prob) >= 0.05));
  addSubset(specs, "Human moved consensus >= 2pp", "human", rows => rows.filter(row => Math.abs(row.human_consensus_delta) >= 0.02));
  addSubset(specs, "Human moved consensus >= 5pp", "human", rows => rows.filter(row => Math.abs(row.human_consensus_delta) >= 0.05));
  addSubset(specs, "High-value deals", "amount", rows => {
    const amounts = rows.map(row => Number(row.amount)).filter(Number.isFinite).sort((a, b) => a - b);
    const threshold = percentile(amounts, 0.75);
    return rows.filter(row => Number(row.amount) >= threshold);
  });
  addSubset(specs, "Low-value deals", "amount", rows => {
    const amounts = rows.map(row => Number(row.amount)).filter(Number.isFinite).sort((a, b) => a - b);
    const threshold = percentile(amounts, 0.25);
    return rows.filter(row => Number(row.amount) <= threshold);
  });

  uniqueValues(deals, "target").forEach(value => addSubset(specs, `Target: ${value}`, "target", rows => rows.filter(row => row.target === value)));
  uniqueValues(deals, "stage").forEach(value => addSubset(specs, `Stage: ${value}`, "stage", rows => rows.filter(row => row.stage === value)));
  uniqueValues(deals, "forecast_category").forEach(value => addSubset(specs, `Forecast: ${value}`, "forecast", rows => rows.filter(row => row.forecast_category === value)));
  uniqueValues(deals, "mode").forEach(value => addSubset(specs, `Mode: ${value}`, "mode", rows => rows.filter(row => row.mode === value)));
  uniqueValues(deals, "policy").forEach(value => addSubset(specs, `Policy: ${value}`, "policy", rows => rows.filter(row => row.policy === value)));
  uniqueValues(deals, "deal_count").forEach(value => addSubset(specs, `Deal count: ${value}`, "setup", rows => rows.filter(row => row.deal_count === value)));
  uniqueValues(deals, "max_days").forEach(value => addSubset(specs, `Run length: ${value}`, "setup", rows => rows.filter(row => row.max_days === value)));

  const all = specs
    .map(spec => subsetMetric(spec.name, spec.category, spec.select(deals)))
    .filter(item => item.n >= 30)
    .sort((a, b) => b.consensusLiftVsMl - a.consensusLiftVsMl);

  return {
    minN: 30,
    bestConsensusLiftVsMl: all.slice(0, 12),
    worstConsensusLiftVsMl: all.slice(-12).reverse(),
    bestConsensusLiftVsAgentMarket: all.slice().sort((a, b) => b.consensusLiftVsAgentMarket - a.consensusLiftVsAgentMarket).slice(0, 12),
    worstConsensusLiftVsAgentMarket: all.slice().sort((a, b) => a.consensusLiftVsAgentMarket - b.consensusLiftVsAgentMarket).slice(0, 12),
    all
  };
}

function addSubset(specs, name, category, select) {
  specs.push({ name, category, select });
}

function subsetMetric(name, category, rows) {
  const ml = mean(rows.map(row => row.ml_brier));
  const agent = mean(rows.map(row => row.agent_market_brier));
  const consensus = mean(rows.map(row => row.consensus_market_brier));
  const fng = mean(rows.map(row => row.fng_brier));
  return {
    name,
    category,
    n: rows.length,
    mlBrier: ml,
    agentMarketBrier: agent,
    consensusMarketBrier: consensus,
    fngBrier: fng,
    agentLiftVsMl: ml - agent,
    consensusLiftVsMl: ml - consensus,
    consensusLiftVsAgentMarket: agent - consensus,
    consensusAccuracy: rows.length ? sum(rows.map(row => row.consensus_market_right)) / rows.length : 0,
    mlAccuracy: rows.length ? sum(rows.map(row => row.ml_right)) / rows.length : 0
  };
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map(row => row[key]).filter(value => value !== null && value !== undefined && value !== ""))).sort();
}

function scoringIntegrity(runs, deals) {
  const runWinnerMismatches = runs.filter(row => row.forecast_winner && row.brier_winner && row.forecast_winner !== row.brier_winner);
  const perDealMismatches = deals.filter(row => row.per_deal_winner_abs_error && row.per_deal_winner_brier !== row.per_deal_winner_abs_error);
  return {
    mismatches: runWinnerMismatches.length + perDealMismatches.length,
    runWinnerMismatches: runWinnerMismatches.length,
    perDealWinnerMismatches: perDealMismatches.length,
    note: "The current result field may use absolute-error winners while the headline uses aggregate Brier; this flags any divergence."
  };
}

function lrBlock(rows) {
  const ml = sum(rows.map(row => -row.ml_log_loss));
  const market = sum(rows.map(row => -row.market_log_loss));
  const agentMarket = sum(rows.map(row => -row.agent_market_log_loss));
  return {
    logL_ml: ml,
    logL_agent_market: agentMarket,
    logL_market: market,
    lrAgentMarketVsMl: 2 * (agentMarket - ml),
    lrConsensusMarketVsMl: 2 * (market - ml),
    lrConsensusMarketVsAgentMarket: 2 * (market - agentMarket),
    lr: 2 * (market - ml)
  };
}

function calibrationBins(rows, key, binCount) {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    binStart: index / binCount,
    binEnd: (index + 1) / binCount,
    n: 0,
    meanPredicted: 0,
    meanActual: 0
  }));
  rows.forEach(row => {
    const p = clamp(Number(row[key]), 0, 1);
    const index = Math.min(binCount - 1, Math.floor(p * binCount));
    bins[index].n += 1;
    bins[index].meanPredicted += p;
    bins[index].meanActual += Number(row.outcome);
  });
  return bins.map(bin => {
    if (bin.n > 0) {
      bin.meanPredicted /= bin.n;
      bin.meanActual /= bin.n;
    } else {
      bin.meanPredicted = null;
      bin.meanActual = null;
    }
    return bin;
  });
}

function writeJson(name, payload) {
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCsv(name, rows) {
  const filePath = path.join(OUT_DIR, name);
  if (!rows.length) {
    fs.writeFileSync(filePath, "\n");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")].concat(rows.map(row => headers.map(header => csvCell(row[header])).join(",")));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function writeMarkdown(name, summary) {
  const overall = summary.overall;
  const subsets = summary.subsets || { bestConsensusLiftVsMl: [], worstConsensusLiftVsMl: [], bestConsensusLiftVsAgentMarket: [] };
  const lines = [
    "# Gameplay 500 Evaluation",
    "",
    `- Scenarios completed: ${summary.completedScenarios}/${summary.requestedScenarios}`,
    `- Resolved deal forecasts: ${summary.resolvedDeals}`,
    `- Mechanical health: ${summary.definitionOfWorking.mechanicalHealthPass ? "PASS" : "FAIL"}`,
    `- Scoring integrity: ${summary.definitionOfWorking.scoringIntegrityPass ? "PASS" : "FAIL"}`,
    `- ML right/off: ${overall.rightOff.mlRight}/${overall.rightOff.mlOff}`,
    `- AI-agent market right/off: ${overall.rightOff.agentMarketRight}/${overall.rightOff.agentMarketOff}`,
    `- Consensus market right/off: ${overall.rightOff.consensusMarketRight}/${overall.rightOff.consensusMarketOff}`,
    `- FNG right/off: ${overall.rightOff.fngRight}/${overall.rightOff.fngOff}`,
    `- Mean Brier: ML ${overall.brier.ml.mean.toFixed(4)}, AI-agent ${overall.brier.agentMarket.mean.toFixed(4)}, Consensus ${overall.brier.consensusMarket.mean.toFixed(4)}, FNG ${overall.brier.fng.mean.toFixed(4)}`,
    `- LR consensus vs ML: ${summary.lrMarketVsMl.lrConsensusMarketVsMl.toFixed(2)}`,
    `- LR consensus vs AI-agent market: ${summary.lrMarketVsMl.lrConsensusMarketVsAgentMarket.toFixed(2)}`,
    "",
    "## Run Winners",
    "",
    JSON.stringify(summary.runWinners, null, 2),
    "",
    "## Best Consensus Lift vs ML",
    "",
    markdownSubsetTable(subsets.bestConsensusLiftVsMl),
    "",
    "## Worst Consensus Lift vs ML",
    "",
    markdownSubsetTable(subsets.worstConsensusLiftVsMl),
    "",
    "## Best Consensus Lift vs AI-Agent Market",
    "",
    markdownSubsetTable(subsets.bestConsensusLiftVsAgentMarket),
    "",
    "## Notes",
    "",
    summary.scoringIntegrity.note
  ];
  fs.writeFileSync(path.join(OUT_DIR, name), `${lines.join("\n")}\n`);
}

function markdownSubsetTable(rows) {
  if (!rows.length) return "No qualifying subsets.";
  const lines = [
    "| Subset | N | ML Brier | Agent Brier | Consensus Brier | Consensus lift vs ML | Consensus lift vs agent |",
    "|---|---:|---:|---:|---:|---:|---:|"
  ];
  rows.slice(0, 8).forEach(row => {
    lines.push(`| ${row.name} | ${row.n} | ${row.mlBrier.toFixed(4)} | ${row.agentMarketBrier.toFixed(4)} | ${row.consensusMarketBrier.toFixed(4)} | ${formatSigned(row.consensusLiftVsMl)} | ${formatSigned(row.consensusLiftVsAgentMarket)} |`);
  });
  return lines.join("\n");
}

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(4)}`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function rightAtHalf(probability, outcome) {
  return (Number(probability) >= 0.5) === Boolean(outcome) ? 1 : 0;
}

function brier(probability, outcome) {
  const p = clamp(Number(probability), 0, 1);
  return (p - Number(outcome)) * (p - Number(outcome));
}

function logLoss(probability, outcome) {
  const p = clamp(Number(probability), 1e-6, 1 - 1e-6);
  const y = Number(outcome);
  return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    mean: mean(sorted),
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9)
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "";
    if (!acc[value]) acc[value] = [];
    acc[value].push(row);
    return acc;
  }, {});
}

function counts(values) {
  return values.reduce((acc, value) => {
    const key = value || "";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function lowestKey(values) {
  const entries = Object.entries(values || {}).filter(([, value]) => Number.isFinite(Number(value)));
  if (!entries.length) return "";
  return entries.sort((a, b) => Number(a[1]) - Number(b[1]))[0][0];
}

function numberOrBlank(value) {
  return Number.isFinite(Number(value)) ? Number(value) : "";
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? sum(finite) / finite.length : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
