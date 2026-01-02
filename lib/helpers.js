const moment = require("moment-timezone");

function normalizePhoneToJid(phone) {
  // +62 812-xxx => 62812xxx@s.whatsapp.net
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return `${p}@s.whatsapp.net`;
}

function jidToPhone(jid) {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/^62/, "+62 ");
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

function extractUrls(text) {
  if (!text) return [];
  const regex = /(https?:\/\/[^\s]+)|((?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
  return text.match(regex) || [];
}

function containsBannedWord(text, bannedWords) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const found = bannedWords.find(w => lower.includes(w.toLowerCase()));
  return found || null;
}

module.exports = {
  normalizePhoneToJid,
  jidToPhone,
  getTZName,
  formatTimeNow,
  extractUrls,
  containsBannedWord
};
