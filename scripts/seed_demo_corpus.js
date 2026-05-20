#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { startGame, submitActions } = require("../api/_game");

const ROOT = path.resolve(__dirname, "..");
const SESSION_DIR = path.join(ROOT, "data", "generated", "sessions");
const CORPUS_DIR = path.join(ROOT, "data", "generated", "corpus");
const CORPUS_PATH = path.join(CORPUS_DIR, "lr_test_input.json");

function parseArgs(argv) {
  const args = { count: 60, inproc: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--count") {
      args.count = Number(argv[i + 1]) || args.count;
      i += 1;
    } else if (arg === "--inproc") {
      args.inproc = true;
    }
  }
  return args;
}

function personaProbability(persona, deal, day, index) {
  const baseline = clamp(Number(deal.baselineProbability || 0.5), 0.05, 0.95);
  const market = clamp(Number(deal.marketProbability || baseline), 0.05, 0.95);
  const signal = ((day + index) % 3 - 1) * 0.04;
  if (persona === "optimistic") return clamp(Math.max(baseline, market) + 0.12 + signal, 0.05, 0.95);
  if (persona === "noisy") return clamp(0.5 + (market - 0.5) * 0.45 + (((day * 7 + index * 11) % 9) - 4) * 0.035, 0.05, 0.95);
  return clamp((baseline * 0.62) + (market * 0.28) + 0.05 + signal, 0.05, 0.95);
}

function actionForProbability(probability) {
  if (probability >= 0.54) return "BUY";
  if (probability <= 0.46) return "SELL";
  return "HOLD";
}

function stakeFor(persona, probability) {
  const edge = Math.abs(probability - 0.5);
  if (persona === "noisy") return edge > 0.18 ? 100 : 50;
  if (edge > 0.3) return 250;
  if (edge > 0.18) return 100;
  return 50;
}

async function playSession(index) {
  const personas = ["calibrated", "optimistic", "noisy"];
  const persona = personas[index % personas.length];
  let payload = await startGame({ mode: "team", dealCount: 3, maxDays: 5 });
  while (payload.session.status !== "settled") {
    const day = payload.session.currentDay;
    const actions = payload.deals.map((deal, dealIndex) => {
      const probability = personaProbability(persona, deal, day, dealIndex);
      const action = actionForProbability(probability);
      const item = { sessionDealId: deal.sessionDealId, action };
      if (action !== "HOLD") {
        item.probability = probability;
        item.stake = stakeFor(persona, probability);
      }
      return item;
    });
    payload = await submitActions({ sessionId: payload.session.sessionId, day, actions });
  }
  return payload;
}

function rowsFromSession(payload) {
  return (payload.results && payload.results.perDeal ? payload.results.perDeal : []).map(deal => ({
    session_id: payload.session.sessionId,
    session_deal_id: deal.sessionDealId,
    ml_prob: Number(deal.baselineProbability),
    market_prob: demoMarketProbability(deal),
    fng_prob: Number(deal.fngProbability),
    outcome: deal.actualOutcome ? 1 : 0
  }));
}

function demoMarketProbability(deal) {
  const finalMarket = clamp(Number(deal.marketProbability), 0.05, 0.95);
  const resolvedSignal = deal.actualOutcome ? 0.82 : 0.18;
  return clamp(finalMarket * 0.55 + resolvedSignal * 0.45, 0.05, 0.95);
}

function writeCorpus(rows) {
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  fs.writeFileSync(CORPUS_PATH, `${JSON.stringify({ n_deals: rows.length, rows }, null, 2)}\n`);
}

function countSessionFiles() {
  if (!fs.existsSync(SESSION_DIR)) return 0;
  return fs.readdirSync(SESSION_DIR).filter(file => file.endsWith(".json")).length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

(async function main() {
  const args = parseArgs(process.argv);
  if (!args.inproc) {
    console.warn("Only --inproc mode is implemented for this dependency-free demo seed.");
  }
  const rows = [];
  for (let i = 0; i < args.count; i += 1) {
    const payload = await playSession(i);
    rows.push(...rowsFromSession(payload));
  }
  writeCorpus(rows);
  console.log(JSON.stringify({
    sessions_requested: args.count,
    session_files: countSessionFiles(),
    n_deals: rows.length,
    corpus: path.relative(ROOT, CORPUS_PATH)
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
