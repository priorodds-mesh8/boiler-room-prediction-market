const { PublicError, submitActions } = require("../_game");
const { readJson, sendJson } = require("../_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const body = await readJson(req);
    sendJson(res, 200, await submitActions(body || {}));
  } catch (error) {
    const status = error instanceof PublicError ? error.status : 500;
    sendJson(res, status || 500, { error: error.message || "Unable to submit game actions", details: error.details || null });
  }
};
