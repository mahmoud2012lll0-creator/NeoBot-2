'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('../db');
const { colorOf, fill, validUrl, sendTo, memberVars, setBrandFooter } = require('./helpers');

async function onJoin(member) {
  const s = db.getSettings(member.guild.id).welcome;
  if (!s.enabled) return;
  const guild = member.guild;

  // الرتب التلقائية
  const ids = (member.user.bot ? s.botAutoRoleIds : s.autoRoleIds).filter((id) => guild.roles.cache.has(id));
  if (ids.length) {
    await member.roles.add(ids, 'Auto role').catch((e) => console.error('[welcome] auto role failed:', e.message));
  }

  const vars = memberVars(member);

  if (s.channelId) {
    const text = fill(s.message, vars);
    if (s.useEmbed) {
      const embed = new EmbedBuilder()
        .setColor(colorOf(s.color))
        .setDescription(text.slice(0, 4000))
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();
      if (validUrl(s.bannerUrl)) embed.setImage(s.bannerUrl);
      setBrandFooter(embed, guild);
      await sendTo(guild, s.channelId, {
        content: member.toString(),
        embeds: [embed],
        allowedMentions: { users: [member.id] },
      });
    } else {
      await sendTo(guild, s.channelId, { content: text.slice(0, 2000), allowedMentions: { users: [member.id] } });
    }
  }

  if (s.dmEnabled && !member.user.bot) {
    await member.send(fill(s.dmMessage, vars).slice(0, 2000)).catch(() => {});
  }
}

async function onLeave(member) {
  const s = db.getSettings(member.guild.id).welcome;
  if (!s.enabled || !s.leaveEnabled || !s.leaveChannelId) return;
  const vars = {
    user: member.user.toString(),
    username: member.user.username,
    id: member.id,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  };
  await sendTo(member.guild, s.leaveChannelId, {
    content: fill(s.leaveMessage, vars).slice(0, 2000),
    allowedMentions: { parse: [] },
  });
}

module.exports = { onJoin, onLeave };
