const fs = require("fs");
const path = require("path");

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJSON(filePath, defaultValue = {}) {
  ensureFile(filePath, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error("readJSON error:", filePath, e?.message || e);
    return defaultValue;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("writeJSON error:", filePath, e?.message || e);
  }
}

module.exports = { readJSON, writeJSON, ensureFile };
