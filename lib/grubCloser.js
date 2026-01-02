async function closeGroup(sock, groupId) {
  try {
    await sock.groupSettingUpdate(groupId, "announcement");
    return true;
  } catch (e) {
    console.error("closeGroup error:", e?.message || e);
    return false;
  }
}

module.exports = { closeGroup };
