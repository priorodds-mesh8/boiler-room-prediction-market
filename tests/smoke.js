const { __test } = require("../api/_game");

const {
  buildResults,
  applyFngActions,
  buildAttribution,
  buildHeadline,
  lmsrCost,
  lmsrPrice,
  normalizeFngActions,
  qFromProbability,
  quoteTrade,
  safePayload,
  settleSession
} = __test;

const EPSILON = 1e-6;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeDeal(overrides) {
  const q = qFromProbability(0.5, 520);
  return Object.assign({
    session_deal_id: "sd_test",
    session_id: "game_test",
    deal_id: "deal_test",
    live_deal_id: "live_test",
    target: "closed_won",
    target_label: "Close won",
    account_name: "Acme Test",
    market_question: "Will Acme Test close?",
    baseline_probability: 0.55,
    market_probability: 0.5,
    fng_probability: 0.6,
    q_yes: q.yes,
    q_no: q.no,
    liquidity: 520,
    volume: 0,
    fng_pnl: 0,
    agent_pnl: 0,
    actual_outcome: null,
    forecast_winner: null,
    observable_payload: {},
    fng_state: { yes: 0, no: 0, cost: 0, walletSpent: 0 },
    agent_state: { yes: 0, no: 0, cost: 0 }
  }, overrides || {});
}

function makeSession(overrides) {
  return Object.assign({
    session_id: "game_test",
    mode: "team",
    deal_count: 1,
    status: "active",
    current_day: 1,
    max_days: 5,
    fng_wallet: 1500,
    player_label: "You",
    source: "test",
    pnl: 0
  }, overrides || {});
}

function testLmsrMath() {
  const b = 520;
  assertClose(lmsrCost(0, 0, b), b * Math.log(2), EPSILON, "cost at origin");
  assertClose(lmsrPrice(0, 0, b), 0.5, EPSILON, "price at origin");
  assertClose(lmsrCost(100, 0, b), b * Math.log(Math.exp(100 / b) + 1), EPSILON, "positive YES cost");
  assertClose(lmsrCost(0, 100, b), lmsrCost(100, 0, b), EPSILON, "cost symmetry");
  assertClose(lmsrPrice(100, 0, b) + lmsrPrice(0, 100, b), 1, EPSILON, "prices are complementary");
  const q = qFromProbability(0.7, b);
  assertClose(lmsrPrice(q.yes, q.no, b), 0.7, EPSILON, "qFromProbability round trip");
}

function testQuoteTrade() {
  const q = qFromProbability(0.5, 520);
  const yesDeal = makeDeal({ q_yes: q.yes, q_no: q.no, liquidity: 520 });
  const yesQuote = quoteTrade(yesDeal, "YES", 50);
  const yesCost = lmsrCost(yesDeal.q_yes + yesQuote.shares, yesDeal.q_no, yesDeal.liquidity) - lmsrCost(yesDeal.q_yes, yesDeal.q_no, yesDeal.liquidity);
  assert(yesQuote.shares > 0, "YES quote returns shares");
  assert(yesCost <= 50 + EPSILON, "YES quote respects budget");
  assert(lmsrPrice(yesDeal.q_yes + yesQuote.shares, yesDeal.q_no, yesDeal.liquidity) > 0.5, "YES quote moves price up");

  const noDeal = makeDeal({ q_yes: q.yes, q_no: q.no, liquidity: 520 });
  const noQuote = quoteTrade(noDeal, "NO", 50);
  const noCost = lmsrCost(noDeal.q_yes, noDeal.q_no + noQuote.shares, noDeal.liquidity) - lmsrCost(noDeal.q_yes, noDeal.q_no, noDeal.liquidity);
  assert(noQuote.shares > 0, "NO quote returns shares");
  assert(noCost <= 50 + EPSILON, "NO quote respects budget");
  assert(lmsrPrice(noDeal.q_yes, noDeal.q_no + noQuote.shares, noDeal.liquidity) < 0.5, "NO quote moves price down");
}

async function testSettlementPayouts() {
  const yesSession = makeSession({ fng_wallet: 0 });
  const yesDeal = makeDeal();
  yesDeal.fng_state.yes = 100;
  yesDeal.fng_state.no = 100;
  await settleSession(yesSession, [yesDeal], { fetchOutcomes: async () => ({ deal_test: { closed_won: true } }) });
  assertClose(yesSession.fng_wallet, 100, EPSILON, "YES pays 100 when outcome is true");
  assertClose(yesDeal.fng_pnl, 100, EPSILON, "YES P&L is 100 when cost is zero and outcome is true");

  const noSession = makeSession({ fng_wallet: 0 });
  const noDeal = makeDeal();
  noDeal.fng_state.yes = 100;
  noDeal.fng_state.no = 100;
  await settleSession(noSession, [noDeal], { fetchOutcomes: async () => ({ deal_test: { closed_won: false } }) });
  assertClose(noSession.fng_wallet, 100, EPSILON, "NO pays 100 when outcome is false");
  assertClose(noDeal.fng_pnl, 100, EPSILON, "NO P&L is 100 when cost is zero and outcome is false");
}

