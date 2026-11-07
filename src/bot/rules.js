'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('../db');
const { tr } = require('../i18n');
const { colorOf, setBrandFooter } = require('./helpers');

const EMBED_BUDGET = 5000; // أقل من حد ديسكورد (6000) للأمان

// بيبني الرسائل حسب الإعدادات: إيمبد (بيتقسم لعدة رسائل إذا طويل) أو نص عادي
function buildPayloads(guild, r) {
  const items = r.items;
  if (r.useEmbed) {
    const out = [];
    let embed = null;
    let size = 0;
    const start = (first) => {
      embed = new EmbedBuilder().setColor(colorOf(r.color));
      size = 0;
      if (first) {
        if (r.title) embed.setTitle(r.title);
        if (r.description) embed.setDescription(r.description);
        size += (r.title || '').length + (r.description || '').length;
      }
      out.push(embed);
    };
    start(true);
    items.forEach((it, i) => {
      const name = `${i + 1}. ${it.title || '—'}`.slice(0, 256);
      const value = (it.text || '​').slice(0, 1024);
      if (size + name.length + value.length > EMBED_BUDGET || embed.data.fields?.length >= 25) start(false);
      embed.addFields({ name, value });
      size += name.length + value.length;
    });
    setBrandFooter(out[out.length - 1], guild);
    return out.map((e) => ({ content: '', embeds: [e] }));
  }

  // نص عادي
  const lines = [];
  if (r.title) lines.push(`# ${r.title}`);
  if (r.description) lines.push(r.description, '');
  items.forEach((it, i) => lines.push(`**${i + 1}. ${it.title || '—'}**${it.text ? `\n${it.text}` : ''}\n`));
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    if ((cur + '\n' + line).length > 1900 && cur) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => ({ content: c.slice(0, 2000), embeds: [] }));
}

// ينشر القوانين بالقناة، وإذا نُشرت قبل بيعدّل نفس الرسائل بدل ما يكرر
async function publish(guild) {
  const r = db.getSettings(guild.id).rules;
  const ch = r.channelId && guild.channels.cache.get(r.channelId);
  if (!ch || !ch.isTextBased()) throw new Error(tr(guild, 'اختر قناة القوانين أول.'));
  if (!r.items.length) throw new Error(tr(guild, 'ضيف قانون واحد على الأقل.'));

  const payloads = buildPayloads(guild, r);
  const me = guild.client.user.id;
  const oldIds = r.messageIds;
  const newIds = [];

  try {
    for (let i = 0; i < payloads.length; i++) {
      let msg = null;
      if (oldIds[i]) {
        const old = await ch.messages.fetch(oldIds[i]).catch(() => null);
        if (old && old.author.id === me) msg = await old.edit(payloads[i]).catch(() => null);
      }
      if (!msg) msg = await ch.send(payloads[i]);
      newIds.push(msg.id);
    }
  } catch (e) {
    throw new Error(tr(guild, 'فشل نشر القوانين: {err}. تأكد من صلاحيات البوت بالقناة.', { err: e.message }));
  }

  // احذف الرسائل الزايدة، بس لو رسائل البوت نفسه
  for (const id of oldIds.slice(payloads.length)) {
    const old = await ch.messages.fetch(id).catch(() => null);
    if (old && old.author.id === me) await old.delete().catch(() => {});
  }

  const cur = db.getSettings(guild.id);
  db.setSettings(guild.id, { ...cur, rules: { ...cur.rules, messageIds: newIds } });
  return ch;
}

module.exports = { publish, buildPayloads };
