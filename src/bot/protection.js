'use strict';

const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const db = require('../db');
const { tr } = require('../i18n');
const { sendTo, clip } = require('./helpers');

const spam = new Map(); // "guild:user" -> [{ t, id, ch }]
const joins = new Map(); // guildId -> [{ t, id }]
const lockUntil = new Map(); // guildId -> وقت انتهاء وضع الطوارئ

const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const URL_RE = /https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi;

function hostOf(u) {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isExempt(member, channelId, s) {
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has(P.Administrator) || member.permissions.has(P.ManageGuild)) return true;
  if (s.whitelistChannelIds.includes(channelId)) return true;
  return s.whitelistRoleIds.some((r) => member.roles.cache.has(r));
}

async function logAction(guild, title, fields) {
  const all = db.getSettings(guild.id);
  const channelId = all.protection.logChannelId || (all.logs.enabled ? all.logs.channelId : '');
  if (!channelId) return;
  const embed = new EmbedBuilder().setColor(0xe67e22).setTitle(`🛡️ ${title}`).addFields(fields).setTimestamp();
  await sendTo(guild, channelId, { embeds: [embed] });
}

async function violate(message, reason, { del = true, timeoutMinutes = 0 } = {}) {
  const { guild, member } = message;
  if (del) await message.delete().catch(() => {});
  let punished = '';
  if (timeoutMinutes && member.moderatable) {
    const ok = await member
      .timeout(timeoutMinutes * 60000, `Protection: ${reason}`)
      .then(() => true)
      .catch(() => false);
    if (ok) punished = tr(guild, 'تايم أوت {n} دقيقة', { n: timeoutMinutes });
  }
  const warn = await message.channel
    .send({ content: tr(guild, '{user}، ممنوع: {reason}.', { user: member.toString(), reason }), allowedMentions: { users: [member.id] } })
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);

  await logAction(guild, tr(guild, 'مخالفة: {reason}', { reason }), [
    { name: tr(guild, 'العضو'), value: `${member} (${member.id})`, inline: true },
    { name: tr(guild, 'القناة'), value: `${message.channel}`, inline: true },
    { name: tr(guild, 'العقوبة'), value: punished || tr(guild, 'حذف الرسالة'), inline: true },
    { name: tr(guild, 'المحتوى'), value: clip(message.content, 500) || '—' },
  ]);
}

async function onMessage(message) {
  if (!message.guild || message.author.bot || message.system || !message.member) return;
  const s = db.getSettings(message.guild.id).protection;
  if (!s.enabled) return;
  if (isExempt(message.member, message.channelId, s)) return;

  const content = message.content || '';

  if (s.antiInvites.enabled && INVITE_RE.test(content)) {
    return violate(message, tr(message.guild, 'روابط دعوات سيرفرات'));
  }

  if (s.antiLinks.enabled) {
    const urls = content.match(URL_RE) || [];
    const bad = urls.some((u) => {
      const host = hostOf(u);
      return host && !s.antiLinks.allowedDomains.some((d) => host === d || host.endsWith('.' + d));
    });
    if (bad) return violate(message, tr(message.guild, 'روابط غير مسموحة'));
  }

  if (s.antiMassMention.enabled) {
    const count = message.mentions.users.size + message.mentions.roles.size;
    if (count >= s.antiMassMention.max) {
      return violate(message, tr(message.guild, 'منشن جماعي'), { timeoutMinutes: s.antiMassMention.timeoutMinutes });
    }
  }

  if (s.antiSpam.enabled) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const list = (spam.get(key) || []).filter((x) => now - x.t < s.antiSpam.perSeconds * 1000);
    list.push({ t: now, id: message.id, ch: message.channelId });
    spam.set(key, list);
    if (list.length >= s.antiSpam.maxMessages) {
      spam.delete(key);
      const byChannel = {};
      for (const x of list) (byChannel[x.ch] ||= []).push(x.id);
      for (const [ch, ids] of Object.entries(byChannel)) {
        const channel = message.guild.channels.cache.get(ch);
        if (channel) await channel.bulkDelete(ids, true).catch(() => {});
      }
      return violate(message, tr(message.guild, 'سبام'), { del: false, timeoutMinutes: s.antiSpam.timeoutMinutes });
    }
  }
}

// بيرجع true لو العضو انعاقب (عشان ما نرحب فيه)
async function onJoin(member) {
  const s = db.getSettings(member.guild.id).protection;
  if (!s.enabled || !s.antiRaid.enabled) return false;
  const r = s.antiRaid;
  const guild = member.guild;
  const now = Date.now();

  const list = (joins.get(guild.id) || []).filter((x) => now - x.t < r.perSeconds * 1000);
  list.push({ t: now, id: member.id });
  joins.set(guild.id, list);

  let reason = null;
  let targets = [member];

  if (now < (lockUntil.get(guild.id) || 0)) {
    reason = tr(guild, 'وضع الطوارئ (موجة دخول مشبوهة)');
  } else if (list.length >= r.maxJoins) {
    reason = tr(guild, 'موجة دخول مشبوهة ({n} خلال {s} ثانية)', { n: list.length, s: r.perSeconds });
    lockUntil.set(guild.id, now + 60000);
    targets = list.map((x) => guild.members.cache.get(x.id)).filter(Boolean);
    joins.set(guild.id, []);
  } else if (r.minAccountAgeDays > 0 && !member.user.bot) {
    const ageDays = (now - member.user.createdTimestamp) / 86400000;
    if (ageDays < r.minAccountAgeDays) reason = tr(guild, 'حساب جديد ({d} يوم)', { d: ageDays.toFixed(1) });
  }
  if (!reason) return false;

  let done = 0;
  for (const t of targets) {
    const ok =
      r.action === 'ban'
        ? t.bannable && (await t.ban({ reason: `Anti-raid: ${reason}` }).then(() => true).catch(() => false))
        : t.kickable && (await t.kick(`Anti-raid: ${reason}`).then(() => true).catch(() => false));
    if (ok) done++;
  }
  if (done) {
    await logAction(guild, tr(guild, 'حماية الدخول: {reason}', { reason }), [
      { name: tr(guild, 'الإجراء'), value: r.action === 'ban' ? tr(guild, 'حظر') : tr(guild, 'طرد'), inline: true },
      { name: tr(guild, 'عدد الأعضاء'), value: String(done), inline: true },
      { name: tr(guild, 'آخر عضو'), value: `${member.user.username} (${member.id})` },
    ]);
  }
  return targets.some((t) => t.id === member.id) && done > 0;
}

module.exports = { onMessage, onJoin };
