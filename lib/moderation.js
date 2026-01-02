function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).toLowerCase();
}

function hasUrl(text) {
  if (!text) return false;
  const urlRegex = /(https?:\/\/\S+)|((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi;
  return urlRegex.test(text);
}

function extractUrls(text) {
  const urlRegex = /(https?:\/\/\S+)|((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi;
  return (text.match(urlRegex) || []).map(s => s.trim());
}

function includesBanword(text, banwords) {
  const t = (text || '').toLowerCase();
  return banwords.find(w => t.includes(String(w).toLowerCase()));
}

function detectViolation({ msg, config, banwords }) {
  const text = extractText(msg);
  const urls = extractUrls(text);
  const allowedInvite = (config.allowedGroupInvite || '').toLowerCase();

  // Link-based violations
  if (urls.length > 0) {
    for (const u of urls) {
      const lu = u.toLowerCase();
      if (allowedInvite && lu.includes(allowedInvite)) continue;

      const bw = includesBanword(lu, banwords) || includesBanword(text, banwords);
      if (bw) {
        return { type: 'Link Vulgar/Ilegal', evidence: u };
      }
      // any other link is non-official
      return { type: 'Link Non-Resmi', evidence: u };
    }
  }

  // Media/sticker violations (heuristic via caption/text)
  const m = msg.message || {};
  const isMedia = !!(m.imageMessage || m.videoMessage || m.stickerMessage || m.documentMessage);
  if (isMedia) {
    const bw = includesBanword(text, banwords);
    if (bw) return { type: 'Media/Stiker Vulgar', evidence: `keyword: ${bw}` };

    // filename / mimetype heuristic (if available)
    const mime = m.imageMessage?.mimetype || m.videoMessage?.mimetype || m.stickerMessage?.mimetype || m.documentMessage?.mimetype || '';
    const name = m.documentMessage?.fileName || '';
    const meta = `${mime} ${name}`.toLowerCase();
    const bw2 = includesBanword(meta, banwords);
    if (bw2) return { type: 'Media/Stiker Vulgar', evidence: `meta: ${bw2}` };
  }

  return null;
}

module.exports = { detectViolation };
