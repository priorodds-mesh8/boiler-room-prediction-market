#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sessionId") {
      args.sessionId = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickLiveDealIds(seedConfig, sessionId) {
  const ids = Array.isArray(seedConfig.liveDealIds) ? seedConfig.liveDealIds.slice() : [];
  const count = Number(seedConfig.dealCount) || 3;
  if (!ids.length) return [];

  const offset = hashString(`${seedConfig.seed || ""}:${sessionId || ""}`) % ids.length;
  const picked = [];
  for (let i = 0; i < ids.length && picked.length < count; i += 1) {
    picked.push(ids[(offset + i) % ids.length]);
  }
  return picked;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.warn("Usage: node scripts/load_demo_seed.js --sessionId <id>");
    process.exit(0);
  }

  const seedPath = path.join(__dirname, "demo_seed.json");
  const seedConfig = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const liveDealIds = pickLiveDealIds(seedConfig, args.sessionId || "demo");

  process.stdout.write(
    `${JSON.stringify({
      mode: seedConfig.mode,
      dealCount: seedConfig.dealCount,
      maxDays: seedConfig.maxDays,
      seed: seedConfig.seed,
      sessionId: args.sessionId || null,
      liveDealIds,
    }, null, 2)}\n`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  pickLiveDealIds,
};
