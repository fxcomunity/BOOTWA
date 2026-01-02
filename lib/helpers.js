const moment = require("moment-timezone");

function jidToPhone(jid) {
  if (!jid) return "-";
  const raw = jid.replace(/@s\.whatsapp\.net$/, "");
  if (raw.startsWith("62")) return "+62 " + raw.slice(2);
  if (raw.startsWith("60")) return "+60 " + raw.slice(2);
  return raw;
}

function getTZName(tzShort) {
  if (tzShort === "WIB") return "Asia/Jakarta";
  if (tzShort === "WITA") return "Asia/Makassar";
  if (tzShort === "WIT") return "Asia/Jayapura";
  return "Asia/Jakarta";
}

function formatTimeNow(tzShort) {
  const tz = getTZName(tzShort);
  return moment().tz(tz).format("YYYY-MM-DD HH:mm") + " " + tzShort;
}

function getHourMinuteInTZ(tzShort) {
  const tz = getTZName(tzShort);
  const m = moment().tz(tz);
  return { hour: m.hour(), minute: m.minute() };
}

function extractUrls(text) {
  if (!text) return [];
  const regex =
    /(https?:\/\/[^\s]+)|((?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
  return text.match(regex) || [];
}

function containsBannedWord(text, bannedWords) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const found = bannedWords.find((w) => lower.includes(w.toLowerCase()));
  return found || null;
}

module.exports = {
  jidToPhone,
  getTZName,
  formatTimeNow,
  getHourMinuteInTZ,
  extractUrls,
  containsBannedWord
};
