const path = require("path");
const { readJSON, writeJSON } = require("./storage");

const WARNS_PATH = path.join(__dirname, "..", "data", "warns.json");
const MAX_WARNS = 3;

function getWarns(groupId, userJid) {
  const warns = readJSON(WARNS_PATH, {});
  return warns?.[groupId]?.[userJid] || [];
}

function addWarn(groupId, userJid, reason = "Tidak ada alasan") {
  const warns = readJSON(WARNS_PATH, {});
  warns[groupId] = warns[groupId] || {};
  warns[groupId][userJid] = warns[groupId][userJid] || [];
  warns[groupId][userJid].push({ reason, time: new Date().toISOString() });
  writeJSON(WARNS_PATH, warns);
  return warns[groupId][userJid].length;
}

function resetWarn(groupId, userJid) {
  const warns = readJSON(WARNS_PATH, {});
  if (warns[groupId]) {
    delete warns[groupId][userJid];
    writeJSON(WARNS_PATH, warns);
  }
}

function getWarnList(groupId) {
  const warns = readJSON(WARNS_PATH, {});
  return warns[groupId] || {};
}

module.exports = { getWarns, addWarn, resetWarn, getWarnList, MAX_WARNS };
