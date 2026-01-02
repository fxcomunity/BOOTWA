async function closeGroup(sock, groupId) {
  try {
    if (!groupId || !groupId.endsWith("@g.us")) return false;
    await sock.groupSettingUpdate(groupId, "announcement");
    return true;
  } catch (e) {
    console.error("closeGroup error:", e?.message || e);
    return false;
  }
}

module.exports = { closeGroup };
