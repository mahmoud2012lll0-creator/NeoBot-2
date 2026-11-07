'use strict';

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { brandOf } = require('./branding');

const EPH = MessageFlags.Ephemeral;

function colorOf(hex, fallback = 0x29b6f6) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  return m ? parseInt(m[1], 16) : fallback;
}

// بيستبدل {user} {server} ... بقيمها
function fill(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const validUrl = (u) => /^https?:\/\/\S+$/i.test(u || '');
const clip = (s, n = 1000) => (s ? String(s).slice(0, n) : '');

async function getChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

async function sendTo(guild, channelId, payload) {
  const ch = await getChannel(guild, channelId);
  if (!ch || !ch.isTextBased()) return null;
  return ch.send(payload).catch((e) => {
    console.error(`[send] ${guild.id}/${channelId}: ${e.message}`);
    return null;
  });
}

// الرتب اللي بتشوف تذاكر نوع معيّن: رتب النوع إذا محددة، وإلا رتب الدعم العامة
function ticketRoleIds(settings, typeValue) {
  const type = settings.tickets.types.find((t) => t.value === typeValue);
  return type && type.roleIds.length ? type.roleIds : settings.tickets.supportRoleIds;
}

function isStaff(member, settings, typeValue) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return ticketRoleIds(settings, typeValue).some((id) => member.roles.cache.has(id));
}

// فوتر موحّد: اسم البوت وصورته بهالسيرفر (أو نص مخصص)
function setBrandFooter(embed, guild, text = '') {
  const b = brandOf(guild);
  const t = text || (b.name ? `Powered by ${b.name}` : '');
  if (t) embed.setFooter(b.logo ? { text: t, iconURL: b.logo } : { text: t });
  return embed;
}

async function sendLog(guild, kind, embed) {
  const s = db.getSettings(guild.id).logs;
  if (!s.enabled || !s.events[kind]) return;
  setBrandFooter(embed, guild);
  await sendTo(guild, s.channelId, { embeds: [embed] });
}

function memberVars(member) {
  return {
    user: member.toString(),
    username: member.user.username,
    id: member.id,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}

module.exports = { ticketRoleIds, brandOf, setBrandFooter, EPH, colorOf, fill, validUrl, clip, getChannel, sendTo, isStaff, sendLog, memberVars };
