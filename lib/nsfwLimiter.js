let checks = [];

function canCheck(maxPerMinute = 8) {
  const now = Date.now();
  checks = checks.filter(t => now - t < 60000);

  if (checks.length >= maxPerMinute) return false;

  checks.push(now);
  return true;
}

module.exports = { canCheck };
