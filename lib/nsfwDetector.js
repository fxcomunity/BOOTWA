const axios = require("axios");
const FormData = require("form-data");

async function checkSightengine(buffer, cfg) {
  // ✅ ambil API dari config.json atau ENV Railway
  const apiUser = cfg?.apiUser || process.env.SIGHTENGINE_USER;
  const apiSecret = cfg?.apiSecret || process.env.SIGHTENGINE_SECRET;

  // ✅ threshold dari ENV bisa override config
  const threshold = Number(process.env.NSFW_THRESHOLD || cfg?.threshold || 0.65);

  if (!apiUser || !apiSecret) {
    return {
      isNSFW: false,
      score: 0,
      error: "Missing apiUser/apiSecret (isi di config.json atau Railway ENV)",
    };
  }

  if (!buffer || !Buffer.isBuffer(buffer)) {
    return {
      isNSFW: false,
      score: 0,
      error: "Invalid buffer media",
    };
  }

  const form = new FormData();
  form.append("media", buffer, { filename: "image.jpg" });
  form.append("models", "nudity-2.0");
  form.append("api_user", apiUser);
  form.append("api_secret", apiSecret);

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
    isNSFW: nsfwScore >= threshold,
    score: nsfwScore,
    threshold,
    raw: res.data,
  };
}

async function checkNSFW(buffer, cfg) {
  try {
    if (!cfg?.enabled) {
      return { isNSFW: false, score: 0, disabled: true };
    }

    const provider = (cfg.provider || "sightengine").toLowerCase();

    if (provider === "sightengine") {
      return await checkSightengine(buffer, cfg);
    }

    return { isNSFW: false, score: 0, error: "Unknown provider" };
  } catch (e) {
    return {
      isNSFW: false,
      score: 0,
      error: e?.response?.data || e?.message || "NSFW check error",
    };
  }
}

module.exports = { checkNSFW };
