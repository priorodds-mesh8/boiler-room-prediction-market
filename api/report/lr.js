const fs = require("fs");
const path = require("path");
const { sendJson } = require("../_utils");

const ROOT = path.resolve(__dirname, "../..");
const CORPUS_PATH = path.join(ROOT, "data", "generated", "corpus", "lr_test_input.json");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!fs.existsSync(CORPUS_PATH)) {
    sendJson(res, 503, { error: "LR-test corpus is missing. Run scripts/seed_demo_corpus.js first." });
    return;
  }
  try {
    const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
    const rows = Array.isArray(corpus.rows) ? corpus.rows : [];
    if (!rows.length) {
      sendJson(res, 503, { error: "LR-test corpus is empty. Run scripts/seed_demo_corpus.js first." });
      return;
    }
    const result = computeReport(rows);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unable to compute LR report" });
  }
};

function computeReport(rows) {
  const logL_ml = logLikelihood(rows, "ml_prob");
  const logL_market = logLikelihood(rows, "market_prob");
  const lr = 2 * (logL_market - logL_ml);
  const p = erfc(Math.sqrt(Math.abs(lr) / 2));
  const ci = bootstrapCi(rows, 1000);
  return {
    n: rows.length,
    logL_ml,
    logL_market,
    lr,
    p,
    ci,
    calibrationBins: {
      ml: calibrationBins(rows, "ml_prob", 10),
      market: calibrationBins(rows, "market_prob", 10),
      fng: calibrationBins(rows, "fng_prob", 10)
    },
    verdict: verdict(rows.length, lr, p, ci)
  };
}

function logLikelihood(rows, key) {
  return rows.reduce((sum, row) => {
    const p = clamp(Number(row[key]), 1e-6, 1 - 1e-6);
    const y = Number(row.outcome) ? 1 : 0;
    return sum + y * Math.log(p) + (1 - y) * Math.log(1 - p);
  }, 0);
}

function bootstrapCi(rows, iterations) {
  const values = [];
  let seed = 9120522;
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let j = 0; j < rows.length; j += 1) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      sample.push(rows[seed % rows.length]);
    }
    values.push(2 * (logLikelihood(sample, "market_prob") - logLikelihood(sample, "ml_prob")));
  }
  values.sort((a, b) => a - b);
  return [values[Math.floor(iterations * 0.025)], values[Math.floor(iterations * 0.975)]];
}

function calibrationBins(rows, key, binCount) {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    binStart: index / binCount,
    binEnd: (index + 1) / binCount,
    n: 0,
    totalPredicted: 0,
    totalActual: 0,
    meanPredicted: null,
    meanActual: null
  }));
  rows.forEach(row => {
    const p = clamp(Number(row[key]), 0, 1);
    const index = Math.min(binCount - 1, Math.floor(p * binCount));
    bins[index].n += 1;
    bins[index].totalPredicted += p;
    bins[index].totalActual += Number(row.outcome) ? 1 : 0;
  });
  return bins.map(bin => {
    if (bin.n) {
      bin.meanPredicted = bin.totalPredicted / bin.n;
      bin.meanActual = bin.totalActual / bin.n;
    }
    delete bin.totalPredicted;
    delete bin.totalActual;
    return bin;
  });
}

function verdict(n, lr, p, ci) {
  const pText = p < 0.001 ? "<0.001" : p.toFixed(3);
  if (p < 0.05 && lr > 0) return `On ${n} settled deals, the market adds information beyond the ML baseline (LR = ${lr.toFixed(1)}, p = ${pText}, 95% CI [${ci[0].toFixed(1)}, ${ci[1].toFixed(1)}]).`;
  if (p < 0.05 && lr < 0) return `On ${n} settled deals, the ML baseline is sharper than the market (LR = ${lr.toFixed(1)}, p = ${pText}). Investigate why the crowd is mispriced.`;
  return `On ${n} settled deals, no significant difference between market and ML baseline (LR = ${lr.toFixed(1)}, p = ${pText}). Need more data.`;
}

function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r = t * Math.exp(-z * z - 1.26551223
    + t * (1.00002368
    + t * (0.37409196
    + t * (0.09678418
    + t * (-0.18628806
    + t * (0.27886807
    + t * (-1.13520398
    + t * (1.48851587
    + t * (-0.82215223
    + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}