async function testOutcomeSealing() {
  const session = makeSession();
  const deal = makeDeal({ actual_outcome: true, forecast_winner: "fng" });
  const activePayload = safePayload(session, [clone(deal)], null, [], null);
  assert(!Object.prototype.hasOwnProperty.call(activePayload.deals[0], "actualOutcome"), "active payload seals actual outcome");
  assert(!Object.prototype.hasOwnProperty.call(activePayload.deals[0], "forecastWinner"), "active payload seals forecast winner");
  assert(activePayload.results === null, "active payload has no results");

  const settledSession = makeSession({ status: "active", fng_wallet: 0 });
  const settledDeal = makeDeal();
  settledDeal.fng_state.yes = 100;
  await settleSession(settledSession, [settledDeal], { fetchOutcomes: async () => ({ deal_test: { closed_won: true } }) });
  const results = buildResults(settledSession, [settledDeal]);
  const settledPayload = safePayload(settledSession, [settledDeal], null, [], results);
  assert(settledPayload.deals[0].actualOutcome === true, "settled payload reveals actual outcome");
  assert(settledPayload.deals[0].forecastWinner, "settled payload reveals forecast winner");
  assert(settledPayload.results.perDeal[0].actualOutcome === true, "settled results include actual outcome");
  assert(settledPayload.results.forecastWinner, "settled results include forecast winner");
}

function testExplicitProbabilityStakeActions() {
  const session = makeSession();
  const deal = makeDeal();
  const normalized = normalizeFngActions([{ sessionDealId: deal.session_deal_id, action: "BUY", probability: 0.65, stake: 50 }], [deal]);
  assertClose(normalized[0].probability, 0.65, EPSILON, "new payload keeps explicit probability");
  assertClose(normalized[0].stake, 50, EPSILON, "new payload keeps explicit stake");
  const records = applyFngActions(session, [deal], normalized);
  assertClose(deal.fng_probability, 0.65, EPSILON, "explicit probability sets user probability");
  assert(records[0].metadata.stake_usd === 50, "metadata records stake");
  assert(records[0].metadata.probability_pct === 65, "metadata records probability percent");

  const oldWarn = console.warn;
  console.warn = function () {};
  try {
    const legacy = normalizeFngActions([{ sessionDealId: deal.session_deal_id, action: "BUY", confidence: 3 }], [deal]);
    assertClose(legacy[0].probability, 0.74, EPSILON, "legacy confidence maps to probability");
    assertClose(legacy[0].stake, 115, EPSILON, "legacy confidence maps to stake");
    assert(legacy[0].legacy === true, "legacy payload is marked");
  } finally {
    console.warn = oldWarn;
  }
}

function attributionFixture(overrides) {
  return Object.assign({
    accountName: "Acme",
    actualOutcome: true,
    baselineProbability: 0.55,
    marketProbability: 0.7,
    fngProbability: 0.9,
    brier: { ml: 0.2025, market: 0.09, fng: 0.01 }
  }, overrides || {});
}

function testAttributionAndHeadline() {
  assert(buildAttribution(attributionFixture()) === "You added information on Acme: your 90% beat the market's 70% - outcome True.", "You-best attribution matches template");
  assert(buildAttribution(attributionFixture({
    marketProbability: 0.9,
    fngProbability: 0.82,
    brier: { ml: 0.16, market: 0.01, fng: 0.0324 }
  })) === "The market got Acme right (90%); you were close (82%).", "Market-best attribution matches template");
  assert(buildAttribution(attributionFixture({
    baselineProbability: 0.9,
    marketProbability: 0.65,
    fngProbability: 0.6,
    brier: { ml: 0.01, market: 0.1225, fng: 0.16 }
  })) === "ML was sharper on Acme: 90% vs. your 60%. Worth understanding what it saw.", "ML-best attribution matches template");
  assert(buildAttribution(attributionFixture({
    actualOutcome: false,
    baselineProbability: 0.49,
    marketProbability: 0.5,
    fngProbability: 0.51,
    brier: { ml: 0.2401, market: 0.25, fng: 0.2601 }
  })) === "Acme was a coin-flip; nobody's edge was clear (False).", "Tie attribution matches template");
  assert(buildHeadline({ ml: 0.18, market: 0.15, fng: 0.2 }) === "Best calibration this run: Market. Market Brier 0.150 - beat ML by 0.030.", "Headline picks correct winner");
  assert(buildHeadline({ ml: 0.1231, market: 0.1232, fng: 0.1233 }) === "Three-way tie within a hair: 0.123 across the board.", "Headline tie matches template");
}

(async function run() {
  testLmsrMath();
  testQuoteTrade();
  await testSettlementPayouts();
  await testOutcomeSealing();
  testExplicitProbabilityStakeActions();
  testAttributionAndHeadline();
  console.log("OK 6/6");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
