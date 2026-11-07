'use strict';

const { Routes } = require('discord.js');
const { tr } = require('../i18n');

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const DATA_RE = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

// تحويل مرفق ديسكورد (من أمر /branding) إلى data URI
async function attachmentToDataUri(att, g = 'ar') {
  const type = String(att.contentType || '').split(';')[0].trim();
  if (!TYPES.has(type)) throw new Error(tr(g, 'الملف لازم يكون صورة (png, jpg, gif, webp).'));
  if (att.size > MAX_BYTES) throw new Error(tr(g, 'الصورة كبيرة. الحد الأقصى 8MB.'));
  let url;
  try {
    url = new URL(att.url);
  } catch {
    throw new Error(tr(g, 'رابط الصورة غير صالح.'));
  }
  if (url.protocol !== 'https:' || !CDN_HOSTS.has(url.hostname)) throw new Error(tr(g, 'رابط الصورة غير مقبول.'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(tr(g, 'ما قدرت أحمّل الصورة من ديسكورد.'));
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(tr(g, 'الصورة كبيرة. الحد الأقصى 8MB.'));
  return `data:${type};base64,${buf.toString('base64')}`;
}

// بيغيّر اسم (nickname) وصورة (avatar) البوت داخل هالسيرفر فقط
async function apply(client, guild, { name, logo, reset } = {}) {
  const body = {};
  if (reset) {
    body.nick = null;
    body.avatar = null;
  } else {
    if (name !== undefined) {
      const n = String(name).trim();
      if (n.length > 32) throw new Error(tr(guild, 'الاسم أطول من 32 حرف.'));
      body.nick = n || null;
    }
    if (logo) {
      const m = DATA_RE.exec(String(logo));
      if (!m) throw new Error(tr(guild, 'صيغة الصورة غير صالحة (png, jpg, gif, webp).'));
      if (m[2].length * 0.75 > MAX_BYTES) throw new Error(tr(guild, 'الصورة كبيرة. الحد الأقصى 8MB.'));
      body.avatar = logo;
    }
  }
  if (!Object.keys(body).length) throw new Error(tr(guild, 'ما في شي لتغييره. اكتب اسم أو اختر صورة.'));

  try {
    await client.rest.patch(Routes.guildMember(guild.id, '@me'), { body });
  } catch (e) {
    throw new Error(tr(guild, 'ديسكورد رفض الطلب: {err}. (تغيير الصورة إله حد يومي، جرّب بعد شوي)', { err: e.message }));
  }
  await guild.members.fetchMe().catch(() => {});
}

// الاسم والصورة اللي بيشوفهم أعضاء هالسيرفر
function brandOf(guild) {
  const me = guild && guild.members && guild.members.me;
  if (!me) return { name: '', logo: null };
  return { name: me.displayName, logo: me.displayAvatarURL({ size: 128, extension: 'png' }) };
}

module.exports = { apply, attachmentToDataUri, brandOf };
