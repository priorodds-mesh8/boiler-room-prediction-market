function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function supabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  );
  return { url, key };
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
  findOutputText,
  readJson,
  safeLiveDeal,
  sendJson,
  supabaseConfig
};
