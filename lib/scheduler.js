const { cleanupExpiredCases, createCase } = require("./caseManager");
const { buildCloseReminderPanel } = require("./uiPanel");
const { formatTimeNow, getHourMinuteInTZ } = require("./helpers");
const { closeGroup } = require("./grubCloser");

function startScheduler(sock, config, getGroupSettingsFn) {
  setInterval(() => cleanupExpiredCases(), 60 * 1000);

  setInterval(async () => {
    try {
      const settings = getGroupSettingsFn();

      for (const [groupId, st] of Object.entries(settings)) {
        const tz = st.timezone || config.defaultTimezone;
        const groupName = st.groupName || groupId;

        const { hour, minute } = getHourMinuteInTZ(tz);

        // WITA/WIT reminder jam 22 lokal
        if ((tz === "WITA" || tz === "WIT") && hour === 22 && minute === 0) {
          const timeStr = formatTimeNow(tz);
          const caseId = createCase({ groupId, groupName, actionType: "CLOSE" }, config.caseExpireMinutes);

          const panel = buildCloseReminderPanel({ groupName, timeStr, tzShort: tz });
          const buttons = [
            { buttonId: `CLOSE_YA|${caseId}`, buttonText: { displayText: "✅ YA (TUTUP)" }, type: 1 },
            { buttonId: `CLOSE_NO|${caseId}`, buttonText: { displayText: "❌ TIDAK" }, type: 1 }
          ];

          for (const admin of config.admins) {
            await sock.sendMessage(admin, { text: panel, buttons, headerType: 1 }).catch(() => {});
          }
        }

        // WIB auto close jam 22 WIB
        if (tz === "WIB" && hour === config.closeHourWIB && minute === 0) {
          const ok = await closeGroup(sock, groupId).catch(() => false);
          for (const admin of config.admins) {
            await sock.sendMessage(admin, {
              text: ok
                ? `🔒 Grup *${groupName}* otomatis ditutup (22:00 WIB).`
                : `❌ Gagal tutup grup *${groupName}* (bot harus admin).`
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("scheduler error:", e?.message || e);
    }
  }, 60 * 1000);
}

module.exports = { startScheduler };
