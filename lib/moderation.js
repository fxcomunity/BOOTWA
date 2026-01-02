const path = require("path");
const { readJSON, writeJSON } = require("./storage");
const { extractUrls, containsBannedWord } = require("./helpers");

const BANWORDS_PATH = path.join(__dirname, "..", "data", "banwords.json");
const COUNTERS_PATH = path.join(__dirname, "..", "data", "groupCounters.json");

function getBannedWords() {
  return readJSON(BANWORDS_PATH, []);
}

function addBannedWord(word) {
  const list = getBannedWords();
  if (!list.map(x=>x.toLowerCase()).includes(word.toLowerCase())) list.push(word);
  writeJSON(BANWORDS_PATH, list);
  return list;
}

function removeBannedWord(word) {
  let list = getBannedWords();
  list = list.filter(w => w.toLowerCase() !== word.toLowerCase());
  writeJSON(BANWORDS_PATH, list);
  return list;
}

function pushViolationCounter(groupId, windowMinutes = 10) {
  const counters = readJSON(COUNTERS_PATH, {});
  const now = Date.now();
  counters[groupId] = counters[groupId] || [];
  counters[groupId].push(now);

  const windowMs = windowMinutes * 60 * 1000;
  counters[groupId] = counters[groupId].filter(t => now - t <= windowMs);

  writeJSON(COUNTERS_PATH, counters);
  return counters[groupId].length;
}

function resetCounter(groupId) {
  const counters = readJSON(COUNTERS_PATH, {});
  counters[groupId] = [];
  writeJSON(COUNTERS_PATH, counters);
}

function detectViolation({ text, allowedGroupLink, bannedWords }) {
  const urls = extractUrls(text);
  const bannedFound = containsBannedWord(text, bannedWords);

  if (bannedFound) {
    return { isViolation: true, type: "Konten Vulgar/Ilegal", evidence: bannedFound };
  }

  if (urls.length > 0) {
    const bad = urls.find(u => !u.includes(allowedGroupLink));
    if (bad) {
      return { isViolation: true, type: "Link Non-Resmi", evidence: bad };
    }
  }

  return { isViolation: false };
}

module.exports = {
  getBannedWords,
  addBannedWord,
  removeBannedWord,
  detectViolation,
  pushViolationCounter,
  resetCounter
};
