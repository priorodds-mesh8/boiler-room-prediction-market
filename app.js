(function () {
  "use strict";

  var STORAGE_KEY = "boiler-room-agent-sim-state-v1";
  var ONBOARDING_KEY = "br-onboarded-v1";
  var CURRENT_USER_ID = "u01";
  var app = document.getElementById("app");

  var marketTypes = [
    ["CLOSE_WON_BY_DATE", "Close-won by date"],
    ["CLOSE_THIS_QUARTER", "Close this quarter"],
    ["CLOSE_ABOVE_AMOUNT", "Close above amount"],
    ["SLIP_TO_NEXT_QUARTER", "Slip to next quarter"],
    ["LEGAL_APPROVAL_BY_DATE", "Legal approval by date"],
    ["SECURITY_REVIEW_COMPLETED", "Security review completed"],
    ["RENEWAL_EXPANDS_BY_PERCENT", "Renewal expands by percent"]
  ];

  var ui = {
    view: "simulation",
    selectedMarketId: null,
    tradeSide: "YES",
    tradeAmount: 120,
    filters: {
      search: "",
      quarter: "All",
      region: "All",
      segment: "All",
      owner: "All",
      stage: "All",
      forecastCategory: "All",
      marketType: "All"
    },
    admin: {
      opportunityId: "",
      template: "CLOSE_WON_BY_DATE",
      access: "Account team plus leadership",
      targetDate: "2026-06-30",
      threshold: "500000",
      resolutionRule: ""
    },
    sim: {
      selectedDealId: "",
      humanSide: "YES",
      humanAmount: 120,
      llmMode: false,
      loadingSupabase: false
    },
    game: {
      mode: "team",
      dealCount: 3,
      maxDays: 30,
      loading: false,
      pendingActions: {},
      error: "",
      advancedSetup: false,
      autoStartAttempted: false,
      ignoreAdvancedQuery: false
    },
    onboardingStep: 0,
    showOnboarding: false,
    toast: ""
  };

  var simulationTimer = null;
  var simulationBusy = false;
  var state = loadState();
  ensureStateShape();
  ui.showOnboarding = shouldShowOnboarding();
  if (!ui.selectedMarketId && state.markets.length) {
    ui.selectedMarketId = state.markets[0].id;
  }
  if (!ui.admin.opportunityId && state.opportunities.length) {
    ui.admin.opportunityId = state.opportunities[0].id;
  }
  if (!ui.sim.selectedDealId && state.simulation.deals.length) {
    ui.sim.selectedDealId = state.simulation.deals[0].id;
  }
  if (state.simulation.deals.length && !activeSimDeals(state.simulation).some(function (deal) { return deal.id === ui.sim.selectedDealId; })) {
    ui.sim.selectedDealId = activeSimDeals(state.simulation)[0].id;
  }

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (error) {
      console.warn("Local storage unavailable, using in-memory state.", error);
    }
    return seedState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Unable to persist demo state.", error);
    }
  }

  function ensureStateShape() {
    if (!state.simulation || !state.simulation.deals || !state.simulation.agents) {
      state.simulation = seedSimulation(5);
    }
    if (!state.simulation.playerWallet && state.simulation.playerWallet !== 0) state.simulation.playerWallet = 1600;
    if (!state.simulation.playerPositions) state.simulation.playerPositions = {};
    if (!state.simulation.hiddenOutcomes) state.simulation.hiddenOutcomes = {};
    if (!state.simulation.events) state.simulation.events = [];
    if (!state.simulation.status) state.simulation.status = "Ready";
    if (!state.simulation.activeDealCount) state.simulation.activeDealCount = 5;
    if (!state.simulation.source) state.simulation.source = "local";
    state.simulation.maxTicks = simTicksForCount(state.simulation.activeDealCount);
    if (!state.game) state.game = { session: null };
    if (![5, 15, 30].includes(Number(ui.game.maxDays))) ui.game.maxDays = 30;
  }

  function seedState() {
    var random = mulberry32(9132026);
    var users = seedUsers();
    var owners = users.filter(function (user) {
      return user.role === "AE" || user.role === "Sales Manager";
    });
    var accounts = [
      "Acme Corp",
      "Northstar Health",
      "HelioGrid Energy",
      "Atlas Logistics",
      "BluePeak Bank",
      "Quantum Foods",
      "Mercury Retail",
      "Cobalt Robotics",
      "Evergreen Insurance",
      "Pioneer Telecom",
      "Summit BioSystems",
      "Harbor Manufacturing",
      "Clearwater University",
      "Nexus Airlines",
      "Brightpath Software",
      "Union Square Media",
      "Redwood Pharma",
      "Nimbus Cloud",
      "Monarch Utilities",
      "Vector Automotive",
      "TrueNorth Devices",
      "Keystone Capital",
      "Apex Industrial",
      "Crescent Hotels",
      "Sterling Public Sector",
      "Lattice Semiconductor",
      "Meridian Grocery",
      "Waypoint Health",
      "Canyon Payments",
      "Nova Education",
      "Foundry Works",
      "Mainline Freight",
      "Argent Labs",
      "Pulse Diagnostics",
      "Orion Mining",
      "Metroline Transit",
      "Beacon Legal",
      "Prairie Mutual",
      "Frontier Fitness",
      "Strata Security",
      "Oakbridge Systems",
      "Signal Sciences",
      "Cedar Foods",
      "Delta Dental Group",
      "Vista Energy",
      "Forge Financial",
      "Juniper Retail",
      "Catalyst Bio"
    ];
    var regions = ["East", "Central", "West", "EMEA"];
    var segments = ["Strategic", "Enterprise", "Commercial", "Public Sector"];
    var stages = ["Discovery", "Qualified", "Technical Validation", "Business Case", "Negotiation", "Procurement"];
    var products = ["Revenue Intelligence", "Data Cloud", "Workflow Automation", "Security Suite", "Enterprise Platform"];
    var forecastCategories = ["Pipeline", "Best Case", "Commit", "Omitted"];
    var legalStatuses = ["Not started", "Redlines pending", "In review", "Approved", "Blocked"];
    var securityStatuses = ["Not required", "Questionnaire sent", "Review scheduled", "Passed", "Blocked"];
    var procurementStatuses = ["Not started", "Vendor setup", "PO requested", "Approved", "Blocked"];
    var competitors = ["Clari", "Salesforce", "Anaplan", "Spreadsheet process", "In-house build", "No decision"];
    var nextSteps = [
      "Executive sponsor call scheduled",
      "Security questionnaire awaiting buyer response",
      "Mutual action plan due this week",
      "Procurement needs vendor packet",
      "Champion is collecting department sign-off",
      "Technical validation workshop booked",
      "Discount approval routed to finance",
      "Legal redlines expected from customer counsel",
      "Implementation scope under review",
      "Economic buyer requested revised ROI model"
    ];
    var decisionCriteria = [
      "Forecast accuracy, admin effort, implementation risk",
      "Security posture, executive reporting, time to value",
      "Integration coverage, price, seller adoption",
      "Migration effort, support model, finance approval",
      "Global permissions, audit trail, compliance fit"
    ];
    var commentsByRole = {
      AE: [
        "Champion says the business case is intact, but procurement has not given timing.",
        "Customer asked for updated implementation milestones after the latest workshop.",
        "Economic buyer is engaged, though final budget approval has moved to finance."
      ],
      "Solution Engineer": [
        "Technical fit is strong, but SSO and data retention questions are still open.",
        "The pilot sponsor liked the workflow, but integration scope widened this week.",
        "Security review has two outstanding items with no named owner yet."
      ],
      Legal: [
        "Customer paper includes liability language that usually takes a second pass.",
        "Redlines are not unusual, but the data processing addendum is unresolved.",
        "The contract can move quickly if procurement accepts standard order terms."
      ],
      Finance: [
        "Discount request is inside policy, but multi-year payment terms are not approved.",
        "Budget source appears confirmed for this quarter.",
        "The finance team has not received the final order form yet."
      ],
      "Customer Success": [
        "Expansion use case depends on a clean handoff plan.",
        "The buyer asked detailed questions about adoption support.",
        "Existing executive sponsor remains positive."
      ]
    };

    var markets = [];
    for (var i = 0; i < 44; i += 1) {
      var account = accounts[i % accounts.length];
      var owner = pick(owners, random);
      var stage = pick(stages, random);
      var amount = roundTo(120000 + random() * 1680000, 5000);
      var closeDate = addDays("2026-05-08", 12 + Math.floor(random() * 116));
      var quarter = dateToQuarter(closeDate);
      var forecastCategory = pick(forecastCategories, random);
      var region = pick(regions, random);
      var segment = pick(segments, random);
      var product = pick(products, random);
      var template = marketTypes[i % marketTypes.length][0];
      var legalStatus = pick(legalStatuses, random);
      var securityStatus = pick(securityStatuses, random);
      var procurementStatus = pick(procurementStatuses, random);
      var stageBase = stageProbability(stage);
      var repProbability = clamp(stageBase + (random() - 0.4) * 0.24, 0.08, 0.93);
      var crmProbability = clamp(stageBase + (random() - 0.5) * 0.16, 0.06, 0.9);
      var riskDrag = 0;
      if (legalStatus === "Blocked" || securityStatus === "Blocked" || procurementStatus === "Blocked") riskDrag += 0.18;
      if (legalStatus === "Redlines pending" || securityStatus === "Questionnaire sent") riskDrag += 0.08;
      if (forecastCategory === "Commit" && stage !== "Negotiation" && stage !== "Procurement") riskDrag += 0.07;
      var marketProbability = clamp(crmProbability + (random() - 0.55) * 0.28 - riskDrag, 0.04, 0.94);
      if (template === "SLIP_TO_NEXT_QUARTER") {
        marketProbability = clamp(0.82 - marketProbability + random() * 0.12, 0.08, 0.88);
      }
      if (template === "LEGAL_APPROVAL_BY_DATE") {
        marketProbability = clamp(legalStatus === "Approved" ? 0.83 : 0.48 + random() * 0.28 - riskDrag, 0.08, 0.9);
      }
      if (template === "SECURITY_REVIEW_COMPLETED") {
        marketProbability = clamp(securityStatus === "Passed" ? 0.86 : 0.5 + random() * 0.24 - riskDrag, 0.08, 0.9);
      }
      var history = makeHistory(marketProbability, random, 31);
      var b = 480 + Math.floor(random() * 240);
      var q = qFromProbability(marketProbability, b);
      var traders = makeTrades(users, random, marketProbability, i);
      var comments = makeComments(users, commentsByRole, random, i);
      var outcomeStatus = i < 5 ? pick(["Resolved won", "Resolved lost", "Resolved slipped"], random) : "Active";
      var market = {
        id: "m" + pad(i + 1, 3),
        opportunityId: "opp" + pad(i + 1, 3),
        account: account,
        question: makeQuestion(template, account, closeDate, amount),
        title: makeShortTitle(template, account),
        type: template,
        amount: amount,
        closeDate: closeDate,
        originalCloseDate: closeDate,
        quarter: quarter,
        owner: owner.name,
        ownerId: owner.id,
        region: region,
        segment: segment,
        productLine: product,
        stage: stage,
        forecastCategory: forecastCategory,
        nextStep: pick(nextSteps, random),
        championStrength: pick(["Weak", "Developing", "Strong", "Executive"], random),
        economicBuyerIdentified: random() > 0.28,
        decisionCriteria: pick(decisionCriteria, random),
        legalStatus: legalStatus,
        securityStatus: securityStatus,
        procurementStatus: procurementStatus,
        competitor: pick(competitors, random),
        lastActivityDate: addDays("2026-05-08", -1 * Math.floor(random() * 24)),
        buyerStakeholders: makeStakeholders(random),
        repProbability: repProbability,
        crmProbability: crmProbability,
        marketProbability: marketProbability,
        probabilityHistory: history,
        qYes: q.yes,
        qNo: q.no,
        liquidity: b,
        volume: traders.reduce(function (sum, trade) { return sum + trade.credits; }, 0),
        trades: traders,
        comments: comments,
        outcomeStatus: outcomeStatus,
        access: pick(["Account team", "Revenue org", "Account team plus leadership"], random),
        resolutionRule: defaultResolutionRule(template, closeDate, amount),
        alerts: makeAlerts(template, marketProbability, repProbability, legalStatus, securityStatus, procurementStatus)
      };
      market.participants = unique(traders.map(function (trade) { return trade.userId; })).length;
      markets.push(market);
    }

    var opportunities = [];
    for (var j = 0; j < 16; j += 1) {
      var oppAccount = accounts[(j + 44) % accounts.length];
      var oppAmount = roundTo(150000 + random() * 1250000, 5000);
      opportunities.push({
        id: "newopp" + pad(j + 1, 3),
        account: oppAccount,
        amount: oppAmount,
        closeDate: addDays("2026-05-08", 18 + Math.floor(random() * 100)),
        stage: pick(stages, random),
        forecastCategory: pick(forecastCategories, random),
        owner: pick(owners, random).name,
        region: pick(regions, random),
        segment: pick(segments, random),
        productLine: pick(products, random)
      });
    }

    return {
      users: users,
      markets: markets,
      opportunities: opportunities,
      simulation: seedSimulation(5),
      wallet: 5000,
      positions: {},
      createdAt: new Date().toISOString()
    };
  }

  function seedSimulation(activeDealCount) {
    var random = mulberry32(45262026);
    var selectedCount = activeDealCount || 5;
    var agents = seedSimulationAgents();
    var accounts = [
      "VantaWorks",
      "Aster Health",
      "Northline Freight",
      "CopperBank",
      "Zenith Robotics",
      "Blue River Energy",
      "Kairo Retail",
      "Summit Claims",
      "Orbital Foods",
      "Helix Public Sector",
      "Granite Manufacturing",
      "Tempo Airlines",
      "Iris Diagnostics",
      "Brightlane Software",
      "Forge Payments",
      "Civic Transit",
      "Alta Education",
      "CarbonGrid",
      "Pinnacle Devices",
      "Redwood Capital"
    ];
    var stages = ["Qualified", "Technical Validation", "Business Case", "Negotiation", "Procurement"];
    var segments = ["Strategic", "Enterprise", "Commercial", "Public Sector"];
    var regions = ["East", "Central", "West", "EMEA"];
    var products = ["Revenue Intelligence", "Workflow Automation", "Data Cloud", "Security Suite"];
    var deals = [];
    var hiddenOutcomes = {};

    for (var i = 0; i < 20; i += 1) {
      var stage = pick(stages, random);
      var amount = roundTo(180000 + random() * 1800000, 10000);
      var closeDate = addDays("2026-05-09", 15 + Math.floor(random() * 84));
      var baseline = clamp(stageProbability(stage) + (random() - 0.5) * 0.12 - (amount > 1200000 ? 0.04 : 0), 0.12, 0.86);
      var worldDrivers = makeWorldDrivers(random);
      var latentProbability = clamp(baseline + sum(worldDrivers, function (driver) { return driver.impact; }) + (random() - 0.5) * 0.08, 0.04, 0.96);
      var hiddenOutcome = random() < latentProbability ? 1 : 0;
      var q = qFromProbability(baseline, 520);
      var deal = {
        id: "sim" + pad(i + 1, 3),
        account: accounts[i],
        question: "Will " + accounts[i] + " close-won by " + formatShortDate(closeDate) + "?",
        amount: amount,
        stage: stage,
        segment: pick(segments, random),
        region: pick(regions, random),
        productLine: pick(products, random),
        closeDate: closeDate,
        baselineProbability: baseline,
        marketProbability: baseline,
        qYes: q.yes,
        qNo: q.no,
        liquidity: 520,
        volume: 0,
        participants: 0,
        publicNews: [],
        trades: [],
        history: [{ tick: 0, probability: baseline }],
        privateSignals: {},
        revealedOutcome: null
      };
      hiddenOutcomes[deal.id] = {
        outcome: hiddenOutcome,
        latentProbability: latentProbability,
        drivers: worldDrivers
      };
      deals.push(deal);
    }

    assignSimulationSignals(deals, agents, hiddenOutcomes, random);

    return {
      status: "Ready",
      tick: 0,
      activeDealCount: selectedCount,
      maxTicks: simTicksForCount(selectedCount),
      source: "local",
      running: false,
      settled: false,
      showOutcomes: false,
      playerWallet: 1600,
      playerPositions: {},
      agents: agents,
      deals: deals,
      hiddenOutcomes: hiddenOutcomes,
      events: [{
        tick: 0,
        kind: "system",
        title: "Session ready",
        body: "Twenty held-out synthetic deals loaded. Outcomes are sealed until settlement.",
        tone: "blue"
      }],
      vpBroadcast: null
    };
  }

  function simTicksForCount(count) {
    if (count <= 1) return 16;
    if (count <= 3) return 24;
    if (count <= 5) return 32;
    return 42;
  }

  function seedSimulationAgents() {
    return [
      simAgent("ae1", "Nadia Price", "AE", "Strategic closer", "Owns a few big late-stage deals; decisive, optimistic, hates stale procurement.", 0.82, 0.11, 0.22, "#22c55e"),
      simAgent("ae2", "Leo Grant", "AE", "Skeptical enterprise rep", "Knows the ugly details on his accounts; trades hard when timelines smell fake.", 0.86, 0.16, 0.18, "#f97316"),
      simAgent("ae3", "Talia Stone", "AE", "Relationship mapper", "Reads champion strength and executive access better than the CRM does.", 0.8, 0.13, 0.24, "#38bdf8"),
      simAgent("bdr1", "Casey Vale", "BDR", "Signal scout", "Knows a little about every account from emails, calls, intent spikes, and silence.", 0.58, 0.2, 0.34, "#a78bfa"),
      simAgent("se1", "Quinn Okafor", "SE", "Technical truth-teller", "Sees integration, security, and validation risk across many deals.", 0.78, 0.08, 0.16, "#14b8a6"),
      simAgent("vp1", "Victoria Sloan", "VP Sales", "Forecast gravity", "Sees the whole board and can influence other agents when she trades.", 0.68, 0.12, 0.4, "#facc15")
    ];
  }

  function simAgent(id, name, role, specialty, personality, skill, irrationality, influenceSusceptibility, color) {
    return {
      id: id,
      name: name,
      role: role,
      specialty: specialty,
      personality: personality,
      skill: skill,
      irrationality: irrationality,
      influenceSusceptibility: influenceSusceptibility,
      color: color,
      wallet: 2600,
      pnl: 0,
      positions: {},
      trades: 0
    };
  }

  function makeWorldDrivers(random) {
    var catalog = [
      ["Champion has real authority", 0.12],
      ["Champion is enthusiastic but junior", 0.02],
      ["Economic buyer is avoiding the team", -0.14],
      ["Budget is already reserved", 0.13],
      ["Procurement has not opened vendor setup", -0.16],
      ["Security review has a hard blocker", -0.18],
      ["Technical validation is cleaner than expected", 0.11],
      ["Incumbent vendor is discounting aggressively", -0.1],
      ["Executive sponsor wants this signed this quarter", 0.15],
      ["Legal redlines include liability pushback", -0.09],
      ["Compelling event is real", 0.1],
      ["Close date was set by the rep, not the buyer", -0.12]
    ];
    var count = 3 + Math.floor(random() * 3);
    var drivers = [];
    while (drivers.length < count) {
      var picked = pick(catalog, random);
      if (!drivers.some(function (driver) { return driver.label === picked[0]; })) {
        drivers.push({ label: picked[0], impact: picked[1] });
      }
    }
    return drivers;
  }

  function assignSimulationSignals(deals, agents, hiddenOutcomes, random) {
    var aeDeals = {
      ae1: deals.slice(0, 7).map(function (deal) { return deal.id; }),
      ae2: deals.slice(6, 14).map(function (deal) { return deal.id; }),
      ae3: deals.slice(13, 20).concat(deals.slice(0, 2)).map(function (deal) { return deal.id; })
    };
    deals.forEach(function (deal, index) {
      agents.forEach(function (agent) {
        var depth = "none";
        if (agent.id.indexOf("ae") === 0 && aeDeals[agent.id].indexOf(deal.id) >= 0) depth = "deep";
        if (agent.id === "bdr1") depth = "shallow";
        if (agent.id === "se1" && (index % 2 === 0 || deal.stage === "Technical Validation" || deal.productLine === "Security Suite")) depth = "technical";
        if (agent.id === "vp1") depth = "portfolio";
        if (depth !== "none") {
          deal.privateSignals[agent.id] = makePrivateSignals(agent, deal, hiddenOutcomes[deal.id].drivers, depth, random);
        }
      });
    });
  }

  function makePrivateSignals(agent, deal, drivers, depth, random) {
    var countMap = { deep: 4, technical: 3, portfolio: 2, shallow: 2 };
    var count = countMap[depth] || 1;
    var signals = [];
    var shuffled = drivers.slice().sort(function () { return random() - 0.5; });
    for (var i = 0; i < count && i < shuffled.length; i += 1) {
      var driver = shuffled[i];
      var noise = (random() - 0.5) * (depth === "shallow" ? 0.12 : 0.06);
      var observedImpact = clamp(driver.impact * agent.skill + noise, -0.22, 0.22);
      signals.push({
        text: signalText(agent, driver.label, deal, depth),
        impact: observedImpact,
        confidence: clamp(agent.skill + (random() - 0.5) * 0.18, 0.35, 0.95),
        shared: random() > 0.55
      });
    }
    return signals;
  }

  function signalText(agent, label, deal, depth) {
    if (agent.id === "bdr1") return "BDR signal: " + label.toLowerCase() + " on " + deal.account + ".";
    if (agent.id === "se1") return "Technical read: " + label.toLowerCase() + ".";
    if (agent.id === "vp1") return "Portfolio read: " + label.toLowerCase() + ".";
    if (depth === "deep") return "Account detail: " + label.toLowerCase() + ".";
    return label + ".";
  }

  function seedUsers() {
    return [
      user("u01", "Maya Chen", "AE", "Strategic cloud deals", 0.146, 1240, 36, 24, "77%"),
      user("u02", "Ethan Brooks", "Solution Engineer", "Security reviews", 0.121, 940, 31, 22, "81%"),
      user("u03", "Priya Raman", "Legal", "Redlines and DPAs", 0.134, 610, 22, 16, "79%"),
      user("u04", "Noah Patel", "Sales Manager", "Enterprise forecast", 0.158, 720, 45, 31, "73%"),
      user("u05", "Elena Garcia", "Finance", "Discount and payment risk", 0.117, 1325, 27, 21, "84%"),
      user("u06", "Jordan Kim", "Customer Success", "Expansion readiness", 0.177, 380, 18, 13, "69%"),
      user("u07", "Ava Robinson", "AE", "Healthcare accounts", 0.141, 860, 33, 23, "76%"),
      user("u08", "Samir Haddad", "Solution Engineer", "Data integrations", 0.126, 760, 26, 19, "82%"),
      user("u09", "Grace Lin", "RevOps", "Forecast hygiene", 0.132, 690, 28, 20, "80%"),
      user("u10", "Marcus Reed", "Executive Sponsor", "Public sector", 0.164, 240, 12, 8, "71%"),
      user("u11", "Talia Stone", "AE", "Manufacturing accounts", 0.153, 530, 24, 17, "74%"),
      user("u12", "Owen Young", "Sales Manager", "Commercial forecast", 0.169, 410, 20, 14, "70%")
    ];
  }

  function user(id, name, role, specialty, brier, pnl, trades, markets, accuracy) {
    return { id: id, name: name, role: role, specialty: specialty, brier: brier, pnl: pnl, trades: trades, markets: markets, accuracy: accuracy };
  }

  function mulberry32(seed) {
    return function () {
      var t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function pick(list, random) {
    return list[Math.floor(random() * list.length)];
  }

  function pad(value, width) {
    var text = String(value);
    while (text.length < width) text = "0" + text;
    return text;
  }

  function roundTo(value, step) {
    return Math.round(value / step) * step;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function addDays(dateString, days) {
    var date = new Date(dateString + "T12:00:00");
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function dateToQuarter(dateString) {
    var date = new Date(dateString + "T12:00:00");
    var quarter = Math.floor(date.getMonth() / 3) + 1;
    return "Q" + quarter + " " + date.getFullYear();
  }

  function stageProbability(stage) {
    var map = {
      Discovery: 0.18,
      Qualified: 0.31,
      "Technical Validation": 0.48,
      "Business Case": 0.58,
      Negotiation: 0.72,
      Procurement: 0.81
    };
    return map[stage] || 0.4;
  }

  function makeHistory(finalProbability, random, points) {
    var history = [];
    var start = clamp(finalProbability + (random() - 0.5) * 0.28, 0.06, 0.92);
    for (var i = 0; i < points; i += 1) {
      var t = i / (points - 1);
      var wave = Math.sin(t * Math.PI * 2) * 0.025;
      var noise = (random() - 0.5) * 0.035;
      var probability = clamp(start * (1 - t) + finalProbability * t + wave + noise, 0.03, 0.97);
      history.push({
        date: addDays("2026-05-08", -1 * (points - 1 - i)),
        probability: probability
      });
    }
    history[history.length - 1].probability = finalProbability;
    return history;
  }

  function qFromProbability(probability, b) {
    var p = clamp(probability, 0.02, 0.98);
    var logit = Math.log(p / (1 - p));
    return {
      yes: (logit * b) / 2,
      no: (-logit * b) / 2
    };
  }

  function makeTrades(users, random, probability, index) {
    var count = 4 + Math.floor(random() * 5);
    var trades = [];
    for (var i = 0; i < count; i += 1) {
      var trader = pick(users, random);
      var side = random() < probability ? "YES" : "NO";
      trades.push({
        id: "t" + index + "-" + i,
        userId: trader.id,
        user: trader.name,
        role: trader.role,
        side: side,
        credits: roundTo(40 + random() * 280, 10),
        price: clamp(probability + (random() - 0.5) * 0.12, 0.03, 0.97),
        time: addDays("2026-05-08", -1 * Math.floor(random() * 6)) + " " + pad(8 + Math.floor(random() * 10), 2) + ":" + pad(Math.floor(random() * 60), 2)
      });
    }
    return trades;
  }

  function makeComments(users, commentsByRole, random, index) {
    var comments = [];
    var roles = Object.keys(commentsByRole);
    for (var i = 0; i < 4; i += 1) {
      var role = pick(roles, random);
      var eligible = users.filter(function (user) { return user.role === role; });
      var commenter = eligible.length ? pick(eligible, random) : pick(users, random);
      comments.push({
        id: "c" + index + "-" + i,
        user: commenter.name,
        role: commenter.role,
        body: pick(commentsByRole[role], random),
        time: addDays("2026-05-08", -1 * i) + " " + pad(9 + i, 2) + ":15"
      });
    }
    return comments;
  }

  function makeStakeholders(random) {
    var titles = ["CRO", "VP Sales Ops", "CFO", "Security Lead", "Procurement Manager", "Revenue Enablement Lead"];
    var count = 3 + Math.floor(random() * 3);
    var people = [];
    for (var i = 0; i < count; i += 1) {
      people.push(pick(titles, random));
    }
    return unique(people);
  }

  function makeQuestion(type, account, closeDate, amount) {
    var date = formatShortDate(closeDate);
    if (type === "CLOSE_WON_BY_DATE") return "Will " + account + " close-won by " + date + "?";
    if (type === "CLOSE_THIS_QUARTER") return "Will " + account + " close this quarter?";
    if (type === "CLOSE_ABOVE_AMOUNT") return "Will " + account + " close above " + formatCurrency(amount * 0.92) + " ARR?";
    if (type === "SLIP_TO_NEXT_QUARTER") return "Will " + account + " slip to next quarter?";
    if (type === "LEGAL_APPROVAL_BY_DATE") return "Will Legal approve " + account + " by " + date + "?";
    if (type === "SECURITY_REVIEW_COMPLETED") return "Will " + account + " complete security review by " + date + "?";
    return "Will " + account + " renewal expand by more than 20%?";
  }

  function makeShortTitle(type, account) {
    if (type === "CLOSE_WON_BY_DATE") return account + " close-won";
    if (type === "CLOSE_THIS_QUARTER") return account + " in-quarter close";
    if (type === "CLOSE_ABOVE_AMOUNT") return account + " amount threshold";
    if (type === "SLIP_TO_NEXT_QUARTER") return account + " slip risk";
    if (type === "LEGAL_APPROVAL_BY_DATE") return account + " legal approval";
    if (type === "SECURITY_REVIEW_COMPLETED") return account + " security review";
    return account + " renewal expansion";
  }

  function defaultResolutionRule(type, closeDate, amount) {
    if (type === "CLOSE_WON_BY_DATE") return "Resolves YES if Salesforce Opportunity.IsWon is true and the original CloseDate is on or before " + formatShortDate(closeDate) + ".";
    if (type === "CLOSE_THIS_QUARTER") return "Resolves YES if the opportunity is closed-won before the current fiscal quarter ends.";
    if (type === "CLOSE_ABOVE_AMOUNT") return "Resolves YES if closed-won ARR is greater than or equal to " + formatCurrency(amount * 0.92) + ".";
    if (type === "SLIP_TO_NEXT_QUARTER") return "Resolves YES if CloseDate moves past the current quarter or the deal remains open at quarter end.";
    if (type === "LEGAL_APPROVAL_BY_DATE") return "Resolves YES when Legal status is Approved by the target date.";
    if (type === "SECURITY_REVIEW_COMPLETED") return "Resolves YES when security review is marked Passed by the target date.";
    return "Resolves YES if renewal closes with ARR expansion greater than 20%.";
  }

  function makeAlerts(type, marketProbability, repProbability, legalStatus, securityStatus, procurementStatus) {
    var alerts = [];
    var delta = repProbability - marketProbability;
    if (delta > 0.2) {
      alerts.push({ tone: "risk", title: "Market below rep forecast", body: "Collective probability is " + formatPercent(delta) + " below the rep view." });
    }
    if (legalStatus === "Blocked" || securityStatus === "Blocked" || procurementStatus === "Blocked") {
      alerts.push({ tone: "risk", title: "Blocked milestone", body: "One approval lane is blocked and should be reviewed before the next forecast call." });
    }
    if (type === "SLIP_TO_NEXT_QUARTER" && marketProbability > 0.55) {
      alerts.push({ tone: "risk", title: "Slip risk increasing", body: "The market is pricing a better than even chance that this deal moves out." });
    }
    if (marketProbability > repProbability + 0.15) {
      alerts.push({ tone: "positive", title: "Upside signal", body: "Market participants are more confident than the official forecast." });
    }
    if (!alerts.length) {
      alerts.push({ tone: "", title: "No material divergence", body: "Market, CRM, and rep forecast are broadly aligned." });
    }
    return alerts;
  }

  function unique(list) {
    return list.filter(function (item, index) {
      return list.indexOf(item) === index;
    });
  }

  function render() {
    app.innerHTML = [
      '<div class="app-shell">',
      '<main class="main">',
      renderTopbar(),
      '<section class="content">',
      renderView(),
      '</section>',
      '</main>',
      '</div>',
      ui.showOnboarding ? renderOnboardingOverlay() : '',
      ui.toast ? '<div class="toast">' + escapeHtml(ui.toast) + '</div>' : ''
    ].join("");
    maybeAutoStartGame();
    maybeRenderDebriefChart();
  }

  function renderSidebar(currentUser) {
    return [
      '<aside class="sidebar">',
      '<div class="brand">',
      '<div class="brand-mark">B</div>',
      '<div><div class="brand-title">Boiler Room</div><div class="brand-subtitle">Forecast Intelligence</div></div>',
      '</div>',
      '<nav class="nav">',
      navButton("simulation", "Practice Run", "#f43f5e"),
      '</nav>',
      '<div class="side-panel">',
      '<div class="side-label">Signed in as</div>',
      '<div class="row-title" style="color:#fff;margin-top:5px">' + escapeHtml(currentUser.name) + '</div>',
      '<div class="small-muted">' + escapeHtml(currentUser.role) + ' | ' + escapeHtml(currentUser.specialty) + '</div>',
      '<div class="side-label" style="margin-top:14px">Credit balance</div>',
      '<div class="balance">' + formatNumber(state.wallet) + '</div>',
      '<div class="small-muted">Virtual currency for this quarter</div>',
      '</div>',
      '</aside>'
    ].join("");
  }

  function navButton(view, label, color) {
    return '<button class="nav-button ' + (ui.view === view ? "active" : "") + '" data-view="' + view + '"><span class="nav-dot" style="background:' + color + '"></span><span>' + label + '</span></button>';
  }

  function renderTopbar() {
    var advancedButton = isAdvancedSetupRequested() || ui.game.advancedSetup
      ? ''
      : '<button class="secondary-button subtle-button" data-action="game-advanced">Advanced setup</button>';
    return [
      '<header class="topbar">',
      '<div><h1 class="page-title">Boiler Room — Forecast Intelligence</h1><div class="page-kicker">Practice Run</div></div>',
      '<div class="top-actions">' + advancedButton + '<button class="secondary-button subtle-button" data-action="onboarding-replay">Replay tour</button><button class="secondary-button" data-action="reset-demo">Reset demo</button></div>',
      '</header>'
    ].join("");
  }

  function onboardingCards() {
    return [
      {
        icon: "1",
        title: "Three forecasts",
        bodyHtml: "Every deal has three probabilities: the <strong>ML baseline</strong> from a calibrated model, the <strong>market price</strong> from your team's positions, and <strong>your</strong> forecast. They rarely agree. The disagreement is the signal."
      },
      {
        icon: "2",
        title: "Your job",
        bodyHtml: "For each deal each day, set your probability from 0 to 100% and stake an amount. New intel arrives daily. Adjust as you learn."
      },
      {
        icon: "3",
        title: "How to win",
        bodyHtml: "Win condition is <strong>calibration</strong>, not P&amp;L. The forecaster closest to the actual outcomes wins. Better-calibrated managers spot slipping deals earlier."
      }
    ];
  }

  function renderOnboardingOverlay() {
    var cards = onboardingCards();
    var step = clamp(Number(ui.onboardingStep) || 0, 0, cards.length - 1);
    var card = cards[step];
    return [
      '<div class="onboarding-backdrop" role="presentation">',
      '<section class="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">',
      '<button class="onboarding-close" data-action="onboarding-close" aria-label="Close tour">&times;</button>',
      '<div class="onboarding-icon" aria-hidden="true">' + escapeHtml(card.icon) + '</div>',
      '<div class="onboarding-step">Step ' + (step + 1) + ' of ' + cards.length + '</div>',
      '<h2 id="onboarding-title">' + escapeHtml(card.title) + '</h2>',
      '<p>' + card.bodyHtml + '</p>',
      '<div class="onboarding-dots" aria-hidden="true">' + cards.map(function (_, index) {
        return '<span class="' + (index === step ? "active" : "") + '"></span>';
      }).join("") + '</div>',
      '<div class="onboarding-actions">',
      '<button class="secondary-button" data-action="onboarding-prev" ' + (step === 0 ? "disabled" : "") + '>Back</button>',
      '<button class="secondary-button" data-action="onboarding-close">Close</button>',
      '<button class="primary-button" data-action="' + (step === cards.length - 1 ? "onboarding-close" : "onboarding-next") + '">' + (step === cards.length - 1 ? "Start run" : "Next") + '</button>',
      '</div>',
      '</section>',
      '</div>'
    ].join("");
  }

  function shouldShowOnboarding() {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== "true";
    } catch (error) {
      console.warn("Local storage unavailable for onboarding.", error);
      return true;
    }
  }

  function closeOnboarding() {
    ui.showOnboarding = false;
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch (error) {
      console.warn("Unable to persist onboarding state.", error);
    }
    render();
  }

  function replayOnboarding() {
    ui.onboardingStep = 0;
    ui.showOnboarding = true;
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch (error) {
      console.warn("Unable to reset onboarding state.", error);
    }
    render();
  }

  function isAdvancedSetupRequested() {
    return window.location.search.indexOf("advanced") >= 0 && !ui.game.ignoreAdvancedQuery;
  }

  function hasActiveGameSession() {
    var game = state.game && state.game.session;
    return !!(game && game.session && game.session.status === "active");
  }

  function shouldAutoStartGame() {
    return window.location.pathname.replace(/\/index\.html$/, "/") === "/"
      && window.location.search === ""
      && !ui.showOnboarding
      && !ui.game.advancedSetup
      && !ui.game.loading
      && !ui.game.autoStartAttempted
      && !hasActiveGameSession();
  }

  function maybeAutoStartGame() {
    if (!shouldAutoStartGame()) return;
    ui.game.autoStartAttempted = true;
    ui.game.mode = "team";
    ui.game.dealCount = 3;
    ui.game.maxDays = 5;
    window.setTimeout(startGameRun, 0);
  }

  function renderView() {
    return renderSimulation();
  }

  function renderDashboard() {
    var active = activeMarkets();
    var official = sum(active, function (market) { return market.amount * market.repProbability; });
    var market = marketImpliedForecast();
    var pipeline = sum(active, function (m) { return m.amount; });
    var expected = sum(active, function (m) { return m.amount * ((m.marketProbability + m.crmProbability) / 2); });
    var risks = highRiskDeals().slice(0, 7);
    var deltas = active.map(function (m) {
      return { market: m, delta: m.marketProbability - m.repProbability };
    }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    var biggestNegative = deltas.filter(function (d) { return d.delta < 0; })[0];
    var biggestPositive = deltas.filter(function (d) { return d.delta > 0; })[0];

    return [
      '<div class="metrics-grid">',
      metricCard("Official forecast", formatCurrency(official), "Rep weighted pipeline"),
      metricCard("Market forecast", formatCurrency(market), "YES price weighted pipeline"),
      metricCard("Pipeline", formatCurrency(pipeline), active.length + " open opportunities"),
      metricCard("Expected value", formatCurrency(expected), "CRM and market blended"),
      metricCard("Largest risk delta", biggestNegative ? formatSignedPercent(biggestNegative.delta) : "0%", biggestNegative ? biggestNegative.market.account : "No risk delta"),
      metricCard("Largest upside delta", biggestPositive ? formatSignedPercent(biggestPositive.delta) : "0%", biggestPositive ? biggestPositive.market.account : "No upside delta"),
      '</div>',
      '<div class="grid-two">',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Forecast movement</div><div class="panel-subtitle">Market-implied forecast vs. official forecast over the last 30 days</div></div><div class="legend-row"><span class="legend-key"><span class="legend-swatch" style="background:var(--green)"></span>Market</span><span class="legend-key"><span class="legend-swatch" style="background:var(--blue)"></span>Official</span></div></div><div class="panel-body">' + renderForecastChart() + '</div></section>',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Probability by stage</div><div class="panel-subtitle">Average market probability across open markets</div></div></div><div class="panel-body">' + renderStageBars() + '</div></section>',
      '</div>',
      '<section class="table-shell">',
      '<div class="panel-header"><div><div class="panel-title">High-risk forecast deltas</div><div class="panel-subtitle">Deals where market probability is materially below the rep or CRM view</div></div><span class="pill amber">' + risks.length + ' flagged</span></div>',
      risks.length ? renderRiskTable(risks) : '<div class="empty-state">No material risk deltas in the current filter.</div>',
      '</section>'
    ].join("");
  }

  function metricCard(label, value, note) {
    return '<article class="metric-card"><div><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div><div class="metric-note">' + note + '</div></article>';
  }

  function renderForecastChart() {
    var active = activeMarkets().slice(0, 28);
    var points = [];
    for (var i = 0; i < 31; i += 1) {
      var marketForecast = sum(active, function (m) {
        return m.amount * m.probabilityHistory[i].probability;
      });
      var officialForecast = sum(active, function (m) {
        var drift = 1 + Math.sin(i / 6) * 0.015;
        return m.amount * m.repProbability * drift;
      });
      points.push({ date: active[0] ? active[0].probabilityHistory[i].date : "", market: marketForecast, official: officialForecast });
    }
    return renderDualLine(points, "market", "official", formatCurrencyShort);
  }

  function renderDualLine(points, keyA, keyB, formatter) {
    var width = 680;
    var height = 250;
    var padX = 48;
    var padY = 24;
    var values = [];
    points.forEach(function (point) {
      values.push(point[keyA]);
      values.push(point[keyB]);
    });
    var min = Math.min.apply(null, values) * 0.96;
    var max = Math.max.apply(null, values) * 1.04;
    var pathA = svgPath(points, keyA, width, height, padX, padY, min, max);
    var pathB = svgPath(points, keyB, width, height, padX, padY, min, max);
    var y1 = mapY(max, height, padY, min, max);
    var y2 = mapY((min + max) / 2, height, padY, min, max);
    var y3 = mapY(min, height, padY, min, max);
    return [
      '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Forecast movement chart">',
      gridLine(padX, y1, width - 16, y1),
      gridLine(padX, y2, width - 16, y2),
      gridLine(padX, y3, width - 16, y3),
      '<text x="8" y="' + (y1 + 4) + '">' + formatter(max) + '</text>',
      '<text x="8" y="' + (y2 + 4) + '">' + formatter((min + max) / 2) + '</text>',
      '<text x="8" y="' + (y3 + 4) + '">' + formatter(min) + '</text>',
      '<path class="line-official" d="' + pathB + '"></path>',
      '<path class="line-market" d="' + pathA + '"></path>',
      '<text x="' + padX + '" y="' + (height - 3) + '">' + formatShortDate(points[0].date) + '</text>',
      '<text x="' + (width - 104) + '" y="' + (height - 3) + '">' + formatShortDate(points[points.length - 1].date) + '</text>',
      '</svg>'
    ].join("");
  }

  function renderStageBars() {
    var stages = ["Discovery", "Qualified", "Technical Validation", "Business Case", "Negotiation", "Procurement"];
    var rows = stages.map(function (stage) {
      var markets = activeMarkets().filter(function (m) { return m.stage === stage; });
      var avg = markets.length ? sum(markets, function (m) { return m.marketProbability; }) / markets.length : 0;
      return '<div style="display:grid;gap:6px;margin-bottom:14px"><div class="prob-label-row"><span>' + stage + '</span><span>' + formatPercent(avg) + ' | ' + markets.length + '</span></div><div class="prob-bar"><div class="prob-fill" style="width:' + Math.round(avg * 100) + '%"></div></div></div>';
    });
    return rows.join("");
  }

  function renderRiskTable(risks) {
    return [
      '<table class="data-table">',
      '<thead><tr><th>Market</th><th>Owner</th><th>Amount</th><th>Stage</th><th>Rep</th><th>CRM</th><th>Market</th><th>Delta</th><th>Next step</th></tr></thead>',
      '<tbody>',
      risks.map(function (market) {
        var delta = market.marketProbability - Math.max(market.repProbability, market.crmProbability);
        return [
          '<tr class="clickable" data-action="open-market" data-id="' + market.id + '">',
          '<td><div class="deal-title">' + escapeHtml(market.account) + '</div><div class="deal-meta">' + escapeHtml(market.question) + '</div></td>',
          '<td>' + escapeHtml(market.owner) + '</td>',
          '<td>' + formatCurrency(market.amount) + '</td>',
          '<td>' + escapeHtml(market.stage) + '</td>',
          '<td>' + formatPercent(market.repProbability) + '</td>',
          '<td>' + formatPercent(market.crmProbability) + '</td>',
          '<td>' + probStack(market.marketProbability, false) + '</td>',
          '<td class="delta down">' + formatSignedPercent(delta) + '</td>',
          '<td>' + escapeHtml(market.nextStep) + '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table>'
    ].join("");
  }

  function renderMarkets() {
    var markets = filteredMarkets();
    return [
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Market filters</div><div class="panel-subtitle">Synthetic Salesforce opportunities with live market probabilities</div></div><span class="pill blue">' + markets.length + ' shown</span></div><div class="panel-body"><div class="filters">',
      '<input class="input search-field" data-filter="search" placeholder="Search account or market title" value="' + escapeAttr(ui.filters.search) + '" />',
      selectFilter("quarter", ["All"].concat(unique(state.markets.map(function (m) { return m.quarter; })).sort())),
      selectFilter("region", ["All"].concat(unique(state.markets.map(function (m) { return m.region; })).sort())),
      selectFilter("segment", ["All"].concat(unique(state.markets.map(function (m) { return m.segment; })).sort())),
      selectFilter("owner", ["All"].concat(unique(state.markets.map(function (m) { return m.owner; })).sort())),
      selectFilter("stage", ["All"].concat(unique(state.markets.map(function (m) { return m.stage; })).sort())),
      selectFilter("forecastCategory", ["All"].concat(unique(state.markets.map(function (m) { return m.forecastCategory; })).sort())),
      selectFilter("marketType", ["All"].concat(marketTypes.map(function (t) { return t[0]; })), typeLabel),
      '</div></div></section>',
      '<section class="table-shell">',
      '<table class="data-table">',
      '<thead><tr><th>Market</th><th>Amount</th><th>Close</th><th>Owner</th><th>Stage</th><th>Forecast</th><th>Probability</th><th>Volume</th><th>Participants</th><th>Move</th></tr></thead>',
      '<tbody>',
      markets.map(renderMarketRow).join(""),
      '</tbody></table>',
      markets.length ? '' : '<div class="empty-state">No markets match the current filters.</div>',
      '</section>'
    ].join("");
  }

  function selectFilter(name, options, labeler) {
    labeler = labeler || function (value) { return value; };
    return [
      '<select class="select" data-filter="' + name + '">',
      options.map(function (option) {
        return '<option value="' + escapeAttr(option) + '"' + (ui.filters[name] === option ? " selected" : "") + '>' + escapeHtml(labeler(option)) + '</option>';
      }).join(""),
      '</select>'
    ].join("");
  }

  function renderMarketRow(market) {
    var move = recentMove(market);
    return [
      '<tr class="clickable" data-action="open-market" data-id="' + market.id + '">',
      '<td><div class="deal-title">' + escapeHtml(market.title) + '</div><div class="deal-meta">' + escapeHtml(market.account) + ' | ' + escapeHtml(typeLabel(market.type)) + '</div></td>',
      '<td>' + formatCurrency(market.amount) + '</td>',
      '<td>' + formatShortDate(market.closeDate) + '</td>',
      '<td>' + escapeHtml(market.owner) + '</td>',
      '<td>' + escapeHtml(market.stage) + '</td>',
      '<td><span class="pill ' + forecastClass(market.forecastCategory) + '">' + escapeHtml(market.forecastCategory) + '</span></td>',
      '<td>' + probStack(market.marketProbability, market.type === "SLIP_TO_NEXT_QUARTER") + '</td>',
      '<td>' + formatNumber(Math.round(market.volume)) + '</td>',
      '<td>' + market.participants + '</td>',
      '<td class="delta ' + (move >= 0 ? "up" : "down") + '">' + formatSignedPercent(move) + '</td>',
      '</tr>'
    ].join("");
  }

  function renderMarketDetail() {
    var market = getSelectedMarket();
    if (!market) return '<div class="empty-state">Select a market to continue.</div>';
    var yesPrice = market.marketProbability;
    var noPrice = 1 - yesPrice;
    var userPosition = getPosition(market.id);
    var disabled = market.outcomeStatus !== "Active";
    var side = ui.tradeSide;
    var amount = clamp(Number(ui.tradeAmount) || 0, 10, Math.max(10, state.wallet));
    var quote = quoteTrade(market, side, amount);
    return [
      '<button class="back-button" data-view="markets">Back to markets</button>',
      '<section class="detail-hero">',
      '<div class="market-meta-row"><span class="pill blue">' + escapeHtml(typeLabel(market.type)) + '</span><span class="pill ' + statusClass(market.outcomeStatus) + '">' + escapeHtml(market.outcomeStatus) + '</span><span class="small-muted">' + escapeHtml(market.access) + '</span></div>',
      '<h2 class="market-question">' + escapeHtml(market.question) + '</h2>',
      '<div class="price-strip">',
      '<div class="price-tile"><div class="price-label">YES probability</div><div class="price-value yes">' + formatPercent(yesPrice) + '</div><div class="small-muted">Price ' + yesPrice.toFixed(2) + ' credits per share</div></div>',
      '<div class="price-tile"><div class="price-label">NO probability</div><div class="price-value no">' + formatPercent(noPrice) + '</div><div class="small-muted">Price ' + noPrice.toFixed(2) + ' credits per share</div></div>',
      '<div class="price-tile"><div class="price-label">Forecast comparison</div>' + comparisonStack(market) + '</div>',
      '</div>',
      '</section>',
      '<div class="detail-grid">',
      '<div style="display:grid;gap:18px">',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Probability history</div><div class="panel-subtitle">YES and implied NO probability over time</div></div><div class="legend-row"><span class="legend-key"><span class="legend-swatch" style="background:var(--green)"></span>YES</span><span class="legend-key"><span class="legend-swatch" style="background:var(--red)"></span>NO</span></div></div><div class="panel-body">' + renderMarketChart(market) + '</div></section>',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">CRM context</div><div class="panel-subtitle">' + escapeHtml(market.account) + ' opportunity fields and MEDDICC signals</div></div></div><div class="panel-body">' + renderCrmContext(market) + '</div></section>',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Recent forecasts and rationale</div><div class="panel-subtitle">Attributed internal forecasts with context from revenue teams</div></div></div><div class="panel-body split-panel">' + renderRecentTrades(market) + renderComments(market) + '</div></section>',
      '</div>',
      '<aside style="display:grid;gap:18px">',
      '<section class="trade-panel"><div><div class="panel-title">Forecast market</div><div class="panel-subtitle">Virtual credits, LMSR-style price impact</div></div>',
      '<div class="segmented"><button class="segment yes ' + (side === "YES" ? "active" : "") + '" data-action="trade-side" data-side="YES">YES</button><button class="segment no ' + (side === "NO" ? "active" : "") + '" data-action="trade-side" data-side="NO">NO</button></div>',
      '<div class="field"><label for="trade-amount">Credits to spend</label><input id="trade-amount" class="range" type="range" min="10" max="' + Math.max(10, Math.min(900, state.wallet)) + '" step="10" data-input="tradeAmount" value="' + amount + '" /><input class="input" data-input="tradeAmount" type="number" min="10" max="' + state.wallet + '" step="10" value="' + amount + '" /></div>',
      '<div class="trade-summary"><div class="summary-row"><span>Estimated shares</span><strong>' + quote.shares.toFixed(2) + '</strong></div><div class="summary-row"><span>Price after forecast</span><strong>' + formatPercent(quote.nextProbability) + '</strong></div><div class="summary-row"><span>Your YES / NO</span><strong>' + userPosition.yes.toFixed(2) + ' / ' + userPosition.no.toFixed(2) + '</strong></div><div class="summary-row"><span>Balance after</span><strong>' + formatNumber(Math.max(0, state.wallet - amount)) + '</strong></div></div>',
      '<button class="buy-button ' + (side === "YES" ? "yes" : "no") + '" data-action="execute-trade" ' + (disabled || state.wallet < 10 ? "disabled" : "") + '>Forecast ' + side + '</button>',
      '<div class="small-muted">' + escapeHtml(market.resolutionRule) + '</div>',
      '</section>',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Alerts</div><div class="panel-subtitle">Signals for the next forecast review</div></div></div><div class="panel-body">' + renderAlerts(market) + '</div></section>',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Portfolio</div><div class="panel-subtitle">Current user position on this market</div></div></div><div class="panel-body">' + renderPortfolio(market, userPosition) + '</div></section>',
      '</aside>',
      '</div>'
    ].join("");
  }

  function comparisonStack(market) {
    return [
      '<div style="display:grid;gap:8px;margin-top:8px">',
      comparisonRow("Rep", market.repProbability, "blue"),
      comparisonRow("CRM model", market.crmProbability, "teal"),
      comparisonRow("Market", market.marketProbability, "green"),
      '</div>'
    ].join("");
  }

  function comparisonRow(label, probability, color) {
    return '<div class="prob-stack"><div class="prob-label-row"><span>' + label + '</span><span>' + formatPercent(probability) + '</span></div><div class="prob-bar"><div class="prob-fill" style="width:' + Math.round(probability * 100) + '%;background:var(--' + color + ')"></div></div></div>';
  }

  function renderMarketChart(market) {
    var points = market.probabilityHistory.map(function (point) {
      return {
        date: point.date,
        yes: point.probability,
        no: 1 - point.probability
      };
    });
    return renderDualLine(points, "yes", "no", formatPercent);
  }

  function renderCrmContext(market) {
    return [
      '<div class="context-grid">',
      kv("Amount", formatCurrency(market.amount)),
      kv("Stage", market.stage),
      kv("Close date", formatShortDate(market.closeDate)),
      kv("Forecast category", market.forecastCategory),
      kv("Owner", market.owner),
      kv("Region / segment", market.region + " / " + market.segment),
      kv("Product line", market.productLine),
      kv("Last activity", formatShortDate(market.lastActivityDate)),
      kv("Champion strength", market.championStrength),
      kv("Economic buyer", market.economicBuyerIdentified ? "Identified" : "Not confirmed"),
      kv("Decision criteria", market.decisionCriteria),
      kv("Competitor", market.competitor),
      kv("Buyer stakeholders", market.buyerStakeholders.join(", ")),
      kv("Next step", market.nextStep),
      '</div>',
      '<div class="status-grid" style="margin-top:16px">',
      statusBox("Legal", market.legalStatus),
      statusBox("Security", market.securityStatus),
      statusBox("Procurement", market.procurementStatus),
      '</div>'
    ].join("");
  }

  function kv(label, value) {
    return '<div class="kv-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value)) + '</strong></div>';
  }

  function statusBox(label, value) {
    var tone = value === "Blocked" ? "red" : value === "Approved" || value === "Passed" ? "green" : value === "In review" || value === "PO requested" ? "amber" : "blue";
    return '<div class="status-box"><div class="status-label">' + label + '</div><div class="status-value">' + escapeHtml(value) + '</div><div style="margin-top:8px"><span class="pill ' + tone + '">' + statusText(value) + '</span></div></div>';
  }

  function statusText(value) {
    if (value === "Blocked") return "Action needed";
    if (value === "Approved" || value === "Passed") return "Cleared";
    if (value === "Not started" || value === "Not required") return "Low signal";
    return "In motion";
  }

  function renderRecentTrades(market) {
    var trades = market.trades.slice().reverse().slice(0, 8);
    return [
      '<div><div class="row-title" style="margin-bottom:10px">Forecast ledger</div><div class="trade-list">',
      trades.map(function (trade) {
        return '<div class="trade-item"><div class="row-title">' + escapeHtml(trade.user) + ' forecast <span class="' + (trade.side === "YES" ? "delta up" : "delta down") + '">' + trade.side + '</span></div><div class="row-subtitle">' + formatNumber(trade.credits) + ' credits at ' + formatPercent(trade.price) + ' | ' + escapeHtml(trade.role) + ' | ' + escapeHtml(trade.time) + '</div></div>';
      }).join(""),
      '</div></div>'
    ].join("");
  }

  function renderComments(market) {
    return [
      '<div><div class="row-title" style="margin-bottom:10px">Rationale</div><div class="comment-list">',
      market.comments.slice(0, 5).map(function (comment) {
        return '<div class="comment-item"><div class="row-title">' + escapeHtml(comment.user) + ' | ' + escapeHtml(comment.role) + '</div><div class="row-subtitle">' + escapeHtml(comment.body) + '</div></div>';
      }).join(""),
      '</div><div style="display:grid;gap:8px;margin-top:14px"><textarea class="textarea" data-input="comment" placeholder="Add a short rationale note"></textarea><button class="secondary-button" data-action="add-comment">Add rationale</button></div></div>'
    ].join("");
  }

  function renderAlerts(market) {
    return '<div class="alert-list">' + market.alerts.map(function (alert) {
      return '<div class="alert ' + escapeAttr(alert.tone) + '"><div class="alert-title">' + escapeHtml(alert.title) + '</div><div class="alert-body">' + escapeHtml(alert.body) + '</div></div>';
    }).join("") + '</div>';
  }

  function renderPortfolio(market, position) {
    var yesValue = position.yes * market.marketProbability;
    var noValue = position.no * (1 - market.marketProbability);
    var cost = position.cost || 0;
    var mark = yesValue + noValue;
    return [
      '<div style="display:grid;gap:10px">',
      kv("YES shares", position.yes.toFixed(2)),
      kv("NO shares", position.no.toFixed(2)),
      kv("Cost basis", formatNumber(cost)),
      kv("Mark value", formatNumber(mark)),
      kv("Unrealized P&L", formatSignedNumber(mark - cost)),
      '</div>'
    ].join("");
  }

  function renderSimulation() {
    return renderGameWarRoom();
  }

  function renderGameWarRoom() {
    var game = state.game && state.game.session ? state.game.session : null;
    if (isAdvancedSetupRequested() || ui.game.advancedSetup) return renderGameSetup();
    if (!game) return renderGameSetup();
    return renderGameSession(game);
  }

  function renderGameSetup() {
    var modes = [
      { id: "team", title: "Team", tag: "Open table", body: "1-3 deal-team agents act and comment before you respond.", contract: "Visible rationale" },
      { id: "focus", title: "Agent Focus", tag: "Spotlight", body: "One selected deal-team agent frames each daily read.", contract: "Focused signal" },
      { id: "silent", title: "Silent Market", tag: "Fog of war", body: "Agents still move price, but the table keeps most rationale hidden.", contract: "Compressed intel" }
    ];
    var counts = [
      { count: 1, label: "Duel", body: "One deal, maximum inspection.", meta: "Full card" },
      { count: 3, label: "Squad", body: "A clean executive pacing lane.", meta: "Full cards" },
      { count: 5, label: "Bench", body: "Enough spread to compare signals.", meta: "Full cards" },
      { count: 10, label: "Floor", body: "Dense forecast-floor mode.", meta: "Auto dense" }
    ];
    var durations = [
      { days: 5, label: "Sprint", body: "Fast demo loop.", meta: "Quick settle" },
      { days: 15, label: "Cycle", body: "Mid-run signal build.", meta: "Balanced" },
      { days: 30, label: "Quarter", body: "Full campaign arc.", meta: "Default" }
    ];
    var selectedMode = modes.find(function (mode) { return mode.id === ui.game.mode; }) || modes[0];
    return [
      '<section class="war-room-setup">',
      '<div class="war-room-copy"><div class="setup-kicker"><span class="reticle"></span> Boiler Room Practice Run</div><h2 class="sim-title">Boiler Room — Forecast Intelligence</h2><div class="sim-subtitle"><p>Surface deal-slip risk before it surprises leadership.</p><p>Boiler Room turns live deal signals into a sharper forecast of what will actually close. Agents and users evaluate pipeline risk, forecast deal outcomes, and expose disagreement before it surprises leadership. The result is a faster, more honest read on revenue than CRM probability alone.</p><p>Boiler Room works by turning each sales deal into a live forecast: users and agents mark whether they think the deal outcome is underpriced or overpriced. As forecasts and new deal signals come in, the market price becomes a live probability that captures disagreement faster than a static CRM forecast.</p></div><div class="setup-contract"><span>Run setup</span><strong>' + Number(ui.game.dealCount) + ' deal' + (Number(ui.game.dealCount) === 1 ? "" : "s") + ' | ' + escapeHtml(selectedMode.title) + ' | Day 1 / ' + Number(ui.game.maxDays) + '</strong></div></div>',
      '<div class="setup-board">',
      '<div class="setup-group"><div class="setup-label">Gameplay mode</div><div class="mode-grid">',
      modes.map(function (mode) {
        return '<button class="mode-card ' + (ui.game.mode === mode.id ? "active" : "") + '" data-action="game-mode" data-mode="' + mode.id + '"><span class="mode-tag">' + escapeHtml(mode.tag) + '</span><strong>' + escapeHtml(mode.title) + '</strong><span>' + escapeHtml(mode.body) + '</span><em>' + escapeHtml(mode.contract) + '</em></button>';
      }).join(""),
      '</div></div>',
      '<div class="setup-group"><div class="setup-label">Deal count</div><div class="count-card-grid">' + counts.map(function (item) {
        return '<button class="count-card ' + (Number(ui.game.dealCount) === item.count ? "active" : "") + '" data-action="game-count" data-count="' + item.count + '"><span>' + item.count + '</span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.body) + '</small><em>' + escapeHtml(item.meta) + '</em></button>';
      }).join("") + '</div></div>',
      '<div class="setup-group"><div class="setup-label">Run length</div><div class="count-card-grid duration-grid">' + durations.map(function (item) {
        return '<button class="count-card ' + (Number(ui.game.maxDays) === item.days ? "active" : "") + '" data-action="game-days" data-days="' + item.days + '"><span>' + item.days + '</span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.body) + '</small><em>' + escapeHtml(item.meta) + '</em></button>';
      }).join("") + '</div></div>',
      '<div class="setup-footer"><div><span>Your wallet</span><strong>1,500</strong></div><div><span>Win condition</span><strong>Lowest forecast error</strong></div></div>',
      '<button class="primary-button war-start" data-action="game-start" ' + (ui.game.loading ? "disabled" : "") + '>' + (ui.game.loading ? "Assigning run..." : "Start Practice Run") + '</button>',
      ui.game.error ? '<div class="war-error"><span>' + escapeHtml(ui.game.error) + '</span><button class="secondary-button" data-action="game-start">Retry</button></div>' : '',
      '</div>',
      '</section>'
    ].join("");
  }

  function renderGameSession(game) {
    var session = game.session;
    var deals = game.deals || [];
    var turn = game.turn || { cards: [] };
    var results = game.results;
    var allReady = gameActionsReady(deals);
    var isSettled = session.status === "settled";
    var floorMode = Number(session.dealCount || deals.length) === 10;
    return [
      '<section class="war-room">',
      '<div class="run-header">',
      '<div><div class="setup-kicker"><span class="reticle"></span> Boiler Room | ' + escapeHtml(modeLabel(session.mode)) + ' | ' + escapeHtml(game.source || "local") + '</div><h2 class="sim-title">Day ' + session.currentDay + ' / ' + session.maxDays + '</h2><div class="sim-subtitle">' + escapeHtml(turn.summary || "Review the priority stack and make every forecast call.") + '</div></div>',
      '<div class="war-actions"><button class="secondary-button" data-action="game-refresh">Refresh</button><button class="secondary-button" data-action="game-new">New run</button></div>',
      '</div>',
      renderWarHud(session, deals, allReady, floorMode),
      isSettled && results ? renderGameDebrief(game) : renderActiveGameBoard(session, deals, turn, allReady, floorMode),
      '</section>'
    ].join("");
  }

  function renderWarHud(session, deals, allReady, floorMode) {
    var actionText = session.status === "settled" ? "Settled" : readyCount(deals) + " / " + deals.length;
    return [
      '<div class="hud-rail">',
      hudCell("PLAYER", "You", "Probability desk", "player"),
      hudCell("CLOCK", "Day " + session.currentDay + " / " + session.maxDays, floorMode ? "Floor mode" : "Card mode", "clock"),
      hudCell("WALLET", formatNumber(session.fngWallet || 0), "Run capital", "wallet"),
      hudCell("P&L", formatSignedNumber(session.pnl || 0), "Secondary score", Number(session.pnl || 0) >= 0 ? "pnl up" : "pnl down"),
      hudCell("MODE", modeLabel(session.mode), floorMode ? "10-deal density" : "Tactical board", "mode"),
      hudCell("LEADER", leaderLabel(session.forecastLeader), session.status === "settled" ? "Final" : "Live proxy", "leader"),
      hudCell("ACTIONS", actionText, allReady || session.status === "settled" ? "Advance armed" : "Awaiting your calls", allReady || session.status === "settled" ? "ready" : "locked"),
      '</div>'
    ].join("");
  }

  function hudCell(label, value, helper, tone) {
    return '<div class="hud-cell ' + escapeAttr(tone || "") + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong><small>' + escapeHtml(helper || "") + '</small></div>';
  }

  function renderActiveGameBoard(session, deals, turn, allReady, floorMode) {
    return [
      '<div class="war-grid ' + (floorMode ? "floor-mode" : "card-mode") + '">',
      '<section class="war-panel priority-panel"><div class="panel-header"><div><div class="panel-title">Priority Stack</div><div class="panel-subtitle">Ranked by ML, market, and your disagreement</div></div><span class="pill amber">' + (turn.cards || []).length + ' cards</span></div><div class="intel-stack">' + renderIntelCards(turn.cards || []) + '</div></section>',
      '<section class="war-panel deal-board-panel ' + (floorMode ? "dense-panel" : "") + '"><div class="panel-header"><div><div class="panel-title">Active Deals</div><div class="panel-subtitle">' + (floorMode ? "Dense forecast-floor read; every row still needs a call" : "Forecast readout and your call live in the same card") + '</div></div><span class="pill ' + (allReady ? "green" : "amber") + '">' + readyCount(deals) + ' / ' + deals.length + ' ready</span></div>',
      renderProbabilityLegend(),
      floorMode ? renderDenseDealBoard(deals) : '<div class="deal-card-grid">' + deals.map(renderGameDealPanel).join("") + '</div>',
      '<div class="advance-dock"><div><strong>' + (allReady ? "Round ready" : "Forecasts incomplete") + '</strong><span>' + (allReady ? "Submit your full forecast book to reveal the next day of intel." : "Forecast or skip every active deal before the clock advances.") + '</span></div><button class="primary-button submit-day" data-action="game-submit-day" ' + (!allReady || ui.game.loading ? "disabled" : "") + '>' + (ui.game.loading ? "Submitting..." : "End day") + '</button></div>',
      '</section>',
      '</div>'
    ].join("");
  }

  function renderIntelCards(cards) {
    if (!cards.length) return '<div class="empty-state">No cards for this day yet.</div>';
    return cards.map(function (card) {
      var meta = cardKindMeta(card);
      var impact = Number(card.impact || 0);
      return [
        '<article class="intel-card ' + escapeAttr(meta.className) + ' ' + escapeAttr(card.tone || "") + '">',
        '<div class="intel-head"><span class="intel-badge">' + escapeHtml(meta.label) + '</span><span class="intel-source">' + escapeHtml(card.account_name || card.source || "War room") + '</span></div>',
        '<div class="intel-title-row"><div class="intel-title">' + escapeHtml(card.title) + '</div><strong class="intel-impact ' + (impact >= 0 ? "up" : "down") + '">' + formatSignedPercent(impact) + '</strong></div>',
        '<div class="intel-body">' + escapeHtml(card.body) + '</div>',
        '<div class="intel-foot"><span>' + escapeHtml(card.target_label || "") + '</span><span>' + escapeHtml(meta.note) + '</span></div>',
        '</article>'
      ].join("");
    }).join("");
  }

  function cardKindMeta(card) {
    var kind = String(card.kind || card.badge || "").toLowerCase();
    if (kind.indexOf("rumor") >= 0 || kind.indexOf("gossip") >= 0 || card.tone === "rumor") {
      return { label: "Rumor", className: "rumor", note: "Noisy / unreliable" };
    }
    if (kind.indexOf("agent") >= 0 || kind.indexOf("rep") >= 0) {
      return { label: "Agent", className: "agent", note: "Rep activity" };
    }
    if (kind.indexOf("process") >= 0 || /legal|security|procurement|approval/i.test(card.title || "")) {
      return { label: "Process", className: "process", note: "Deal process" };
    }
    return { label: "Metric", className: "metric", note: "Pipeline signal" };
  }

  function renderGameDealPanel(deal) {
    var move = Number(deal.marketProbability) - Number(deal.baselineProbability);
    return [
      '<article class="deal-card">',
      '<div class="deal-card-head"><div><div class="deal-title">' + escapeHtml(deal.accountName) + '</div><div class="deal-meta">' + escapeHtml(deal.targetLabel) + ' | ' + escapeHtml((deal.context && deal.context.stage) || "Unknown") + ' | ' + formatCurrency(Number((deal.context && deal.context.amount) || 0)) + '</div></div><span class="status-pill ' + outcomeClass(deal) + '">' + outcomeLabel(deal) + '</span></div>',
      '<div class="deal-question">' + escapeHtml(deal.marketQuestion || "") + '</div>',
      renderProbabilityStrip(deal),
      '<div class="deal-readout"><span>ML <strong>' + formatPercent(deal.baselineProbability) + '</strong></span><span>Market <strong>' + formatPercent(deal.marketProbability) + '</strong></span><span>You <strong>' + formatPercent(deal.fngProbability) + '</strong></span></div>',
      renderFngActionPanel(deal),
      '<div class="forecast-footer"><span class="delta ' + (move >= 0 ? "up" : "down") + '">' + formatSignedPercent(move) + ' vs ML</span><span>Your P&L <strong class="' + (deal.fngPnl >= 0 ? "delta up" : "delta down") + '">' + formatSignedNumber(deal.fngPnl || 0) + '</strong></span></div>',
      '</article>'
    ].join("");
  }

  function forecastStat(label, value) {
    return '<div class="forecast-stat"><span>' + label + '</span><strong>' + formatPercent(Number(value || 0)) + '</strong><div class="mini-bar"><i style="width:' + Math.round(Number(value || 0) * 100) + '%"></i></div></div>';
  }

  function renderFngActionPanel(deal) {
    var pending = getPendingGameAction(deal.sessionDealId);
    var probability = clamp(Number(pending.probability) || 50, 0, 100);
    return [
      '<div class="fng-card action-control">',
      '<div class="action-head"><span>Your forecast</span><strong>' + (pending.action ? escapeHtml(actionLabel(pending.action)) : "Open") + '</strong></div>',
      '<div class="probability-control"><label for="prob-' + escapeAttr(deal.sessionDealId) + '">Probability <strong>' + probability + '%</strong></label><input id="prob-' + escapeAttr(deal.sessionDealId) + '" class="range" type="range" min="0" max="100" step="1" data-game-probability="' + escapeAttr(deal.sessionDealId) + '" value="' + probability + '" /></div>',
      renderStakeSelector(deal, pending),
      '<div class="order-row">',
      ["BUY", "HOLD", "SELL"].map(function (choice) {
        return '<button class="order-button ' + choice.toLowerCase() + ' ' + (pending.action === choice ? "active" : "") + '" data-action="game-set-action" data-deal="' + escapeAttr(deal.sessionDealId) + '" data-choice="' + choice + '">' + actionLabel(choice) + '</button>';
      }).join(""),
      '</div>',
      '</div>'
    ].join("");
  }

  function renderStakeSelector(deal, pending) {
    var stake = Number(pending.stake) || 50;
    return '<div class="stake-row"><span>Stake</span>' + [25, 50, 100, 250].map(function (amount) {
      return '<button class="stake-button ' + (stake === amount ? "active" : "") + '" data-action="game-set-stake" data-deal="' + escapeAttr(deal.sessionDealId) + '" data-stake="' + amount + '">$' + amount + '</button>';
    }).join("") + '</div>';
  }

  function renderDenseDealBoard(deals) {
    return [
      '<div class="dense-deal-board">',
      '<div class="dense-header"><span>Deal / target</span><span>Probability strip</span><span>Read</span><span>Your forecast</span></div>',
      deals.map(renderDenseDealRow).join(""),
      '</div>'
    ].join("");
  }

  function renderDenseDealRow(deal) {
    var move = Number(deal.marketProbability) - Number(deal.baselineProbability);
    return [
      '<article class="dense-deal-row">',
      '<div class="dense-account"><div class="deal-title">' + escapeHtml(deal.accountName) + '</div><div class="deal-meta">' + escapeHtml(deal.targetLabel) + ' | ' + escapeHtml((deal.context && deal.context.stage) || "Unknown") + '</div></div>',
      '<div class="dense-prob">' + renderProbabilityStrip(deal, { mini: true }) + '</div>',
      '<div class="dense-read"><span>MKT <strong>' + formatPercent(deal.marketProbability) + '</strong></span><span class="delta ' + (move >= 0 ? "up" : "down") + '">' + formatSignedPercent(move) + '</span><span>Your P&L <strong class="' + (deal.fngPnl >= 0 ? "delta up" : "delta down") + '">' + formatSignedNumber(deal.fngPnl || 0) + '</strong></span></div>',
      '<div class="dense-action">' + renderCompactActionPanel(deal) + '</div>',
      '</article>'
    ].join("");
  }

  function renderCompactActionPanel(deal) {
    var pending = getPendingGameAction(deal.sessionDealId);
    var probability = clamp(Number(pending.probability) || 50, 0, 100);
    return [
      '<div class="action-control compact">',
      '<div class="compact-prob"><span>' + probability + '%</span><input class="range" type="range" min="0" max="100" step="1" data-game-probability="' + escapeAttr(deal.sessionDealId) + '" value="' + probability + '" /></div>',
      renderStakeSelector(deal, pending),
      '<div class="order-row">',
      ["BUY", "HOLD", "SELL"].map(function (choice) {
        return '<button class="order-button ' + choice.toLowerCase() + ' ' + (pending.action === choice ? "active" : "") + '" data-action="game-set-action" data-deal="' + escapeAttr(deal.sessionDealId) + '" data-choice="' + choice + '">' + compactActionLabel(choice) + '</button>';
      }).join(""),
      '</div>',
      '</div>'
    ].join("");
  }

  function renderProbabilityLegend() {
    return [
      '<div class="probability-legend">',
      '<span><i class="prob-dot ml"></i>ML</span>',
      '<span><i class="prob-dot market"></i>Market</span>',
      '<span><i class="prob-dot fng"></i>You</span>',
      '<span><i class="prob-dot target"></i>Target line</span>',
      '</div>'
    ].join("");
  }

  function renderProbabilityStrip(deal, options) {
    options = options || {};
    var markers = probabilityMarkers(deal);
    var errorLines = options.showErrors ? renderErrorLines(deal) : "";
    var ticks = [25, 50, 75].map(function (tick) {
      return '<span class="prob-tick" style="left:' + tick + '%"></span>';
    }).join("");
    return [
      '<div class="prob-strip-wrap ' + (options.mini ? "mini" : "") + '">',
      '<div class="prob-strip">',
      '<div class="prob-track">' + ticks + '</div>',
      errorLines,
      markers.map(function (marker) {
        return '<span class="prob-marker ' + escapeAttr(marker.className) + '" style="left:' + marker.lineLeft + '%"></span><span class="prob-marker-label ' + escapeAttr(marker.className) + ' level-' + marker.level + '" style="left:' + marker.labelLeft + '%">' + escapeHtml(marker.label) + ' <strong>' + marker.percent + '</strong></span>';
      }).join(""),
      '</div>',
      '<div class="prob-scale"><span>0</span><span>100</span></div>',
      '</div>'
    ].join("");
  }

  function probabilityMarkers(deal) {
    var markers = [
      { label: "ML", className: "ml", value: probabilityValue(deal.baselineProbability, 0.5) },
      { label: "MKT", className: "market", value: probabilityValue(deal.marketProbability, 0.5) },
      { label: "You", className: "fng", value: probabilityValue(deal.fngProbability, probabilityValue(deal.marketProbability, 0.5)) }
    ].sort(function (a, b) {
      return a.value - b.value;
    });
    markers.forEach(function (marker, index) {
      var level = 0;
      for (var i = index - 1; i >= 0; i -= 1) {
        if (Math.abs(marker.value - markers[i].value) <= 0.08) level += 1;
      }
      marker.level = level % 3;
      marker.lineLeft = Math.round(marker.value * 1000) / 10;
      marker.labelLeft = clamp(marker.lineLeft, 5, 95);
      marker.percent = Math.round(marker.value * 100);
    });
    return markers;
  }

  function renderErrorLines(deal) {
    if (deal.actualOutcome === null || deal.actualOutcome === undefined) return "";
    var actual = deal.actualOutcome ? 1 : 0;
    return [
      { label: "ML", className: "ml", value: probabilityValue(deal.baselineProbability, 0.5) },
      { label: "MKT", className: "market", value: probabilityValue(deal.marketProbability, 0.5) },
      { label: "You", className: "fng", value: probabilityValue(deal.fngProbability, probabilityValue(deal.marketProbability, 0.5)) }
    ].map(function (item) {
      var from = Math.round(Math.min(actual, item.value) * 1000) / 10;
      var width = Math.round(Math.abs(item.value - actual) * 1000) / 10;
      return '<span class="error-line ' + escapeAttr(item.className) + '" style="left:' + from + '%;width:' + width + '%"><span>' + escapeHtml(item.label) + ' error ' + Math.round(Math.abs(item.value - actual) * 100) + '</span></span>';
    }).join("");
  }

  function probabilityValue(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return clamp(number, 0, 1);
  }

  function outcomeLabel(deal) {
    if (deal.actualOutcome === null || deal.actualOutcome === undefined) return "Sealed";
    return deal.actualOutcome ? "Won" : "Lost";
  }

  function outcomeClass(deal) {
    if (deal.actualOutcome === null || deal.actualOutcome === undefined) return "sealed";
    return deal.actualOutcome ? "won" : "lost";
  }

  function renderGameResults(results) {
    var errors = results.aggregateErrors || {};
    return [
      '<section class="war-panel results-panel">',
      '<div class="winner-banner"><div><span>Forecast winner</span><strong>' + leaderLabel(results.forecastWinner) + '</strong><small>Lowest aggregate probability error wins the run.</small></div><div class="winner-score">Your P&L <strong class="' + (results.fngPnl >= 0 ? "delta up" : "delta down") + '">' + formatSignedNumber(results.fngPnl || 0) + '</strong></div></div>',
      '<div class="results-grid">',
      metricCard("ML error", formatPercent(errors.ml || 0), "Average absolute error"),
      metricCard("Market error", formatPercent(errors.market || 0), "Average absolute error"),
      metricCard("Your error", formatPercent(errors.fng || 0), "Average absolute error"),
      metricCard("Agent P&L", formatSignedNumber(results.agentPnl || 0), "Market desk outcome"),
      '</div>',
      '<div class="pnl-leaderboard">',
      pnlRow("You", results.fngPnl || 0, errors.fng, results.forecastWinner === "fng"),
      pnlRow("Market", results.agentPnl || 0, errors.market, results.forecastWinner === "market"),
      pnlRow("ML baseline", 0, errors.ml, results.forecastWinner === "ml"),
      '</div>',
      '<div class="settlement-list">',
      (results.perDeal || []).map(function (item) {
        return [
          '<article class="settlement-card">',
          '<div class="deal-card-head"><div><div class="deal-title">' + escapeHtml(item.accountName) + '</div><div class="deal-meta">' + escapeHtml(item.targetLabel) + '</div></div></div>',
          '<div class="settlement-outcome ' + (item.actualOutcome ? "yes" : "no") + '"><span>Resolved outcome</span><strong>' + (item.actualOutcome ? "YES" : "NO") + '</strong><small>' + (item.actualOutcome ? "The contract settled at 100." : "The contract settled at 0.") + '</small></div>',
          renderProbabilityStrip(item, { showErrors: true }),
          '<div class="settlement-footer"><span>Winner <strong>' + leaderLabel(item.forecastWinner) + '</strong></span><span>Your P&L <strong class="' + (item.fngPnl >= 0 ? "delta up" : "delta down") + '">' + formatSignedNumber(item.fngPnl || 0) + '</strong></span></div>',
          '</article>'
        ].join("");
      }).join(""),
      '</div>',
      '</section>'
    ].join("");
  }

  function renderGameDebrief(game) {
    var results = game.results || {};
    var aggregate = results.aggregateBrier || {};
    var perDeal = results.perDeal || [];
    return [
      '<section class="war-panel debrief-panel" data-view-name="debrief">',
      '<div class="debrief-hero"><div><span>Settlement Debrief</span><h2>' + escapeHtml(results.headline || "Run settled.") + '</h2><p>Aggregate Brier - ML ' + formatBrier(aggregate.ml) + ' | Market ' + formatBrier(aggregate.market) + ' | You ' + formatBrier(aggregate.fng) + '</p></div></div>',
      '<div class="debrief-table-wrap"><table class="debrief-table"><thead><tr><th>Deal</th><th>Outcome</th><th>ML</th><th>Market</th><th>You</th><th>Brier ML</th><th>Brier Market</th><th>Brier You</th><th>Attribution</th></tr></thead><tbody>',
      perDeal.map(function (item) {
        return '<tr><td><strong>' + escapeHtml(item.accountName) + '</strong><small>' + escapeHtml(item.targetLabel || item.target || "") + '</small></td><td><span class="outcome-token ' + (item.actualOutcome ? "yes" : "no") + '">' + (item.actualOutcome ? "Close" : "Slip") + '</span></td><td>' + formatPercent(item.baselineProbability) + '</td><td>' + formatPercent(item.marketProbability) + '</td><td>' + formatPercent(item.fngProbability) + '</td><td>' + formatBrier(item.brier && item.brier.ml) + '</td><td>' + formatBrier(item.brier && item.brier.market) + '</td><td>' + formatBrier(item.brier && item.brier.fng) + '</td><td>' + escapeHtml(item.attribution || "") + '</td></tr>';
      }).join(""),
      '</tbody></table></div>',
      '<div class="calibration-card"><div class="panel-header"><div><div class="panel-title">Calibration curve</div><div class="panel-subtitle">Predicted probability vs. observed close rate</div></div></div><div class="calibration-chart-wrap"><canvas id="calibration-chart" width="900" height="320" aria-label="Calibration curve"></canvas></div></div>',
      '<div class="debrief-actions"><button class="primary-button" data-action="game-new">Restart Practice Run</button><button class="secondary-button" data-action="open-lr-report">Open LR-Test Report</button></div>',
      '</section>'
    ].join("");
  }

  function formatBrier(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(3) : "--";
  }

  function maybeRenderDebriefChart() {
    var canvas = document.getElementById("calibration-chart");
    var game = state.game && state.game.session;
    var results = game && game.results;
    if (!canvas || !results || !results.calibrationBins) return;
    window.setTimeout(function () {
      drawCalibrationChart(canvas, results.calibrationBins);
    }, 0);
  }

  function drawCalibrationChart(canvas, bins) {
    var context = canvas.getContext("2d");
    if (!context) return;
    var width = canvas.width;
    var height = canvas.height;
    var pad = { left: 48, right: 24, top: 24, bottom: 42 };
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(226, 232, 240, 0.16)";
    context.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var x = pad.left + (i / 4) * (width - pad.left - pad.right);
      var y = pad.top + (i / 4) * (height - pad.top - pad.bottom);
      context.beginPath();
      context.moveTo(x, pad.top);
      context.lineTo(x, height - pad.bottom);
      context.stroke();
      context.beginPath();
      context.moveTo(pad.left, y);
      context.lineTo(width - pad.right, y);
      context.stroke();
    }
    context.strokeStyle = "rgba(255, 255, 255, 0.42)";
    context.setLineDash([5, 5]);
    drawChartLine(context, [{ x: 0, y: 0 }, { x: 1, y: 1 }], "#e2e8f0", pad, width, height);
    context.setLineDash([]);
    drawEstimatorLine(context, bins.ml || [], "#60a5fa", pad, width, height);
    drawEstimatorLine(context, bins.market || [], "#f8fafc", pad, width, height);
    drawEstimatorLine(context, bins.fng || [], "#22d3ee", pad, width, height);
    context.fillStyle = "#cbd5e1";
    context.font = "12px Inter, sans-serif";
    context.fillText("0%", pad.left - 4, height - 18);
    context.fillText("100%", width - pad.right - 34, height - 18);
    context.fillText("Observed", 8, pad.top + 8);
    context.fillText("Predicted probability", width / 2 - 58, height - 10);
    renderChartLegend(context, width, pad);
  }

  function drawEstimatorLine(context, bins, color, pad, width, height) {
    var points = bins.filter(function (bin) {
      return bin.n > 0 && Number.isFinite(Number(bin.meanPredicted)) && Number.isFinite(Number(bin.meanActual));
    }).map(function (bin) {
      return { x: Number(bin.meanPredicted), y: Number(bin.meanActual) };
    });
    drawChartLine(context, points, color, pad, width, height);
  }

  function drawChartLine(context, points, color, pad, width, height) {
    if (!points.length) return;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    points.forEach(function (point, index) {
      var x = pad.left + clamp(point.x, 0, 1) * (width - pad.left - pad.right);
      var y = height - pad.bottom - clamp(point.y, 0, 1) * (height - pad.top - pad.bottom);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    points.forEach(function (point) {
      var x = pad.left + clamp(point.x, 0, 1) * (width - pad.left - pad.right);
      var y = height - pad.bottom - clamp(point.y, 0, 1) * (height - pad.top - pad.bottom);
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    });
  }

  function renderChartLegend(context, width, pad) {
    var items = [
      ["ML", "#60a5fa"],
      ["Market", "#f8fafc"],
      ["You", "#22d3ee"]
    ];
    var x = width - pad.right - 190;
    items.forEach(function (item, index) {
      context.fillStyle = item[1];
      context.fillRect(x + index * 64, pad.top, 18, 3);
      context.fillStyle = "#cbd5e1";
      context.fillText(item[0], x + 24 + index * 64, pad.top + 5);
    });
  }

  function pnlRow(label, pnl, error, active) {
    return '<div class="pnl-row ' + (active ? "active" : "") + '"><span>' + escapeHtml(label) + '</span><strong class="' + (pnl >= 0 ? "delta up" : "delta down") + '">' + (label === "ML baseline" ? "--" : formatSignedNumber(pnl || 0)) + '</strong><small>Error ' + formatPercent(error || 0) + '</small></div>';
  }

  function modeLabel(mode) {
    return { team: "Team", focus: "Agent Focus", silent: "Silent Market" }[mode] || "Team";
  }

  function leaderLabel(value) {
    return { ml: "ML baseline", market: "Market", fng: "You" }[value] || "Pending";
  }

  function actionLabel(action) {
    return { BUY: "Forecast: will close", SELL: "Forecast: won't close", HOLD: "Skip this day" }[action] || action;
  }

  function compactActionLabel(action) {
    return { BUY: "Close", SELL: "Slip", HOLD: "Skip" }[action] || action;
  }

  function getPendingGameAction(sessionDealId) {
    if (!ui.game.pendingActions[sessionDealId]) ui.game.pendingActions[sessionDealId] = { action: "", probability: 50, stake: 50 };
    return ui.game.pendingActions[sessionDealId];
  }

  function gameActionsReady(deals) {
    return deals.length > 0 && deals.every(function (deal) {
      var pending = ui.game.pendingActions[deal.sessionDealId];
      return pending && pending.action;
    });
  }

  function readyCount(deals) {
    return deals.filter(function (deal) {
      var pending = ui.game.pendingActions[deal.sessionDealId];
      return pending && pending.action;
    }).length;
  }

  function resetPendingGameActions(game) {
    ui.game.pendingActions = {};
    if (!game || !game.deals) return;
    game.deals.forEach(function (deal) {
      ui.game.pendingActions[deal.sessionDealId] = {
        action: "",
        probability: Math.round(probabilityValue(deal.fngProbability, probabilityValue(deal.marketProbability, 0.5)) * 100),
        stake: 50
      };
    });
  }

  function gameApi(path, options) {
    if (!window.fetch || window.location.protocol === "file:") {
      return Promise.reject(new Error("Run node server.js and open http://127.0.0.1:4173 to use the Boiler Room APIs."));
    }
    return window.fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.error || "Game API request failed");
        return body;
      });
    });
  }

  function startGameRun() {
    ui.game.loading = true;
    ui.game.error = "";
    ui.game.advancedSetup = false;
    ui.game.ignoreAdvancedQuery = true;
    render();
    gameApi("/api/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: ui.game.mode, dealCount: Number(ui.game.dealCount), maxDays: Number(ui.game.maxDays) })
    }).then(function (payload) {
      state.game.session = payload;
      resetPendingGameActions(payload);
      saveState();
      showToast("Boiler Room run started: " + payload.session.dealCount + " deal" + (payload.session.dealCount === 1 ? "" : "s") + ".");
    }).catch(function (error) {
      ui.game.error = error.message || "Unable to start Boiler Room run.";
      showToast(ui.game.error);
    }).finally(function () {
      ui.game.loading = false;
      render();
    });
  }

  function refreshGameRun() {
    var game = state.game && state.game.session;
    if (!game || !game.session) return;
    ui.game.loading = true;
    render();
    gameApi("/api/game/session?sessionId=" + encodeURIComponent(game.session.sessionId))
      .then(function (payload) {
        state.game.session = payload;
        resetPendingGameActions(payload);
        saveState();
      })
      .catch(function (error) {
        showToast(error.message || "Unable to refresh run.");
      })
      .finally(function () {
        ui.game.loading = false;
        render();
      });
  }

  function submitGameDay() {
    var game = state.game && state.game.session;
    if (!game || !game.session || !gameActionsReady(game.deals || [])) return;
    var actions = game.deals.map(function (deal) {
      var pending = getPendingGameAction(deal.sessionDealId);
      var action = { sessionDealId: deal.sessionDealId, action: pending.action };
      if (pending.action !== "HOLD") {
        action.probability = clamp(Number(pending.probability) || 50, 0, 100) / 100;
        action.stake = Number(pending.stake) || 50;
      }
      return action;
    });
    ui.game.loading = true;
    render();
    gameApi("/api/game/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: game.session.sessionId, day: game.session.currentDay, actions: actions })
    }).then(function (payload) {
      state.game.session = payload;
      resetPendingGameActions(payload);
      saveState();
      showToast(payload.session.status === "settled" ? "Run settled. Forecast results are live." : "Advanced to Day " + payload.session.currentDay + " / " + payload.session.maxDays + ".");
    }).catch(function (error) {
      showToast(error.message || "Unable to submit your forecasts.");
    }).finally(function () {
      ui.game.loading = false;
      render();
    });
  }

  function renderSimDealTable() {
    var sim = state.simulation;
    return [
      '<table class="data-table sim-table">',
      '<thead><tr><th>Deal</th><th>Stage</th><th>Baseline</th><th>Market</th><th>Move</th><th>Volume</th><th>Observed</th><th>Closer</th></tr></thead>',
      '<tbody>',
      activeSimDeals(sim).map(function (deal) {
        var hidden = sim.hiddenOutcomes[deal.id];
        var outcome = sim.showOutcomes && hidden ? hidden.outcome : null;
        var move = deal.marketProbability - deal.baselineProbability;
        var closer = "";
        if (sim.showOutcomes && hidden) {
          closer = Math.abs(deal.marketProbability - outcome) <= Math.abs(deal.baselineProbability - outcome) ? "Market" : "Baseline";
        }
        return [
          '<tr class="clickable ' + (ui.sim.selectedDealId === deal.id ? "selected-row" : "") + '" data-action="sim-select-deal" data-id="' + deal.id + '">',
          '<td><div class="deal-title">' + escapeHtml(deal.account) + '</div><div class="deal-meta">' + escapeHtml(deal.segment) + ' | ' + escapeHtml(deal.productLine) + '</div></td>',
          '<td>' + escapeHtml(deal.stage) + '</td>',
          '<td>' + formatPercent(deal.baselineProbability) + '</td>',
          '<td>' + probStack(deal.marketProbability, false) + '</td>',
          '<td class="delta ' + (move >= 0 ? "up" : "down") + '">' + formatSignedPercent(move) + '</td>',
          '<td>' + formatNumber(deal.volume) + '</td>',
          '<td>' + (outcome === null ? '<span class="pill amber">Hidden</span>' : outcome ? '<span class="pill green">Won</span>' : '<span class="pill red">Lost</span>') + '</td>',
          '<td>' + (closer ? '<span class="pill ' + (closer === "Market" ? "green" : "blue") + '">' + closer + '</span>' : '<span class="small-muted">Pending</span>') + '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table>'
    ].join("");
  }

  function renderSimSelectedDeal(deal) {
    if (!deal) return '<div class="empty-state">Select a deal to inspect the live market.</div>';
    var hidden = state.simulation.hiddenOutcomes[deal.id];
    var outcome = state.simulation.showOutcomes && hidden ? hidden.outcome : null;
    return [
      '<div class="price-strip">',
      '<div class="price-tile"><div class="price-label">Baseline model</div><div class="price-value">' + formatPercent(deal.baselineProbability) + '</div><div class="small-muted">Uses public synthetic CRM fields only</div></div>',
      '<div class="price-tile"><div class="price-label">Market price</div><div class="price-value yes">' + formatPercent(deal.marketProbability) + '</div><div class="small-muted">After agent and player forecasts</div></div>',
      '<div class="price-tile"><div class="price-label">Observed value</div><div class="price-value ' + (outcome === null ? "" : outcome ? "yes" : "no") + '">' + (outcome === null ? "Sealed" : outcome ? "Won" : "Lost") + '</div><div class="small-muted">' + escapeHtml(formatCurrency(deal.amount) + " | " + deal.region + " | " + formatShortDate(deal.closeDate)) + '</div></div>',
      '</div>',
      '<div style="margin-top:16px">' + renderDualLine(deal.history.map(function (point) { return { date: addDays("2026-05-09", point.tick), market: point.probability, official: deal.baselineProbability }; }), "market", "official", formatPercent) + '</div>',
      '<div class="sim-news-row">' + renderPublicNews(deal) + '</div>'
    ].join("");
  }

  function renderPublicNews(deal) {
    if (!deal.publicNews.length) return '<div class="alert"><div class="alert-title">No public update yet</div><div class="alert-body">Agents are forecasting from private fragments and public CRM fields.</div></div>';
    return deal.publicNews.slice(-3).reverse().map(function (news) {
      return '<div class="alert ' + (news.impact >= 0 ? "positive" : "risk") + '"><div class="alert-title">Tick ' + news.tick + ' public update</div><div class="alert-body">' + escapeHtml(news.text) + '</div></div>';
    }).join("");
  }

  function renderSimEventTape() {
    var events = state.simulation.events.slice().reverse().slice(0, 18);
    return '<div class="sim-tape">' + events.map(function (event) {
      if (event.kind === "system" || event.kind === "news") {
        return '<div class="sim-event ' + escapeAttr(event.tone || "blue") + '"><div class="sim-event-head"><strong>' + escapeHtml(event.title) + '</strong><span>Tick ' + event.tick + '</span></div><div class="row-subtitle">' + escapeHtml(event.body) + '</div></div>';
      }
      if (event.kind === "hold") {
        return '<div class="sim-event muted"><div class="sim-event-head"><strong>' + escapeHtml(event.agentName) + ' held</strong><span>Tick ' + event.tick + '</span></div><div class="thought-bubble">' + escapeHtml(event.thought) + '</div></div>';
      }
      return [
        '<div class="sim-event ' + (event.side === "YES" ? "green" : "red") + '">',
        '<div class="sim-event-head"><strong>' + escapeHtml(event.agentName) + ' bought ' + event.side + '</strong><span>Tick ' + event.tick + '</span></div>',
        '<div class="row-subtitle">' + escapeHtml(event.account) + ' | ' + formatNumber(event.amount) + ' credits | belief ' + formatPercent(event.belief) + ' vs market ' + formatPercent(event.marketBefore) + ' -> ' + formatPercent(event.marketAfter) + '</div>',
        '<div class="thought-bubble">' + escapeHtml(event.thought) + '</div>',
        '</div>'
      ].join("");
    }).join("") + '</div>';
  }

  function renderSimAgents() {
    return '<div class="agent-grid">' + state.simulation.agents.map(function (agent) {
      var initials = agent.name.split(" ").map(function (part) { return part[0]; }).join("");
      return [
        '<article class="agent-card" style="--agent-color:' + agent.color + '">',
        '<div class="agent-head"><div class="agent-avatar">' + escapeHtml(initials) + '</div><div><div class="agent-name">' + escapeHtml(agent.name) + '</div><div class="agent-role">' + escapeHtml(agent.role) + ' | ' + escapeHtml(agent.specialty) + '</div></div></div>',
        '<div class="agent-personality">' + escapeHtml(agent.personality) + '</div>',
        '<div class="agent-stats"><span>Wallet <strong>' + formatNumber(agent.wallet) + '</strong></span><span>P&L <strong class="' + (agent.pnl >= 0 ? "delta up" : "delta down") + '">' + formatSignedNumber(agent.pnl) + '</strong></span><span>Forecasts <strong>' + agent.trades + '</strong></span></div>',
        '</article>'
      ].join("");
    }).join("") + '</div>';
  }

  function renderPlayerDesk(deal) {
    if (!deal) return '<div class="empty-state">No deal selected.</div>';
    var sim = state.simulation;
    var amount = clamp(Number(ui.sim.humanAmount) || 10, 10, Math.max(10, sim.playerWallet));
    var quote = quoteSimTrade(deal, ui.sim.humanSide, amount);
    var position = getPlayerSimPosition(deal.id);
    return [
      '<select class="select" data-sim="selectedDealId">' + activeSimDeals(sim).map(function (item) { return '<option value="' + item.id + '"' + (item.id === deal.id ? " selected" : "") + '>' + escapeHtml(item.account + " | " + formatPercent(item.marketProbability)) + '</option>'; }).join("") + '</select>',
      '<div class="segmented"><button class="segment yes ' + (ui.sim.humanSide === "YES" ? "active" : "") + '" data-action="sim-human-side" data-side="YES">YES</button><button class="segment no ' + (ui.sim.humanSide === "NO" ? "active" : "") + '" data-action="sim-human-side" data-side="NO">NO</button></div>',
      '<div class="field"><label>Credits to spend</label><input class="range" type="range" min="10" max="' + Math.max(10, Math.min(700, sim.playerWallet)) + '" step="10" data-sim="humanAmount" value="' + amount + '" /><input class="input" type="number" min="10" max="' + sim.playerWallet + '" step="10" data-sim="humanAmount" value="' + amount + '" /></div>',
      '<div class="trade-summary"><div class="summary-row"><span>Estimated shares</span><strong>' + quote.shares.toFixed(2) + '</strong></div><div class="summary-row"><span>Price after forecast</span><strong>' + formatPercent(quote.nextProbability) + '</strong></div><div class="summary-row"><span>Your YES / NO</span><strong>' + position.yes.toFixed(2) + ' / ' + position.no.toFixed(2) + '</strong></div><div class="summary-row"><span>Wallet after</span><strong>' + formatNumber(Math.max(0, sim.playerWallet - amount)) + '</strong></div></div>',
      '<button class="buy-button ' + (ui.sim.humanSide === "YES" ? "yes" : "no") + '" data-action="sim-human-trade" ' + (sim.settled || sim.playerWallet < 10 ? "disabled" : "") + '>Forecast ' + ui.sim.humanSide + '</button>'
    ].join("");
  }

  function getSimSelectedDeal() {
    var sim = state.simulation;
    return activeSimDeals(sim).find(function (deal) { return deal.id === ui.sim.selectedDealId; }) || activeSimDeals(sim)[0];
  }

  function activeSimDeals(sim) {
    var count = sim.activeDealCount || 5;
    return sim.deals.slice(0, count);
  }

  function simulationVolume() {
    return sum(activeSimDeals(state.simulation), function (deal) { return deal.volume; });
  }

  function simulationResults() {
    var sim = state.simulation;
    var deals = activeSimDeals(sim);
    var marketWins = 0;
    var baselineWins = 0;
    var marketError = 0;
    var baselineError = 0;
    deals.forEach(function (deal) {
      var hidden = sim.hiddenOutcomes[deal.id];
      if (!hidden) return;
      var outcome = hidden.outcome;
      var marketAbs = Math.abs(deal.marketProbability - outcome);
      var baselineAbs = Math.abs(deal.baselineProbability - outcome);
      marketError += marketAbs;
      baselineError += baselineAbs;
      if (marketAbs <= baselineAbs) marketWins += 1;
      else baselineWins += 1;
    });
    var scored = marketWins + baselineWins || 1;
    return { marketWins: marketWins, baselineWins: baselineWins, marketError: marketError / scored, baselineError: baselineError / scored };
  }

  function startSimulation() {
    var sim = state.simulation;
    if (sim.settled) resetSimulation(false);
    if (!activeSimDeals(sim).length) {
      showToast("Load deals before starting a session.");
      return;
    }
    sim.running = true;
    sim.status = ui.sim.llmMode ? "Running with remote LLM fallback" : "Running locally";
    saveState();
    render();
    stopSimulationTimer();
    simulationTimer = window.setInterval(function () {
      runSimulationRound();
    }, 1250);
  }

  function setSimulationDealCount(count) {
    count = Number(count) || 5;
    if ([1, 3, 5, 10].indexOf(count) === -1) count = 5;
    stopSimulationTimer();
    if (state.simulation.source === "supabase") {
      state.simulation.activeDealCount = count;
      state.simulation.maxTicks = simTicksForCount(count);
      if (count > state.simulation.deals.length) {
        state.simulation.status = "Loading more Supabase live deals";
        saveState();
        loadSupabaseLiveDeals();
        return;
      }
      state.simulation.status = "Supabase session resized";
      if (!activeSimDeals(state.simulation).some(function (deal) { return deal.id === ui.sim.selectedDealId; })) {
        ui.sim.selectedDealId = activeSimDeals(state.simulation)[0] ? activeSimDeals(state.simulation)[0].id : "";
      }
      saveState();
      showToast("Supabase session set to " + count + " active deal" + (count === 1 ? "" : "s") + ".");
    } else {
      state.simulation = seedSimulation(count);
      ui.sim.selectedDealId = state.simulation.deals[0].id;
      saveState();
      showToast("Session set to " + count + " active deal" + (count === 1 ? "" : "s") + ".");
    }
  }

  function pauseSimulation() {
    state.simulation.running = false;
    state.simulation.status = state.simulation.settled ? "Settled" : "Paused";
    stopSimulationTimer();
    saveState();
    render();
  }

  function stopSimulationTimer() {
    if (simulationTimer) {
      window.clearInterval(simulationTimer);
      simulationTimer = null;
    }
  }

  function runSimulationRound() {
    var sim = state.simulation;
    if (simulationBusy || sim.settled) return;
    if (!activeSimDeals(sim).length) return;
    if (sim.tick >= sim.maxTicks) {
      settleSimulation();
      return;
    }
    simulationBusy = true;
    sim.tick += 1;
    if (sim.tick % 6 === 0) addSimulationPublicNews(sim);
    var agent = sim.agents[(sim.tick - 1) % sim.agents.length];
    var localDecision = buildAgentDecision(agent, sim);
    maybeRemoteAgentDecision(agent, localDecision).then(function (decision) {
      applyAgentDecision(agent, normalizeAgentDecision(decision, localDecision), sim);
      if (sim.tick >= sim.maxTicks) settleSimulation();
      else {
        saveState();
        render();
      }
    }).catch(function () {
      applyAgentDecision(agent, localDecision, sim);
      saveState();
      render();
    }).finally(function () {
      simulationBusy = false;
    });
  }

  function buildAgentDecision(agent, sim) {
    var candidates = activeSimDeals(sim).map(function (deal) {
      var belief = agentBelief(agent, deal, sim);
      var edge = belief - deal.marketProbability;
      var knowsDeal = (deal.privateSignals[agent.id] || []).length > 0;
      var score = Math.abs(edge) + (knowsDeal ? 0.035 : 0) + Math.random() * 0.025;
      return { deal: deal, belief: belief, edge: edge, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
    if (!candidates.length) {
      return { action: "HOLD", dealId: "", side: "YES", amount: 0, belief: 0.5, thought: "No active deal markets are loaded." };
    }
    var chosen = candidates[0];
    var threshold = agent.role === "BDR" ? 0.06 : 0.045;
    var irrational = Math.random() < agent.irrationality;
    var hold = Math.abs(chosen.edge) < threshold && !irrational;
    var side = chosen.edge >= 0 ? "YES" : "NO";
    if (irrational && Math.random() < 0.22) side = side === "YES" ? "NO" : "YES";
    var amount = hold ? 0 : roundTo(clamp(70 + Math.abs(chosen.edge) * 1100 + Math.random() * 90, 40, Math.min(520, agent.wallet)), 10);
    return {
      action: hold ? "HOLD" : "TRADE",
      dealId: chosen.deal.id,
      side: side,
      amount: amount,
      belief: chosen.belief,
      thought: agentThought(agent, chosen.deal, side, amount, chosen.belief, chosen.deal.marketProbability, hold, irrational)
    };
  }

  function agentBelief(agent, deal, sim) {
    var belief = deal.baselineProbability;
    (deal.publicNews || []).forEach(function (news) {
      belief += news.impact * 0.75;
    });
    (deal.privateSignals[agent.id] || []).forEach(function (signal) {
      belief += signal.impact * signal.confidence;
    });
    if (sim.vpBroadcast && sim.vpBroadcast.dealId === deal.id && sim.vpBroadcast.expiresTick >= sim.tick && agent.id !== "vp1") {
      belief += sim.vpBroadcast.impact * agent.influenceSusceptibility;
    }
    belief += (Math.random() - 0.5) * agent.irrationality * 0.08;
    return clamp(belief, 0.02, 0.98);
  }

  function agentThought(agent, deal, side, amount, belief, marketPrice, hold, irrational) {
    var signals = deal.privateSignals[agent.id] || [];
    var signal = signals[0] ? signals[0].text : "I only have the public board here.";
    var gap = Math.abs(belief - marketPrice);
    var spice = irrational && Math.random() < 0.45 ? " Damn." : "";
    if (agent.id === "ae2" && irrational && Math.random() < 0.35) spice = " Shit, this one feels mispriced.";
    if (hold) return "No edge big enough yet. " + signal + " I am not paying spread just to feel busy.";
    if (agent.id === "ae1") return "I am buying " + side + ". " + signal + " The price is off by " + formatPercent(gap) + "." + spice;
    if (agent.id === "ae2") return side === "NO" ? "Buying NO. " + signal + " Procurement timelines do not care about rep optimism." + spice : "Buying YES, but only because the market is too cold. " + signal;
    if (agent.id === "ae3") return "I will take " + side + ". " + signal + " Relationship map says the board is missing context.";
    if (agent.id === "bdr1") return "Small edge from top-of-funnel signals: " + signal + " I am taking " + side + ".";
    if (agent.id === "se1") return "Technical read supports " + side + ". " + signal + " I would rather trade the evidence than the stage label.";
    return "VP read: buying " + side + " on " + deal.account + ". " + signal + " The team will notice this print.";
  }

  function maybeRemoteAgentDecision(agent, localDecision) {
    if (!ui.sim.llmMode || !window.fetch || window.location.protocol === "file:") {
      return Promise.resolve(localDecision);
    }
    var deal = state.simulation.deals.find(function (item) { return item.id === localDecision.dealId; });
    if (!deal) return Promise.resolve(localDecision);
    return window.fetch("/api/agent-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: {
          name: agent.name,
          role: agent.role,
          specialty: agent.specialty,
          personality: agent.personality,
          wallet: agent.wallet
        },
        deal: {
          id: deal.id,
          account: deal.account,
          stage: deal.stage,
          amount: deal.amount,
          closeDate: deal.closeDate,
          baselineProbability: deal.baselineProbability,
          marketProbability: deal.marketProbability,
          publicNews: deal.publicNews
        },
        privateSignals: deal.privateSignals[agent.id] || [],
        localProposal: localDecision,
        allowedSwears: ["damn", "shit"]
      })
    }).then(function (response) {
      if (!response.ok) return localDecision;
      return response.json();
    }).catch(function () {
      return localDecision;
    });
  }

  function normalizeAgentDecision(decision, fallback) {
    if (!decision || typeof decision !== "object") return fallback;
    var normalized = {
      action: decision.action === "HOLD" ? "HOLD" : "TRADE",
      dealId: decision.dealId || fallback.dealId,
      side: decision.side === "NO" ? "NO" : "YES",
      amount: Number(decision.amount) || fallback.amount,
      belief: clamp(Number(decision.belief) || fallback.belief, 0.02, 0.98),
      thought: sanitizeThought(decision.thought || fallback.thought)
    };
    if (normalized.action === "HOLD") normalized.amount = 0;
    return normalized;
  }

  function sanitizeThought(text) {
    var clean = String(text).slice(0, 220);
    var banned = ["fuck", "fucking", "asshole", "bitch", "bastard"];
    banned.forEach(function (word) {
      clean = clean.replace(new RegExp(word, "gi"), "damn");
    });
    return clean;
  }

  function applyAgentDecision(agent, decision, sim) {
    var deal = sim.deals.find(function (item) { return item.id === decision.dealId; }) || sim.deals[0];
    if (!deal || decision.action === "HOLD" || decision.amount <= 0 || agent.wallet < 10) {
      sim.events.push({
        tick: sim.tick,
        kind: "hold",
        agentName: agent.name,
        role: agent.role,
        thought: decision.thought || "Holding. No edge worth paying for.",
        tone: "muted"
      });
      trimSimEvents(sim);
      return;
    }
    var budget = clamp(decision.amount, 10, agent.wallet);
    var before = deal.marketProbability;
    var quote = quoteSimTrade(deal, decision.side, budget);
    if (decision.side === "YES") deal.qYes += quote.shares;
    else deal.qNo += quote.shares;
    deal.marketProbability = lmsrPrice(deal.qYes, deal.qNo, deal.liquidity);
    deal.volume += budget;
    deal.participants = unique(deal.trades.map(function (trade) { return trade.agentId; }).concat([agent.id])).length;
    deal.history.push({ tick: sim.tick, probability: deal.marketProbability });
    if (deal.history.length > 44) deal.history.shift();
    agent.wallet -= budget;
    agent.trades += 1;
    var position = getAgentSimPosition(agent, deal.id);
    if (decision.side === "YES") position.yes += quote.shares;
    else position.no += quote.shares;
    position.cost += budget;
    var trade = {
      tick: sim.tick,
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      side: decision.side,
      amount: budget,
      shares: quote.shares,
      price: deal.marketProbability,
      belief: decision.belief,
      thought: decision.thought
    };
    deal.trades.unshift(trade);
    sim.events.push({
      tick: sim.tick,
      kind: "trade",
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      dealId: deal.id,
      account: deal.account,
      side: decision.side,
      amount: budget,
      belief: decision.belief,
      marketBefore: before,
      marketAfter: deal.marketProbability,
      thought: decision.thought
    });
    if (agent.id === "vp1") {
      sim.vpBroadcast = {
        dealId: deal.id,
        side: decision.side,
        impact: decision.side === "YES" ? 0.045 : -0.045,
        expiresTick: sim.tick + 6
      };
      sim.events.push({
        tick: sim.tick,
        kind: "system",
        title: "VP influence active",
        body: "Victoria's trade will nudge other agents on " + deal.account + " for the next few ticks.",
        tone: "amber"
      });
    }
    trimSimEvents(sim);
  }

  function addSimulationPublicNews(sim) {
    var unsettledDeals = activeSimDeals(sim).filter(function (deal) { return !deal.revealedOutcome; });
    var deal = unsettledDeals[Math.floor(Math.random() * unsettledDeals.length)] || sim.deals[0];
    var hidden = sim.hiddenOutcomes[deal.id];
    var driver = hidden && hidden.drivers ? hidden.drivers[Math.floor(Math.random() * hidden.drivers.length)] : publicDriverFromDeal(deal);
    var impact = driver.impact * 0.42;
    var news = {
      tick: sim.tick,
      text: "New field update: " + driver.label.toLowerCase() + ".",
      impact: impact
    };
    deal.publicNews.push(news);
    sim.events.push({
      tick: sim.tick,
      kind: "news",
      title: deal.account + " public update",
      body: news.text,
      tone: impact >= 0 ? "green" : "red"
    });
    trimSimEvents(sim);
  }

  function publicDriverFromDeal(deal) {
    var drivers = [];
    if (deal.publicSignals && deal.publicSignals.length) {
      drivers = deal.publicSignals;
    } else {
      if (deal.stage) drivers.push({ label: "stage remains " + deal.stage, impact: 0.02 });
      if (deal.procurementStatus) drivers.push({ label: "procurement is " + deal.procurementStatus, impact: statusImpact(deal.procurementStatus) });
      if (deal.legalStatus) drivers.push({ label: "legal is " + deal.legalStatus, impact: statusImpact(deal.legalStatus) });
      if (deal.securityStatus) drivers.push({ label: "security review is " + deal.securityStatus, impact: statusImpact(deal.securityStatus) });
      if (deal.nextStepQuality) drivers.push({ label: "next step quality updated to " + deal.nextStepQuality + " of 5", impact: (deal.nextStepQuality - 3) * 0.04 });
    }
    return drivers[Math.floor(Math.random() * drivers.length)] || { label: "field activity changed", impact: 0 };
  }

  function statusImpact(status) {
    if (status === "Approved" || status === "Passed" || status === "Not required") return 0.08;
    if (status === "Blocked") return -0.16;
    if (status === "In review" || status === "Review scheduled" || status === "PO requested") return 0.02;
    if (status === "Redlines pending" || status === "Questionnaire sent") return -0.06;
    return -0.02;
  }

  function quoteSimTrade(deal, side, budget) {
    var low = 0;
    var high = Math.max(1, budget / 0.02);
    for (var i = 0; i < 40; i += 1) {
      var mid = (low + high) / 2;
      var nextCost = lmsrCost(
        deal.qYes + (side === "YES" ? mid : 0),
        deal.qNo + (side === "NO" ? mid : 0),
        deal.liquidity
      );
      var currentCost = lmsrCost(deal.qYes, deal.qNo, deal.liquidity);
      if (nextCost - currentCost > budget) high = mid;
      else low = mid;
    }
    var shares = low;
    var nextQYes = deal.qYes + (side === "YES" ? shares : 0);
    var nextQNo = deal.qNo + (side === "NO" ? shares : 0);
    return { shares: shares, nextProbability: lmsrPrice(nextQYes, nextQNo, deal.liquidity) };
  }

  function getAgentSimPosition(agent, dealId) {
    if (!agent.positions[dealId]) agent.positions[dealId] = { yes: 0, no: 0, cost: 0 };
    return agent.positions[dealId];
  }

  function getPlayerSimPosition(dealId) {
    var sim = state.simulation;
    if (!sim.playerPositions[dealId]) sim.playerPositions[dealId] = { yes: 0, no: 0, cost: 0 };
    return sim.playerPositions[dealId];
  }

  function executeHumanSimTrade() {
    var sim = state.simulation;
    var deal = getSimSelectedDeal();
    if (!deal || sim.settled || sim.playerWallet < 10) return;
    var budget = clamp(Number(ui.sim.humanAmount) || 10, 10, sim.playerWallet);
    var before = deal.marketProbability;
    var quote = quoteSimTrade(deal, ui.sim.humanSide, budget);
    if (ui.sim.humanSide === "YES") deal.qYes += quote.shares;
    else deal.qNo += quote.shares;
    deal.marketProbability = lmsrPrice(deal.qYes, deal.qNo, deal.liquidity);
    deal.volume += budget;
    deal.history.push({ tick: sim.tick, probability: deal.marketProbability });
    var position = getPlayerSimPosition(deal.id);
    if (ui.sim.humanSide === "YES") position.yes += quote.shares;
    else position.no += quote.shares;
    position.cost += budget;
    sim.playerWallet -= budget;
    sim.events.push({
      tick: sim.tick,
      kind: "trade",
      agentName: "You",
      role: "Human player",
      dealId: deal.id,
      account: deal.account,
      side: ui.sim.humanSide,
      amount: budget,
      belief: ui.sim.humanSide === "YES" ? 0.99 : 0.01,
      marketBefore: before,
      marketAfter: deal.marketProbability,
      thought: "Player trade entered from the demo desk."
    });
    trimSimEvents(sim);
    saveState();
    render();
  }

  function settleSimulation() {
    var sim = state.simulation;
    if (sim.source === "supabase") {
      pauseSimulation();
      showToast("Supabase live deals keep outcomes sealed; settlement is disabled for this session.");
      return;
    }
    stopSimulationTimer();
    sim.running = false;
    sim.status = "Settled";
    sim.settled = true;
    sim.showOutcomes = true;
    activeSimDeals(sim).forEach(function (deal) {
      deal.revealedOutcome = sim.hiddenOutcomes[deal.id].outcome;
    });
    if (!sim.paidOut) {
      sim.agents.forEach(function (agent) {
        var payout = 0;
        var cost = 0;
        activeSimDeals(sim).forEach(function (deal) {
          var position = agent.positions[deal.id];
          if (position) {
            var outcome = sim.hiddenOutcomes[deal.id].outcome;
            payout += outcome ? position.yes : position.no;
            cost += position.cost;
          }
        });
        agent.pnl = payout - cost;
        agent.wallet += payout;
      });
      var playerPayout = 0;
      var playerCost = 0;
      activeSimDeals(sim).forEach(function (deal) {
        var position = sim.playerPositions[deal.id];
        if (position) {
          var outcome = sim.hiddenOutcomes[deal.id].outcome;
          playerPayout += outcome ? position.yes : position.no;
          playerCost += position.cost;
        }
      });
      sim.playerWallet += playerPayout;
      sim.playerPnl = playerPayout - playerCost;
      sim.paidOut = true;
    }
    var results = simulationResults();
    sim.events.push({
      tick: sim.tick,
      kind: "system",
      title: "Outcomes settled",
      body: "Final market price was closer than baseline on " + results.marketWins + " of " + activeSimDeals(sim).length + " active deals.",
      tone: results.marketWins >= results.baselineWins ? "green" : "amber"
    });
    trimSimEvents(sim);
    saveState();
    render();
  }

  function resetSimulation(renderAfter) {
    var count = state.simulation && state.simulation.activeDealCount ? state.simulation.activeDealCount : 5;
    stopSimulationTimer();
    state.simulation = seedSimulation(count);
    ui.sim.selectedDealId = state.simulation.deals[0].id;
    saveState();
    if (renderAfter !== false) render();
  }

  function trimSimEvents(sim) {
    if (sim.events.length > 120) sim.events = sim.events.slice(sim.events.length - 120);
  }

  function loadSupabaseLiveDeals() {
    if (!window.fetch || window.location.protocol === "file:") {
      showToast("Run node server.js and open http://127.0.0.1:4173 to load Supabase deals.");
      return;
    }
    var count = state.simulation.activeDealCount || 5;
    stopSimulationTimer();
    ui.sim.loadingSupabase = true;
    state.simulation.status = "Loading Supabase live deals";
    render();
    window.fetch("/api/live-deals?limit=" + encodeURIComponent(count))
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.error || "Supabase live deal load failed");
          });
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload.deals || !payload.deals.length) throw new Error("No Supabase live deals returned.");
        state.simulation = simulationFromSupabaseDeals(payload.deals, count);
        ui.sim.selectedDealId = state.simulation.deals[0].id;
        saveState();
        showToast("Loaded " + payload.deals.length + " Supabase live deal" + (payload.deals.length === 1 ? "" : "s") + ".");
      })
      .catch(function (error) {
        state.simulation.status = "Supabase load failed";
        showToast(error.message || "Could not load Supabase live deals.");
      })
      .finally(function () {
        ui.sim.loadingSupabase = false;
        render();
      });
  }

  function simulationFromSupabaseDeals(rows, activeDealCount) {
    var sim = seedSimulation(activeDealCount);
    sim.source = "supabase";
    sim.tick = 0;
    sim.running = false;
    sim.settled = false;
    sim.showOutcomes = false;
    sim.paidOut = false;
    sim.activeDealCount = activeDealCount;
    sim.maxTicks = simTicksForCount(activeDealCount);
    sim.playerWallet = 1600;
    sim.playerPositions = {};
    sim.hiddenOutcomes = {};
    sim.deals = rows.map(function (row, index) {
      return mapSupabaseLiveDeal(row, index);
    });
    sim.events = [{
      tick: 0,
      kind: "system",
      title: "Supabase live deals loaded",
      body: rows.length + " live deals loaded from agent_sim_live_deals. Hidden outcomes remain sealed in Supabase.",
      tone: "green"
    }];
    sim.status = "Ready with Supabase live deals";
    return sim;
  }

  function mapSupabaseLiveDeal(row, index) {
    var payload = row.observable_payload || {};
    var baseline = baselineFromSupabase(row.baseline_probabilities || {}, payload);
    var q = qFromProbability(baseline, 520);
    var account = payload.account_name || row.deal_id || "Supabase deal " + (index + 1);
    var deal = {
      id: row.deal_id || row.live_deal_id || "supabase_" + index,
      liveDealId: row.live_deal_id,
      account: account,
      question: row.market_question || ("Will " + account + " close-won?"),
      amount: Number(payload.deal_amount_arr || 0),
      stage: payload.crm_stage || "Unknown",
      segment: payload.account_segment || "Unknown",
      region: payload.region || "Unknown",
      productLine: payload.product_line || "Unknown",
      closeDate: payload.close_date || "",
      baselineProbability: baseline,
      marketProbability: baseline,
      qYes: q.yes,
      qNo: q.no,
      liquidity: 520,
      volume: 0,
      participants: 0,
      publicNews: [],
      trades: [],
      history: [{ tick: 0, probability: baseline }],
      privateSignals: privateSignalsFromSupabase(row.agent_private_signal_seed || {}, payload),
      publicSignals: publicSignalsFromPayload(payload),
      revealedOutcome: null
    };
    return deal;
  }

  function baselineFromSupabase(probabilities, payload) {
    var value = probabilities.closed_won;
    if (value === null || value === undefined) value = payload.crm_model_probability;
    if (value === null || value === undefined) value = stageProbability(payload.crm_stage || "");
    return clamp(Number(value) || 0.5, 0.03, 0.97);
  }

  function privateSignalsFromSupabase(seed, payload) {
    var roleToAgents = {
      AE: ["ae1", "ae2", "ae3"],
      BDR: ["bdr1"],
      SE: ["se1"],
      VP: ["vp1"]
    };
    var signals = {};
    Object.keys(roleToAgents).forEach(function (role) {
      var fragments = seed[role] || [];
      roleToAgents[role].forEach(function (agentId, agentIndex) {
        signals[agentId] = fragments.map(function (fragment, index) {
          return signalFromFragment(role, fragment, payload, index + agentIndex);
        });
      });
    });
    return signals;
  }

  function signalFromFragment(role, fragment, payload, offset) {
    var impact = 0;
    var text = role + " signal: " + String(fragment).replace(/_/g, " ") + ".";
    if (/budget|champion|executive|intent|tone|next-step|next step|technical validation/i.test(fragment)) impact += 0.08;
    if (/security blocker|integration risk|buyer politics|forecast pressure/i.test(fragment)) impact -= 0.07;
    if (payload.budget_confirmed === true) impact += 0.05;
    if (payload.economic_buyer_identified === true) impact += 0.04;
    if (payload.security_review_status === "Blocked") impact -= 0.12;
    if (payload.procurement_status === "Blocked") impact -= 0.12;
    if (payload.legal_status === "Blocked") impact -= 0.10;
    impact += ((offset % 3) - 1) * 0.015;
    return {
      text: text,
      impact: clamp(impact, -0.18, 0.18),
      confidence: 0.58 + (offset % 4) * 0.08,
      shared: offset % 2 === 0
    };
  }

  function publicSignalsFromPayload(payload) {
    var signals = [];
    if (payload.budget_confirmed === true) signals.push({ label: "budget is confirmed", impact: 0.12 });
    if (payload.economic_buyer_identified === true) signals.push({ label: "economic buyer is identified", impact: 0.10 });
    if (payload.security_review_status) signals.push({ label: "security review is " + payload.security_review_status, impact: statusImpact(payload.security_review_status) });
    if (payload.legal_status) signals.push({ label: "legal status is " + payload.legal_status, impact: statusImpact(payload.legal_status) });
    if (payload.procurement_status) signals.push({ label: "procurement status is " + payload.procurement_status, impact: statusImpact(payload.procurement_status) });
    if (payload.close_date_change_count) signals.push({ label: "close date has moved " + payload.close_date_change_count + " time(s)", impact: -0.05 * Number(payload.close_date_change_count) });
    if (payload.buyer_sentiment_score !== null && payload.buyer_sentiment_score !== undefined) signals.push({ label: "buyer sentiment score is " + payload.buyer_sentiment_score, impact: (Number(payload.buyer_sentiment_score) - 0.5) * 0.16 });
    return signals;
  }

  function renderLeaderboard() {
    var users = state.users.slice().sort(function (a, b) {
      return a.brier - b.brier;
    });
    return [
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Calibration first</div><div class="panel-subtitle">Lower Brier score ranks ahead of raw profit to reward honest probability estimates</div></div><span class="pill teal">Synthetic personas</span></div></section>',
      '<section class="table-shell">',
      '<table class="data-table">',
      '<thead><tr><th>Rank</th><th>User</th><th>Role</th><th>Specialty</th><th>Brier score</th><th>Virtual P&L</th><th>Forecasts</th><th>Markets</th><th>Recent accuracy</th></tr></thead>',
      '<tbody>',
      users.map(function (user, index) {
        return [
          '<tr>',
          '<td class="leader-rank">#' + (index + 1) + '</td>',
          '<td><div class="deal-title">' + escapeHtml(user.name) + '</div><div class="deal-meta">' + (user.id === CURRENT_USER_ID ? "Current user" : "Participant") + '</div></td>',
          '<td>' + escapeHtml(user.role) + '</td>',
          '<td>' + escapeHtml(user.specialty) + '</td>',
          '<td><span class="pill ' + (user.brier < 0.13 ? "green" : user.brier < 0.16 ? "amber" : "blue") + '">' + user.brier.toFixed(3) + '</span></td>',
          '<td class="delta ' + (user.pnl >= 0 ? "up" : "down") + '">' + formatSignedNumber(user.pnl) + '</td>',
          '<td>' + user.trades + '</td>',
          '<td>' + user.markets + '</td>',
          '<td>' + escapeHtml(user.accuracy) + '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table>',
      '</section>'
    ].join("");
  }

  function renderAdmin() {
    var opportunity = state.opportunities.find(function (opp) { return opp.id === ui.admin.opportunityId; }) || state.opportunities[0];
    if (!opportunity) return '<div class="empty-state">No synthetic CRM opportunities remain.</div>';
    var resolution = ui.admin.resolutionRule || defaultResolutionRule(ui.admin.template, ui.admin.targetDate, Number(ui.admin.threshold) || opportunity.amount);
    return [
      '<div class="admin-grid">',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">Create market</div><div class="panel-subtitle">Instantiate a private market from a synthetic CRM opportunity</div></div></div><div class="panel-body">',
      '<div class="form-grid">',
      field("Opportunity", '<select class="select" data-admin="opportunityId">' + state.opportunities.map(function (opp) { return '<option value="' + opp.id + '"' + (opp.id === opportunity.id ? " selected" : "") + '>' + escapeHtml(opp.account + " | " + formatCurrency(opp.amount)) + '</option>'; }).join("") + '</select>'),
      field("Market template", '<select class="select" data-admin="template">' + marketTypes.map(function (type) { return '<option value="' + type[0] + '"' + (ui.admin.template === type[0] ? " selected" : "") + '>' + escapeHtml(type[1]) + '</option>'; }).join("") + '</select>'),
      field("Target date", '<input class="input" type="date" data-admin="targetDate" value="' + escapeAttr(ui.admin.targetDate) + '" />'),
      field("Amount threshold", '<input class="input" type="number" data-admin="threshold" value="' + escapeAttr(ui.admin.threshold) + '" />'),
      field("Access controls", '<select class="select" data-admin="access"><option' + selected(ui.admin.access, "Account team plus leadership") + '>Account team plus leadership</option><option' + selected(ui.admin.access, "Revenue org") + '>Revenue org</option><option' + selected(ui.admin.access, "Account team") + '>Account team</option></select>'),
      field("Resolution rule", '<textarea class="textarea" data-admin="resolutionRule">' + escapeHtml(resolution) + '</textarea>', true),
      '</div>',
      '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="primary-button" data-action="create-market">Create market</button><button class="secondary-button" data-action="prefill-rule">Use default rule</button></div>',
      '</div></section>',
      '<section class="panel"><div class="panel-header"><div><div class="panel-title">CRM preview</div><div class="panel-subtitle">Synthetic opportunity selected for market creation</div></div></div><div class="panel-body">' + renderOpportunityPreview(opportunity, resolution) + '</div></section>',
      '</div>'
    ].join("");
  }

  function field(label, control, full) {
    return '<div class="field ' + (full ? "full" : "") + '"><label>' + label + '</label>' + control + '</div>';
  }

  function selected(current, value) {
    return current === value ? " selected" : "";
  }

  function renderOpportunityPreview(opp, resolution) {
    var question = makeQuestion(ui.admin.template, opp.account, ui.admin.targetDate, Number(ui.admin.threshold) || opp.amount);
    return [
      '<div class="market-question" style="font-size:21px">' + escapeHtml(question) + '</div>',
      '<div class="context-grid" style="margin-top:18px">',
      kv("Account", opp.account),
      kv("Amount", formatCurrency(opp.amount)),
      kv("Stage", opp.stage),
      kv("Close date", formatShortDate(opp.closeDate)),
      kv("Owner", opp.owner),
      kv("Region / segment", opp.region + " / " + opp.segment),
      kv("Product", opp.productLine),
      kv("Forecast category", opp.forecastCategory),
      '</div>',
      '<div class="alert" style="margin-top:18px"><div class="alert-title">Resolution rule</div><div class="alert-body">' + escapeHtml(resolution) + '</div></div>'
    ].join("");
  }

  function filteredMarkets() {
    var search = ui.filters.search.trim().toLowerCase();
    return state.markets.filter(function (market) {
      if (search && !(market.account + " " + market.title + " " + market.question).toLowerCase().includes(search)) return false;
      if (ui.filters.quarter !== "All" && market.quarter !== ui.filters.quarter) return false;
      if (ui.filters.region !== "All" && market.region !== ui.filters.region) return false;
      if (ui.filters.segment !== "All" && market.segment !== ui.filters.segment) return false;
      if (ui.filters.owner !== "All" && market.owner !== ui.filters.owner) return false;
      if (ui.filters.stage !== "All" && market.stage !== ui.filters.stage) return false;
      if (ui.filters.forecastCategory !== "All" && market.forecastCategory !== ui.filters.forecastCategory) return false;
      if (ui.filters.marketType !== "All" && market.type !== ui.filters.marketType) return false;
      return true;
    });
  }

  function activeMarkets() {
    return state.markets.filter(function (market) {
      return market.outcomeStatus === "Active";
    });
  }

  function highRiskDeals() {
    return activeMarkets().filter(function (market) {
      return Math.max(market.repProbability, market.crmProbability) - market.marketProbability >= 0.18;
    }).sort(function (a, b) {
      return (Math.max(b.repProbability, b.crmProbability) - b.marketProbability) - (Math.max(a.repProbability, a.crmProbability) - a.marketProbability);
    });
  }

  function marketImpliedForecast() {
    return sum(activeMarkets(), function (market) {
      return market.amount * market.marketProbability;
    });
  }

  function getCurrentUser() {
    return state.users.find(function (user) { return user.id === CURRENT_USER_ID; }) || state.users[0];
  }

  function getSelectedMarket() {
    return state.markets.find(function (market) { return market.id === ui.selectedMarketId; }) || state.markets[0];
  }

  function getPosition(marketId) {
    if (!state.positions[marketId]) state.positions[marketId] = { yes: 0, no: 0, cost: 0 };
    return state.positions[marketId];
  }

  function quoteTrade(market, side, budget) {
    var b = market.liquidity;
    var low = 0;
    var high = Math.max(1, budget / 0.02);
    for (var i = 0; i < 40; i += 1) {
      var mid = (low + high) / 2;
      var cost = lmsrCostAfter(market, side, mid) - lmsrCost(market.qYes, market.qNo, b);
      if (cost > budget) high = mid;
      else low = mid;
    }
    var shares = low;
    var nextQYes = market.qYes + (side === "YES" ? shares : 0);
    var nextQNo = market.qNo + (side === "NO" ? shares : 0);
    return {
      shares: shares,
      nextProbability: lmsrPrice(nextQYes, nextQNo, b)
    };
  }

  function lmsrCostAfter(market, side, shares) {
    return lmsrCost(
      market.qYes + (side === "YES" ? shares : 0),
      market.qNo + (side === "NO" ? shares : 0),
      market.liquidity
    );
  }

  function lmsrCost(qYes, qNo, b) {
    var maxQ = Math.max(qYes, qNo);
    return b * (maxQ / b + Math.log(Math.exp((qYes - maxQ) / b) + Math.exp((qNo - maxQ) / b)));
  }

  function lmsrPrice(qYes, qNo, b) {
    var yes = Math.exp(qYes / b);
    var no = Math.exp(qNo / b);
    return yes / (yes + no);
  }

  function executeTrade() {
    var market = getSelectedMarket();
    if (!market || market.outcomeStatus !== "Active") return;
    var budget = clamp(Number(ui.tradeAmount) || 0, 10, state.wallet);
    if (state.wallet < budget) {
      showToast("Insufficient credits for that forecast.");
      return;
    }
    var side = ui.tradeSide;
    var quote = quoteTrade(market, side, budget);
    if (side === "YES") market.qYes += quote.shares;
    else market.qNo += quote.shares;
    market.marketProbability = lmsrPrice(market.qYes, market.qNo, market.liquidity);
    market.volume += budget;
    market.participants = Math.max(market.participants, market.participants + (Math.random() > 0.78 ? 1 : 0));
    state.wallet -= budget;
    var position = getPosition(market.id);
    if (side === "YES") position.yes += quote.shares;
    else position.no += quote.shares;
    position.cost += budget;
    var currentUser = getCurrentUser();
    market.trades.unshift({
      id: "trade-" + Date.now(),
      userId: currentUser.id,
      user: currentUser.name,
      role: currentUser.role,
      side: side,
      credits: budget,
      price: market.marketProbability,
      time: "Just now"
    });
    market.probabilityHistory.push({
      date: "Now",
      probability: market.marketProbability
    });
    if (market.probabilityHistory.length > 31) market.probabilityHistory.shift();
    market.alerts = makeAlerts(market.type, market.marketProbability, market.repProbability, market.legalStatus, market.securityStatus, market.procurementStatus);
    saveState();
    showToast("Forecast added: " + quote.shares.toFixed(2) + " " + side + " shares in " + market.account + ".");
  }

  function addComment() {
    var textarea = app.querySelector('[data-input="comment"]');
    var body = textarea ? textarea.value.trim() : "";
    if (!body) {
      showToast("Add a short rationale before submitting.");
      return;
    }
    var market = getSelectedMarket();
    var currentUser = getCurrentUser();
    market.comments.unshift({
      id: "comment-" + Date.now(),
      user: currentUser.name,
      role: currentUser.role,
      body: body,
      time: "Just now"
    });
    saveState();
    showToast("Rationale added to " + market.account + ".");
  }

  function createMarket() {
    var opportunity = state.opportunities.find(function (opp) { return opp.id === ui.admin.opportunityId; });
    if (!opportunity) return;
    var amount = Number(ui.admin.threshold) || opportunity.amount;
    var baseProbability = clamp(stageProbability(opportunity.stage) + 0.04, 0.08, 0.88);
    if (ui.admin.template === "SLIP_TO_NEXT_QUARTER") baseProbability = 1 - baseProbability;
    var b = 560;
    var q = qFromProbability(baseProbability, b);
    var market = {
      id: "m" + pad(state.markets.length + 1, 3),
      opportunityId: opportunity.id,
      account: opportunity.account,
      question: makeQuestion(ui.admin.template, opportunity.account, ui.admin.targetDate, amount),
      title: makeShortTitle(ui.admin.template, opportunity.account),
      type: ui.admin.template,
      amount: opportunity.amount,
      closeDate: opportunity.closeDate,
      originalCloseDate: opportunity.closeDate,
      quarter: dateToQuarter(opportunity.closeDate),
      owner: opportunity.owner,
      ownerId: "",
      region: opportunity.region,
      segment: opportunity.segment,
      productLine: opportunity.productLine,
      stage: opportunity.stage,
      forecastCategory: opportunity.forecastCategory,
      nextStep: "Market created from synthetic CRM opportunity",
      championStrength: "Developing",
      economicBuyerIdentified: true,
      decisionCriteria: "Forecast accuracy, business case, procurement timing",
      legalStatus: "Not started",
      securityStatus: "Questionnaire sent",
      procurementStatus: "Not started",
      competitor: "No decision",
      lastActivityDate: "2026-05-08",
      buyerStakeholders: ["CRO", "VP Sales Ops", "Procurement Manager"],
      repProbability: baseProbability + 0.08,
      crmProbability: baseProbability,
      marketProbability: baseProbability,
      probabilityHistory: makeHistory(baseProbability, mulberry32(Date.now() % 100000), 31),
      qYes: q.yes,
      qNo: q.no,
      liquidity: b,
      volume: 0,
      trades: [],
      comments: [],
      outcomeStatus: "Active",
      participants: 0,
      access: ui.admin.access,
      resolutionRule: ui.admin.resolutionRule || defaultResolutionRule(ui.admin.template, ui.admin.targetDate, amount),
      alerts: []
    };
    market.alerts = makeAlerts(market.type, market.marketProbability, market.repProbability, market.legalStatus, market.securityStatus, market.procurementStatus);
    state.markets.unshift(market);
    state.opportunities = state.opportunities.filter(function (opp) { return opp.id !== opportunity.id; });
    ui.selectedMarketId = market.id;
    ui.view = "detail";
    ui.admin.opportunityId = state.opportunities[0] ? state.opportunities[0].id : "";
    saveState();
    showToast("Created market for " + market.account + ".");
  }

  function prefillDefaultRule() {
    var opportunity = state.opportunities.find(function (opp) { return opp.id === ui.admin.opportunityId; }) || state.opportunities[0];
    ui.admin.resolutionRule = defaultResolutionRule(ui.admin.template, ui.admin.targetDate, Number(ui.admin.threshold) || (opportunity ? opportunity.amount : 0));
    render();
  }

  function showToast(message) {
    ui.toast = message;
    render();
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      ui.toast = "";
      render();
    }, 2600);
  }

  function resetDemo() {
    if (!window.confirm("Reset the synthetic demo data and clear local forecasts?")) return;
    stopSimulationTimer();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn(error);
    }
    state = seedState();
    ensureStateShape();
    ui.selectedMarketId = state.markets[0].id;
    ui.sim.selectedDealId = state.simulation.deals[0].id;
    ui.game.pendingActions = {};
    ui.view = "simulation";
    saveState();
    showToast("Demo data reset.");
  }

  function probStack(probability, riskTone) {
    return '<div class="prob-stack"><div class="prob-label-row"><span>YES</span><strong>' + formatPercent(probability) + '</strong></div><div class="prob-bar"><div class="prob-fill ' + (riskTone ? "risk" : "") + '" style="width:' + Math.round(probability * 100) + '%"></div></div></div>';
  }

  function recentMove(market) {
    var history = market.probabilityHistory;
    if (history.length < 8) return 0;
    return history[history.length - 1].probability - history[history.length - 8].probability;
  }

  function typeLabel(type) {
    var found = marketTypes.find(function (item) { return item[0] === type; });
    return found ? found[1] : type;
  }

  function forecastClass(category) {
    if (category === "Commit") return "green";
    if (category === "Best Case") return "blue";
    if (category === "Omitted") return "red";
    return "amber";
  }

  function statusClass(status) {
    if (status === "Active") return "green";
    if (status.indexOf("won") >= 0) return "blue";
    if (status.indexOf("lost") >= 0) return "red";
    return "amber";
  }

  function sum(list, mapper) {
    return list.reduce(function (total, item) {
      return total + mapper(item);
    }, 0);
  }

  function svgPath(points, key, width, height, padX, padY, min, max) {
    return points.map(function (point, index) {
      var x = padX + (index / (points.length - 1)) * (width - padX - 16);
      var y = mapY(point[key], height, padY, min, max);
      return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
  }

  function mapY(value, height, padY, min, max) {
    var range = max - min || 1;
    return height - padY - ((value - min) / range) * (height - padY * 2);
  }

  function gridLine(x1, y1, x2, y2) {
    return '<line class="chart-grid" x1="' + x1 + '" y1="' + y1.toFixed(1) + '" x2="' + x2 + '" y2="' + y2.toFixed(1) + '"></line>';
  }

  function formatCurrency(value) {
    var abs = Math.abs(value);
    if (abs >= 1000000) return "$" + (value / 1000000).toFixed(1) + "M";
    if (abs >= 1000) return "$" + Math.round(value / 1000) + "k";
    return "$" + Math.round(value);
  }

  function formatCurrencyShort(value) {
    return formatCurrency(value);
  }

  function formatPercent(value) {
    return Math.round(value * 100) + "%";
  }

  function formatSignedPercent(value) {
    return (value >= 0 ? "+" : "") + Math.round(value * 100) + " pts";
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatSignedNumber(value) {
    var rounded = Math.round(value);
    return (rounded >= 0 ? "+" : "") + rounded.toLocaleString("en-US");
  }

  function formatShortDate(dateString) {
    if (!dateString) return "";
    if (dateString === "Now") return "Now";
    var date = new Date(dateString + "T12:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  document.addEventListener("click", function (event) {
    var viewTarget = event.target.closest("[data-view]");
    if (viewTarget) {
      ui.view = viewTarget.getAttribute("data-view");
      render();
      return;
    }
    var actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    var action = actionTarget.getAttribute("data-action");
    if (action === "open-market") {
      ui.selectedMarketId = actionTarget.getAttribute("data-id");
      ui.view = "detail";
      render();
    }
    if (action === "trade-side") {
      ui.tradeSide = actionTarget.getAttribute("data-side");
      render();
    }
    if (action === "execute-trade") executeTrade();
    if (action === "add-comment") addComment();
    if (action === "create-market") createMarket();
    if (action === "prefill-rule") prefillDefaultRule();
    if (action === "reset-demo") resetDemo();
    if (action === "onboarding-replay") {
      replayOnboarding();
      return;
    }
    if (action === "onboarding-close") {
      closeOnboarding();
      return;
    }
    if (action === "onboarding-next") {
      ui.onboardingStep = Math.min(onboardingCards().length - 1, Number(ui.onboardingStep || 0) + 1);
      render();
      return;
    }
    if (action === "onboarding-prev") {
      ui.onboardingStep = Math.max(0, Number(ui.onboardingStep || 0) - 1);
      render();
      return;
    }
    if (action === "game-mode") {
      ui.game.mode = actionTarget.getAttribute("data-mode") || "team";
      render();
      return;
    }
    if (action === "game-count") {
      ui.game.dealCount = Number(actionTarget.getAttribute("data-count")) || 3;
      render();
      return;
    }
    if (action === "game-days") {
      ui.game.maxDays = Number(actionTarget.getAttribute("data-days")) || 30;
      render();
      return;
    }
    if (action === "game-start") {
      startGameRun();
      return;
    }
    if (action === "game-advanced") {
      ui.game.advancedSetup = true;
      ui.game.autoStartAttempted = true;
      state.game.session = null;
      resetPendingGameActions(null);
      saveState();
      render();
      return;
    }
    if (action === "game-new") {
      ui.game.advancedSetup = true;
      ui.game.autoStartAttempted = true;
      state.game.session = null;
      resetPendingGameActions(null);
      saveState();
      render();
      return;
    }
    if (action === "game-refresh") {
      refreshGameRun();
      return;
    }
    if (action === "game-set-action") {
      var dealId = actionTarget.getAttribute("data-deal");
      getPendingGameAction(dealId).action = actionTarget.getAttribute("data-choice");
      render();
      return;
    }
    if (action === "game-set-stake") {
      var stakeDealId = actionTarget.getAttribute("data-deal");
      getPendingGameAction(stakeDealId).stake = Number(actionTarget.getAttribute("data-stake")) || 50;
      render();
      return;
    }
    if (action === "game-submit-day") {
      submitGameDay();
      return;
    }
    if (action === "open-lr-report") {
      window.location.href = "/?view=lr-report";
      return;
    }
    if (action === "sim-start") startSimulation();
    if (action === "sim-pause") pauseSimulation();
    if (action === "sim-step") runSimulationRound();
    if (action === "sim-settle") settleSimulation();
    if (action === "sim-reset") resetSimulation(true);
    if (action === "sim-load-supabase") loadSupabaseLiveDeals();
    if (action === "sim-count") setSimulationDealCount(actionTarget.getAttribute("data-count"));
    if (action === "sim-select-deal") {
      ui.sim.selectedDealId = actionTarget.getAttribute("data-id");
      render();
    }
    if (action === "sim-human-side") {
      ui.sim.humanSide = actionTarget.getAttribute("data-side");
      render();
    }
    if (action === "sim-human-trade") executeHumanSimTrade();
  });

  document.addEventListener("input", function (event) {
    var filter = event.target.getAttribute("data-filter");
    if (filter) {
      ui.filters[filter] = event.target.value;
      render();
      return;
    }
    var input = event.target.getAttribute("data-input");
    if (input === "tradeAmount") {
      ui.tradeAmount = event.target.value;
      render();
    }
    var probabilityDealId = event.target.getAttribute("data-game-probability");
    if (probabilityDealId) {
      getPendingGameAction(probabilityDealId).probability = clamp(Number(event.target.value) || 0, 0, 100);
      render();
      return;
    }
    var admin = event.target.getAttribute("data-admin");
    if (admin) {
      ui.admin[admin] = event.target.value;
      if (admin !== "resolutionRule") ui.admin.resolutionRule = "";
      render();
    }
    var simInput = event.target.getAttribute("data-sim");
    if (simInput) {
      if (simInput === "llmMode") ui.sim.llmMode = event.target.checked;
      else ui.sim[simInput] = event.target.value;
      render();
    }
  });

  document.addEventListener("change", function (event) {
    var filter = event.target.getAttribute("data-filter");
    if (filter) {
      ui.filters[filter] = event.target.value;
      render();
      return;
    }
    var admin = event.target.getAttribute("data-admin");
    if (admin) {
      ui.admin[admin] = event.target.value;
      if (admin !== "resolutionRule") ui.admin.resolutionRule = "";
      render();
    }
    var simInput = event.target.getAttribute("data-sim");
    if (simInput) {
      if (simInput === "llmMode") ui.sim.llmMode = event.target.checked;
      else ui.sim[simInput] = event.target.value;
      render();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && ui.showOnboarding) {
      closeOnboarding();
    }
  });

  render();
})();
