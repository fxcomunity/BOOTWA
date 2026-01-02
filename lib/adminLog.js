const path = require("path");
const { readJSON, writeJSON } = require("./storage");

const LOG_PATH = path.join(__dirname, "..", "data", "adminLog.json");

function getAdminLogGroupId() {
  const data = readJSON(LOG_PATH, {});
  return data?.adminLogGroupId || null;
}

function setAdminLogGroupId(groupId) {
  const data = readJSON(LOG_PATH, {});
  data.adminLogGroupId = groupId;
  data.updatedAt = new Date().toISOString();
  writeJSON(LOG_PATH, data);
  return data;
}

module.exports = {
  getAdminLogGroupId,
  setAdminLogGroupId
};
