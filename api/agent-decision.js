const { findOutputText, readJson, sendJson } = require("./_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 501, { error: "OPENAI_API_KEY is not set; frontend will use the local persona engine." });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Invalid request body" });
    return;
  }

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
};
