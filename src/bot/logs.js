'use strict';

const { EmbedBuilder, Events } = require('discord.js');
const { tr } = require('../i18n');
const { sendLog, clip } = require('./helpers');

const GREEN = 0x2ecc71;
const RED = 0xe74c3c;
const YELLOW = 0xf1c40f;
const BLUE = 0x29b6f6;

const mk = (color, title) => new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

function register(client) {
  client.on(Events.MessageDelete, async (m) => {
    if (!m.guild || m.author?.bot) return;
    const g = m.guild;
    const e = mk(RED, tr(g, '🗑️ رسالة محذوفة')).addFields(
      { name: tr(g, 'الكاتب'), value: m.author ? `${m.author} (${m.author.id})` : tr(g, 'غير معروف'), inline: true },
      { name: tr(g, 'القناة'), value: `${m.channel}`, inline: true },
      { name: tr(g, 'المحتوى'), value: clip(m.content) || '—' },
    );
    if (m.attachments?.size) {
      e.addFields({ name: tr(g, 'مرفقات'), value: clip([...m.attachments.values()].map((a) => a.url).join('\n')) });
    }
    await sendLog(g, 'messageDelete', e);
  });

  client.on(Events.MessageUpdate, async (oldM, newM) => {
    if (!newM.guild) return;
    if (newM.partial) newM = await newM.fetch().catch(() => null);
    if (!newM || newM.author?.bot) return;
    if (oldM.content === newM.content) return;
    const g = newM.guild;
    const e = mk(YELLOW, tr(g, '✏️ رسالة معدّلة'))
      .addFields(
        { name: tr(g, 'الكاتب'), value: `${newM.author} (${newM.author.id})`, inline: true },
        { name: tr(g, 'القناة'), value: `${newM.channel}`, inline: true },
        { name: tr(g, 'قبل'), value: clip(oldM.content) || tr(g, 'غير معروف') },
        { name: tr(g, 'بعد'), value: clip(newM.content) || '—' },
      )
      .setURL(newM.url);
    await sendLog(g, 'messageEdit', e);
  });

  client.on(Events.GuildMemberAdd, async (m) => {
    const g = m.guild;
    const e = mk(GREEN, tr(g, '📥 عضو دخل'))
      .setThumbnail(m.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: tr(g, 'العضو'), value: `${m} (${m.id})`, inline: true },
        { name: tr(g, 'عمر الحساب'), value: ts(m.user.createdTimestamp), inline: true },
        { name: tr(g, 'عدد الأعضاء'), value: String(g.memberCount), inline: true },
      );
    await sendLog(g, 'memberJoin', e);
  });

  client.on(Events.GuildMemberRemove, async (m) => {
    const g = m.guild;
    const e = mk(RED, tr(g, '📤 عضو طلع'))
      .setThumbnail(m.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: tr(g, 'العضو'), value: `${m.user} (${m.id})`, inline: true },
        { name: tr(g, 'انضم'), value: m.joinedTimestamp ? ts(m.joinedTimestamp) : tr(g, 'غير معروف'), inline: true },
      );
    await sendLog(g, 'memberLeave', e);
  });

  client.on(Events.GuildMemberUpdate, async (o, n) => {
    if (o.partial) return;
    const g = n.guild;
    const fields = [];
    const added = n.roles.cache.filter((r) => !o.roles.cache.has(r.id));
    const removed = o.roles.cache.filter((r) => !n.roles.cache.has(r.id));
    if (added.size) fields.push({ name: tr(g, 'رتب انضافت'), value: clip(added.map((r) => r.toString()).join(' ')) });
    if (removed.size) fields.push({ name: tr(g, 'رتب انشالت'), value: clip(removed.map((r) => r.toString()).join(' ')) });
    if (o.nickname !== n.nickname) {
      fields.push({ name: tr(g, 'اللقب'), value: `${o.nickname || '—'} ← ${n.nickname || '—'}` });
    }
    if (o.communicationDisabledUntilTimestamp !== n.communicationDisabledUntilTimestamp) {
      const until = n.communicationDisabledUntilTimestamp;
      fields.push({
        name: tr(g, 'التايم أوت'),
        value: until && until > Date.now() ? tr(g, 'ينتهي {t}', { t: ts(until) }) : tr(g, 'انتهى أو انشال'),
      });
    }
    if (!fields.length) return;
    const e = mk(BLUE, tr(g, '👤 تحديث عضو')).addFields({ name: tr(g, 'العضو'), value: `${n} (${n.id})` }, ...fields);
    await sendLog(g, 'memberUpdate', e);
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    if (ban.partial) ban = await ban.fetch().catch(() => ban);
    const g = ban.guild;
    const e = mk(RED, tr(g, '🔨 عضو انحظر')).addFields(
      { name: tr(g, 'العضو'), value: `${ban.user} (${ban.user.id})`, inline: true },
      { name: tr(g, 'السبب'), value: clip(ban.reason) || '—', inline: true },
    );
    await sendLog(g, 'ban', e);
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    const g = ban.guild;
    const e = mk(GREEN, tr(g, '✅ فك حظر')).addFields({ name: tr(g, 'العضو'), value: `${ban.user} (${ban.user.id})` });
    await sendLog(g, 'ban', e);
  });

  client.on(Events.ChannelCreate, async (ch) => {
    if (!ch.guild) return;
    await sendLog(ch.guild, 'channel', mk(GREEN, tr(ch.guild, '📁 قناة جديدة')).setDescription(`${ch} (\`${ch.name}\`)`));
  });
  client.on(Events.ChannelDelete, async (ch) => {
    if (!ch.guild) return;
    await sendLog(ch.guild, 'channel', mk(RED, tr(ch.guild, '🗑️ قناة انحذفت')).setDescription(`\`${ch.name}\``));
  });

  client.on(Events.GuildRoleCreate, async (r) => {
    await sendLog(r.guild, 'role', mk(GREEN, tr(r.guild, '🏷️ رتبة جديدة')).setDescription(`${r} (\`${r.name}\`)`));
  });
  client.on(Events.GuildRoleDelete, async (r) => {
    await sendLog(r.guild, 'role', mk(RED, tr(r.guild, '🏷️ رتبة انحذفت')).setDescription(`\`${r.name}\``));
  });

  client.on(Events.VoiceStateUpdate, async (o, n) => {
    if (o.channelId === n.channelId) return;
    const member = n.member || o.member;
    if (!member || member.user.bot) return;
    const g = member.guild;
    let desc;
    if (!o.channelId) desc = tr(g, 'دخل {c}', { c: n.channel });
    else if (!n.channelId) desc = tr(g, 'طلع من {c}', { c: o.channel });
    else desc = tr(g, 'انتقل من {a} إلى {b}', { a: o.channel, b: n.channel });
    await sendLog(g, 'voice', mk(BLUE, tr(g, '🔊 صوت')).setDescription(`${member} ${desc}`));
  });
}

module.exports = { register };
