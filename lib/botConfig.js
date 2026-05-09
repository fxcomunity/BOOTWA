const path = require("path");
const { readJSON, writeJSON } = require("./storage");

const BOT_CONFIG_PATH = path.join(__dirname, "..", "data", "botConfig.json");

function getBotConfig() {
  return readJSON(BOT_CONFIG_PATH, { prefix: "." });
}

function getPrefix() {
  return getBotConfig().prefix || ".";
}

function setPrefix(prefix) {
  const cfg = getBotConfig();
  cfg.prefix = prefix;
  writeJSON(BOT_CONFIG_PATH, cfg);
}

module.exports = { getBotConfig, getPrefix, setPrefix };
