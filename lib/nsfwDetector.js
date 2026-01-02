const axios = require("axios");
const FormData = require("form-data");

/**
 * ✅ Check NSFW memakai Sightengine (nudity-2.0)
 * buffer = Buffer media (sticker/image/video thumbnail)
 * cfg = config.nsfwDetection
 */
async function checkSightengine(buffer, cfg) {
  if (!cfg?.apiUser || !cfg?.apiSecret) {
    return { isNSFW: false, score: 0, error: "Missing apiUser/apiSecret" };
  }

  const form = new FormData();
  form.append("media", buffer, { filename: "image.jpg" });
  form.append("models", "nudity-2.0");
  form.append("api_user", cfg.apiUser);
  form.append("api_secret", cfg.apiSecret);

  const res = await axios.post("https://api.sightengine.com/1.0/check.json", form, {
    headers: form.getHeaders(),
    timeout: 15000,
  });

  const nudity = res.data?.nudity || {};

  // ✅ ambil skor tertinggi untuk konten dewasa
  const nsfwScore = Math.max(
    nudity.sexual_activity || 0,
    nudity.sexual_display || 0,
    nudity.erotica || 0
  );

  return {
    isNSFW: nsfwScore >= (cfg.threshold || 0.65),
    score: nsfwScore,
    raw: res.data,
  };
}

/**
 * ✅ Wrapper checkNSFW (bisa tambah provider lain nanti)
 */
async function checkNSFW(buffer, cfg) {
  try {
    if (!cfg?.enabled) return { isNSFW: false, score: 0 };

    if (cfg.provider === "sightengine") {
      return await checkSightengine(buffer, cfg);
    }

    return { isNSFW: false, score: 0, error: "Unknown provider" };
  } catch (e) {
    return {
      isNSFW: false,
      score: 0,
      error: e?.message || e?.toString() || "NSFW check failed",
    };
  }
}

module.exports = { checkNSFW };
