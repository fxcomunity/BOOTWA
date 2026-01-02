async function closeGroup(sock, groupId) {
  try {
    // Pastikan groupId valid
    if (!groupId || !groupId.endsWith("@g.us")) {
      console.log("⚠️ closeGroup: invalid groupId", groupId);
      return false;
    }

    // 1) Setting ke "announcement" (hanya admin yg bisa chat)
    await sock.groupSettingUpdate(groupId, "announcement");

    console.log("✅ closeGroup success:", groupId);
    return true;
  } catch (e) {
    // Jangan sampai crash
    const msg = e?.message || e?.toString() || "unknown error";
    console.error("❌ closeGroup failed:", msg);

    // Friendly hint untuk kasus paling sering
    if (msg.toLowerCase().includes("not-authorized") || msg.toLowerCase().includes("not authorized")) {
      console.error("⚠️ Bot bukan admin grup, tidak bisa tutup grup.");
    }
    return false;
  }
}

async function openGroup(sock, groupId) {
  try {
    if (!groupId || !groupId.endsWith("@g.us")) {
      console.log("⚠️ openGroup: invalid groupId", groupId);
      return false;
    }

    // 2) Setting kembali normal (semua member boleh chat)
    await sock.groupSettingUpdate(groupId, "not_announcement");

    console.log("✅ openGroup success:", groupId);
    return true;
  } catch (e) {
    const msg = e?.message || e?.toString() || "unknown error";
    console.error("❌ openGroup failed:", msg);

    if (msg.toLowerCase().includes("not-authorized") || msg.toLowerCase().includes("not authorized")) {
      console.error("⚠️ Bot bukan admin grup, tidak bisa buka/tutup grup.");
    }
    return false;
  }
}

module.exports = { closeGroup, openGroup };
