const fs = require("fs");

const DEFAULT_ENV_PATH = "/Users/joellang/.env";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function demoPassword() {
  return process.env.BOILER_ROOM_DEMO_PASSWORD || "";
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function supabaseConfig() {
  const values = loadEnv(DEFAULT_ENV_PATH);
  const url = (
    values.supabase_url ||
    values.next_public_supabase_url ||
    values.vite_supabase_url ||
    values.project_url ||
    values.proj_url ||
    ""
  ).replace(/\/$/, "");
  const key = (
    values.supabase_service_role_key ||
    values.service_role_key ||
    values.api_secret_key ||
    values.supabase_secret_key ||
    values.supabase_anon_key ||
    values.api_key ||
    ""
  );
  return { url, key };
}

function loadEnv(filePath) {
  const values = {};
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.includes("=") ? "=" : line.includes(":") ? ":" : null;
      if (!separator) continue;
      const index = line.indexOf(separator);
      const key = normalizeEnvKey(line.slice(0, index));
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && value) values[key] = value;
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    values[normalizeEnvKey(key)] = value;
  }
  return values;
}

function normalizeEnvKey(key) {
  return String(key)
    .trim()
    .replace(/^export\s+/i, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function safeLiveDeal(row) {
  return {
    live_deal_id: row.live_deal_id,
    deal_id: row.deal_id,
    market_question: row.market_question,
    baseline_probabilities: row.baseline_probabilities || {},
    observable_payload: row.observable_payload || {},
    agent_private_signal_seed: row.agent_private_signal_seed || {}
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function findOutputText(response) {
  const output = response.output || [];
  for (const item of output) {
    const content = item.content || [];
    for (const contentItem of content) {
      if (contentItem.type === "output_text" && contentItem.text) return contentItem.text;
    }
  }
  return "{}";
}

module.exports = {
  clampInteger,
  demoPassword,
  findOutputText,
  loadEnv,
  readJson,
  safeLiveDeal,
  sendJson,
  supabaseConfig
};
