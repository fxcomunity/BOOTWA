const path = require("path");
const { readJSON, writeJSON } = require("./storage");

const CASES_PATH = path.join(__dirname, "..", "data", "cases.json");

function createCase(caseObj, expireMinutes = 10) {
  const cases = readJSON(CASES_PATH, {});
  const caseId = `CASE_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

  cases[caseId] = {
    ...caseObj,
    status: "open",
    createdAt: Date.now(),
    expiresAt: Date.now() + expireMinutes * 60 * 1000
  };

  writeJSON(CASES_PATH, cases);
  return caseId;
}

function getCase(caseId) {
  const cases = readJSON(CASES_PATH, {});
  return cases[caseId] || null;
}

function closeCase(caseId) {
  const cases = readJSON(CASES_PATH, {});
  if (!cases[caseId]) return false;
  cases[caseId].status = "closed";
  cases[caseId].closedAt = Date.now();
  writeJSON(CASES_PATH, cases);
  return true;
}

function cleanupExpiredCases() {
  const cases = readJSON(CASES_PATH, {});
  const now = Date.now();
  let changed = false;

  for (const id of Object.keys(cases)) {
    if (cases[id].expiresAt <= now || cases[id].status === "closed") {
      delete cases[id];
      changed = true;
    }
  }
  if (changed) writeJSON(CASES_PATH, cases);
}

module.exports = { createCase, getCase, closeCase, cleanupExpiredCases };
