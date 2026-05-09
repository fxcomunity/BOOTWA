const path = require("path");
const { readJSON, writeJSON } = require("./storage");
const config = require("../config.json");

const ADMIN_LOG_PATH = path.join(__dirname, "..", "data", "adminLog.json");

function getAdminLogGroupId() {
  const data = readJSON(ADMIN_LOG_PATH, {});
  return data?.adminLogGroupId || config.adminLogGroupId || null;
}

function setAdminLogGroupId(groupId) {
  const data = readJSON(ADMIN_LOG_PATH, {});
  data.adminLogGroupId = groupId;
  data.updatedAt = new Date().toISOString();
  writeJSON(ADMIN_LOG_PATH, data);
  return data;
}

module.exports = { getAdminLogGroupId, setAdminLogGroupId };
