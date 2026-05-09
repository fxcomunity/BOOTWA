const path = require("path");
const { readJSON, writeJSON } = require("./storage");

const BLACKLIST_PATH = path.join(__dirname, "..", "data", "groupBlacklist.json");

function isGroupBlacklisted(groupId) {
  const data = readJSON(BLACKLIST_PATH, { groups: [] });
  return data.groups.includes(groupId);
}

function addGroupBlacklist(groupId) {
  const data = readJSON(BLACKLIST_PATH, { groups: [] });
  if (!data.groups.includes(groupId)) {
    data.groups.push(groupId);
    writeJSON(BLACKLIST_PATH, data);
  }
}

function removeGroupBlacklist(groupId) {
  const data = readJSON(BLACKLIST_PATH, { groups: [] });
  data.groups = data.groups.filter((g) => g !== groupId);
  writeJSON(BLACKLIST_PATH, data);
}

function getBlacklistedGroups() {
  const data = readJSON(BLACKLIST_PATH, { groups: [] });
  return data.groups;
}

module.exports = { isGroupBlacklisted, addGroupBlacklist, removeGroupBlacklist, getBlacklistedGroups };
