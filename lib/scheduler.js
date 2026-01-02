const cron = require('node-cron');
const moment = require('moment-timezone');
const { saveJSON } = require('./storage');
const { tzToIana, formatTs } = require('./helpers');
const { sendCloseReminderPanel, sendInfo } = require('./uiPanel');

async function scheduleJobs({ sock, config, groupSettings, settingsPath }) {
  // Every minute check close rules
  cron.schedule('* * * * *', async () => {
    try {
      const groups = Object.keys(groupSettings);
      const now = Date.now();

      for (const gid of groups) {
        const tz = groupSettings[gid]?.timezone || config.defaultTimezone || 'WIB';
        const iana = tzToIana(tz);
        const m = moment(now).tz(iana);
        const hhmm = m.format('HH:mm');

        // group name best effort
        let groupName = gid;
        try {
          const meta = await sock.groupMetadata(gid);
          groupName = meta?.subject || gid;
        } catch (e) {}

        // Reminder before close time (all zones)
        const beforeMin = config.closeRule?.notifyBeforeMinutes ?? 15;
        const notifyAt = moment(now).tz(iana).add(0,'minutes').format('HH:mm');
        const target = config.closeRule?.wibAutoCloseAt || '22:00';
        const remindTime = moment(now).tz(iana).startOf('day').add(parseInt(target.split(':')[0]),'hours').add(parseInt(target.split(':')[1]),'minutes').subtract(beforeMin,'minutes');
        if (m.format('HH:mm') === remindTime.format('HH:mm') && !groupSettings[gid]?.remindedDate?.includes(m.format('YYYY-MM-DD'))) {
          groupSettings[gid].remindedDate = (groupSettings[gid].remindedDate || []);
          groupSettings[gid].remindedDate.push(m.format('YYYY-MM-DD'));
          saveJSON(settingsPath, groupSettings);
          await sendCloseReminderPanel({ sock, config, groupId: gid, groupName, tz, timeStr: formatTs(now, tz) });
        }

        // At 22:00 local: notify WITA/WIT; auto close for WIB only
        if (hhmm === '22:00') {
          if (tz === 'WIB') {
            // auto close
            try {
              await sock.groupSettingUpdate(gid, 'announcement');
              await sendInfo(sock, config.admins, `🔒 *AUTO CLOSE*
Grup: *${groupName}*
Ditutup otomatis pada 22:00 WIB (hanya admin bisa chat).`);
            } catch (e) {
              await sendInfo(sock, config.admins, `❌ *AUTO CLOSE GAGAL*
Grup: *${groupName}*
Bot harus admin untuk menutup grup.`);
            }
          } else {
            // notify only
            await sendCloseReminderPanel({ sock, config, groupId: gid, groupName, tz, timeStr: formatTs(now, tz) });
          }
        }
      }
    } catch (e) {
      // ignore
    }
  });
}

module.exports = { scheduleJobs };
