async function closeGroup(sock, groupId) {
  try {
    await sock.groupSettingUpdate(groupId, "announcement"); // admin-only
    return true;
  } catch (e) {
    console.error("closeGroup error:", e);
    return false;
  }
}

module.exports = { closeGroup };
