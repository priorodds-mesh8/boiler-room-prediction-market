const { PublicError, getSession } = require("../_game");
const { sendJson } = require("../_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const requestUrl = new URL(req.url || "/api/game/session", `https://${req.headers.host || "localhost"}`);
    const sessionId = requestUrl.searchParams.get("sessionId");
    if (!sessionId) {
      sendJson(res, 400, { error: "sessionId is required" });
      return;
    }
    sendJson(res, 200, await getSession(sessionId));
  } catch (error) {
    const status = error instanceof PublicError ? error.status : 500;
    sendJson(res, status || 500, { error: error.message || "Unable to load game session", details: error.details || null });
  }
};
