let checks = [];

/**
 * ✅ Limit check NSFW biar kuota API aman
 * maxPerMinute = max request per 60 detik
 */
function canCheck(maxPerMinute = 8) {
  const now = Date.now();

  // buang data lama > 60 detik
  checks = checks.filter((t) => now - t < 60000);

  // kalau sudah melebihi limit, skip
  if (checks.length >= maxPerMinute) return false;

  checks.push(now);
  return true;
}

module.exports = { canCheck };
