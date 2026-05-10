const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const defaultEnvPath = "/Users/joellang/.env";
const gameStartHandler = require("./api/game/start");
const gameSessionHandler = require("./api/game/session");
const gameActionsHandler = require("./api/game/actions");
const gameResultsHandler = require("./api/game/results");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "POST" && req.url === "/api/agent-decision") {
      await handleAgentDecision(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/live-deals") {
      await handleLiveDeals(req, res, url);
      return;
    }

    if (url.pathname === "/api/game/start") {
      await gameStartHandler(req, res);
      return;
    }

    if (url.pathname === "/api/game/session") {
      await gameSessionHandler(req, res);
      return;
    }

    if (url.pathname === "/api/game/actions") {
      await gameActionsHandler(req, res);
      return;
    }

    if (url.pathname === "/api/game/results") {
      await gameResultsHandler(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const requestedPath = decodeURIComponent(url.pathname);
    const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
    const filePath = path.normalize(path.join(root, safePath));
    if (!filePath.startsWith(root)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      if (req.method === "HEAD") res.end();
      else res.end(content);
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Boiler Room demo server running at http://127.0.0.1:${port}`);
});

async function handleAgentDecision(req, res) {
  const apiKey = process.env.OPENAI_API_KEY || loadEnv(defaultEnvPath).openai_api_key;
  if (!apiKey) {
    sendJson(res, 501, { error: "OPENAI_API_KEY is not set; frontend will use the local persona engine." });
    return;
  }

  const body = await readJson(req);
  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4.1",
    instructions: [
      "You are one autonomous sales-org prediction market trader.",
      "You are profit motivated and rational, but you may express mild personality and limited irrationality.",
      "You must not know or infer sealed outcomes with certainty. Use only the public deal fields, public news, and private signals provided.",
      "Return only the structured JSON decision. The thought is a public trade rationale, not hidden chain-of-thought.",
      "Allowed swear words, sparingly: damn, shit. Do not use other profanity."
    ].join(" "),
    input: JSON.stringify(body),
    text: {
      format: {
        type: "json_schema",
        name: "agent_trade_decision",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["TRADE", "HOLD"] },
            dealId: { type: "string" },
            side: { type: "string", enum: ["YES", "NO"] },
            amount: { type: "number", minimum: 0, maximum: 600 },
            belief: { type: "number", minimum: 0, maximum: 1 },
            thought: { type: "string", maxLength: 220 }
          },
          required: ["action", "dealId", "side", "amount", "belief", "thought"]
        }
      }
    },
    max_output_tokens: 320
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    sendJson(res, response.status, { error: data.error && data.error.message ? data.error.message : "OpenAI request failed" });
    return;
  }

  const text = data.output_text || findOutputText(data);
  try {
    sendJson(res, 200, JSON.parse(text));
  } catch (error) {
    sendJson(res, 502, { error: "Model did not return parseable JSON", raw: text });
  }
}

async function handleLiveDeals(req, res, url) {
  const limit = clampInteger(Number(url.searchParams.get("limit") || 5), 1, 10);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
  const config = supabaseConfig();
  if (!config.url || !config.key) {
    sendJson(res, 500, {
      error: "Supabase config not found. Expected SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY, or labeled proj url/api secret key in /Users/joellang/.env."
    });
    return;
  }

  const params = new URLSearchParams({
    select: "live_deal_id,deal_id,market_question,baseline_probabilities,observable_payload,agent_private_signal_seed",
    order: "created_at.asc",
    limit: String(limit),
    offset: String(offset)
  });
  const response = await fetch(`${config.url}/rest/v1/agent_sim_live_deals?${params.toString()}`, {
    method: "GET",
    headers: {
      "apikey": config.key,
      "Authorization": `Bearer ${config.key}`,
      "Accept": "application/json"
    }
  });

  const text = await response.text();
  let rows;
  try {
    rows = text ? JSON.parse(text) : [];
  } catch (error) {
    sendJson(res, 502, { error: "Supabase returned non-JSON response", status: response.status });
    return;
  }

  if (!response.ok) {
    sendJson(res, response.status, {
      error: rows && rows.message ? rows.message : "Supabase live deals query failed",
      details: rows && rows.details ? rows.details : null
    });
    return;
  }

  sendJson(res, 200, {
    source: "supabase",
    limit,
    offset,
    count: rows.length,
    deals: rows.map(safeLiveDeal)
  });
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

function supabaseConfig() {
  const values = loadEnv(defaultEnvPath);
  const url = (
    values.supabase_url ||
    values.next_public_supabase_url ||
    values.vite_supabase_url ||
    values.project_url ||
    values.proj_url
  );
  const key = (
    values.supabase_service_role_key ||
    values.service_role_key ||
    values.api_secret_key ||
    values.supabase_secret_key ||
    values.supabase_anon_key ||
    values.api_key
  );
  return { url: url ? url.replace(/\/$/, "") : "", key: key || "" };
}

function loadEnv(filePath) {
  const values = {};
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.includes("=") ? "=" : trimmed.includes(":") ? ":" : null;
      if (!separator) continue;
      const index = trimmed.indexOf(separator);
      const key = normalizeEnvKey(trimmed.slice(0, index));
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
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

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
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

function readJson(req) {
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

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
