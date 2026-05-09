const { clampInteger, safeLiveDeal, sendJson, supabaseConfig } = require("./_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const requestUrl = new URL(req.url || "/api/live-deals", `https://${req.headers.host || "localhost"}`);
  const limit = clampInteger(Number(requestUrl.searchParams.get("limit") || 5), 1, 10);
  const offset = Math.max(0, Number(requestUrl.searchParams.get("offset") || 0) || 0);
  const config = supabaseConfig();

  if (!config.url || !config.key) {
    sendJson(res, 500, {
      error: "Supabase config not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables."
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
};
