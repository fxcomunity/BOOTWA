const { cleanupExpiredCases, createCase } = require("./caseManager");
const { buildCloseReminderPanel } = require("./uiPanel");
const { formatTimeNow, getHourMinuteInTZ } = require("./helpers");
const { closeGroup } = require("./groupCloser");

function startScheduler(sock, config, getGroupSettingsFn) {
  // cleanup cases every minute
  setInterval(() => cleanupExpiredCases(), 60 * 1000);

  // scheduler every minute
  setInterval(async () => {
    const settings = getGroupSettingsFn();

    for (const [groupId, st] of Object.entries(settings)) {
      const tz = st.timezone || config.defaultTimezone;
      const groupName = st.groupName || groupId;

      const { hour, minute } = getHourMinuteInTZ(tz);

      // ✅ WITA/WIT: notif jam 22 waktu mereka (tombol tutup)
      if ((tz === "WITA" || tz === "WIT") && hour === 22 && minute === 0) {
        const timeStr = formatTimeNow(tz);
        const caseId = createCase({ groupId, groupName, actionType: "CLOSE" }, config.caseExpireMinutes);

        const panel = buildCloseReminderPanel({ groupName, timeStr, tzShort: tz });
        const buttons = [
          { buttonId: `CLOSE_YA|${caseId}`, buttonText: { displayText: "✅ YA (TUTUP)" }, type: 1 },
          { buttonId: `CLOSE_NO|${caseId}`, buttonText: { displayText: "❌ TIDAK" }, type: 1 }
        ];

        for (const admin of config.admins) {
          await sock.sendMessage(admin, { text: panel, buttons, headerType: 1 });
        }
      }

      // ✅ WIB: auto close tepat 22:00 WIB
      if (tz === "WIB" && hour === config.closeHourWIB && minute === 0) {
        const ok = await closeGroup(sock, groupId);
        for (const admin of config.admins) {
          await sock.sendMessage(admin, { text: ok ? `🔒 Grup *${groupName}* otomatis ditutup (22:00 WIB).` : `❌ Gagal tutup grup *${groupName}*. Pastikan bot admin.` });
        }
      }
    }
  }, 60 * 1000);
}

module.exports = { startScheduler };
