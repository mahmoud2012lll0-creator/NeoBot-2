'use strict';

const { SlashCommandBuilder, PermissionFlagsBits: P, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../db');
const { tr } = require('../i18n');
const tickets = require('./tickets');
const rules = require('./rules');
const branding = require('./branding');
const { EPH, sendTo } = require('./helpers');

const TYPE_NAME = {
  ban: 'حظر',
  unban: 'فك حظر',
  kick: 'طرد',
  timeout: 'تايم أوت',
  untimeout: 'فك تايم أوت',
  warn: 'تحذير',
};
// بنستعمل tr على المفتاح الحرفي عشان أداة فحص الترجمة تلقطه
const typeName = (g, t) =>
  ({
    ban: tr(g, 'حظر'),
    unban: tr(g, 'فك حظر'),
    kick: tr(g, 'طرد'),
    timeout: tr(g, 'تايم أوت'),
    untimeout: tr(g, 'فك تايم أوت'),
    warn: tr(g, 'تحذير'),
  })[t] || TYPE_NAME[t] || t;

/* ------------------------------ تعريف الأوامر (بلغة السيرفر) ------------------------------ */
function buildDefs(g) {
  const reasonOpt = (o) => o.setName('reason').setDescription(tr(g, 'السبب'));
  const userOpt = (o) => o.setName('user').setDescription(tr(g, 'العضو')).setRequired(true);
  return [
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription(tr(g, 'إرسال لوحة التذاكر'))
      .setDefaultMemberPermissions(P.ManageGuild)
      .addChannelOption((o) =>
        o.setName('channel').setDescription(tr(g, 'القناة (الافتراضي: الحالية)')).addChannelTypes(ChannelType.GuildText),
      ),
    new SlashCommandBuilder()
      .setName('rules')
      .setDescription(tr(g, 'نشر أو تحديث رسالة القوانين'))
      .setDefaultMemberPermissions(P.ManageGuild),
    new SlashCommandBuilder()
      .setName('branding')
      .setDescription(tr(g, 'غيّر اسم وصورة البوت بهالسيرفر'))
      .setDefaultMemberPermissions(P.ManageGuild)
      .addStringOption((o) => o.setName('name').setDescription(tr(g, 'الاسم الجديد (حتى 32 حرف)')).setMaxLength(32))
      .addAttachmentOption((o) => o.setName('logo').setDescription(tr(g, 'صورة اللوقو (png, jpg, gif, webp)')))
      .addBooleanOption((o) => o.setName('reset').setDescription(tr(g, 'رجّع الاسم والصورة الأصلية'))),
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription(tr(g, 'حظر عضو'))
      .setDefaultMemberPermissions(P.BanMembers)
      .addUserOption(userOpt)
      .addStringOption(reasonOpt)
      .addIntegerOption((o) =>
        o.setName('delete_days').setDescription(tr(g, 'حذف رسائل آخر X أيام (0-7)')).setMinValue(0).setMaxValue(7),
      ),
    new SlashCommandBuilder()
      .setName('unban')
      .setDescription(tr(g, 'فك حظر'))
      .setDefaultMemberPermissions(P.BanMembers)
      .addStringOption((o) => o.setName('user_id').setDescription(tr(g, 'آيدي العضو')).setRequired(true))
      .addStringOption(reasonOpt),
    new SlashCommandBuilder()
      .setName('kick')
      .setDescription(tr(g, 'طرد عضو'))
      .setDefaultMemberPermissions(P.KickMembers)
      .addUserOption(userOpt)
      .addStringOption(reasonOpt),
    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription(tr(g, 'تايم أوت لعضو'))
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption(userOpt)
      .addIntegerOption((o) =>
        o.setName('minutes').setDescription(tr(g, 'المدة بالدقائق')).setRequired(true).setMinValue(1).setMaxValue(40320),
      )
      .addStringOption(reasonOpt),
    new SlashCommandBuilder()
      .setName('untimeout')
      .setDescription(tr(g, 'فك التايم أوت'))
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption(userOpt),
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription(tr(g, 'تحذير عضو'))
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption(userOpt)
      .addStringOption(reasonOpt),
    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription(tr(g, 'سجل عقوبات عضو'))
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption(userOpt),
    new SlashCommandBuilder()
      .setName('clearwarns')
      .setDescription(tr(g, 'تصفير تحذيرات عضو'))
      .setDefaultMemberPermissions(P.ModerateMembers)
      .addUserOption(userOpt),
    new SlashCommandBuilder()
      .setName('purge')
      .setDescription(tr(g, 'حذف رسائل'))
      .setDefaultMemberPermissions(P.ManageMessages)
      .addIntegerOption((o) =>
        o.setName('amount').setDescription(tr(g, 'العدد (1-100)')).setRequired(true).setMinValue(1).setMaxValue(100),
      )
      .addUserOption((o) => o.setName('user').setDescription(tr(g, 'حذف رسائل عضو معيّن فقط'))),
  ].map((d) => d.toJSON());
}

async function register(guild) {
  try {
    await guild.commands.set(buildDefs(guild));
  } catch (e) {
    console.error(`[commands] فشل تسجيل الأوامر بسيرفر ${guild.name}: ${e.message}`);
  }
}

/* ------------------------------ أدوات مشتركة ------------------------------ */
function hierarchyError(i, target) {
  const g = i.guild;
  if (!target) return null; // مش موجود بالسيرفر
  if (target.id === i.user.id) return tr(g, 'ما بتقدر تطبّق هالأمر على نفسك.');
  if (target.id === i.client.user.id) return tr(g, 'ما بتقدر تطبّقه عليّ 😅');
  if (target.id === g.ownerId) return tr(g, 'ما بتقدر تطبّقه على صاحب السيرفر.');
  if (g.ownerId !== i.user.id && i.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return tr(g, 'رتبة هالعضو أعلى منك أو تساويك.');
  }
  return null;
}

async function record(i, type, user, reason, extra = {}) {
  const g = i.guild;
  const s = db.getSettings(g.id);
  const c = db.addCase(g.id, {
    type,
    userId: user.id,
    userTag: user.username,
    modId: i.user.id,
    modTag: i.user.username,
    reason,
    ...extra,
  });
  const embed = new EmbedBuilder()
    .setColor(0x29b6f6)
    .setTitle(`Case #${c.number} | ${typeName(g, type)}`)
    .addFields(
      { name: tr(g, 'العضو'), value: `${user} (${user.id})`, inline: true },
      { name: tr(g, 'المشرف'), value: `${i.user}`, inline: true },
      { name: tr(g, 'السبب'), value: reason || '—' },
    )
    .setTimestamp();
  if (extra.minutes) embed.addFields({ name: tr(g, 'المدة'), value: tr(g, '{n} دقيقة', { n: extra.minutes }), inline: true });
  await sendTo(g, s.moderation.logChannelId, { embeds: [embed] });
  return c;
}

async function dm(i, user, type, reason) {
  const g = i.guild;
  if (!db.getSettings(g.id).moderation.dmOnAction) return;
  await user
    .send(tr(g, 'تم تطبيق **{type}** عليك في **{server}**.\nالسبب: {reason}', { type: typeName(g, type), server: g.name, reason }))
    .catch(() => {});
}

const reasonOf = (i) => (i.options.getString('reason') || tr(i.guild, 'بدون سبب')).slice(0, 400);

/* ------------------------------ الأوامر ------------------------------ */
const handlers = {
  async panel(i) {
    const g = i.guild;
    const ch = i.options.getChannel('channel') || i.channel;
    await i.deferReply({ flags: EPH });
    try {
      await tickets.sendPanel(g, ch.id);
      await i.editReply(tr(g, '✅ تم إرسال اللوحة في {channel}', { channel: ch.toString() }));
    } catch (e) {
      await i.editReply(`❌ ${e.message}`);
    }
  },

  async rules(i) {
    await i.deferReply({ flags: EPH });
    try {
      const ch = await rules.publish(i.guild);
      await i.editReply(tr(i.guild, '✅ تم نشر القوانين في {channel}', { channel: ch.toString() }));
    } catch (e) {
      await i.editReply(`❌ ${e.message}`);
    }
  },

  async branding(i) {
    const g = i.guild;
    const name = i.options.getString('name');
    const att = i.options.getAttachment('logo');
    const reset = i.options.getBoolean('reset');
    if (!name && !att && !reset) {
      return i.reply({ content: tr(g, 'اكتب `name` أو أرفق `logo` أو فعّل `reset`.'), flags: EPH });
    }
    await i.deferReply({ flags: EPH });
    try {
      const logo = att && !reset ? await branding.attachmentToDataUri(att, g) : undefined;
      await branding.apply(i.client, g, { name: name ?? undefined, logo, reset: !!reset });
      return i.editReply(reset ? tr(g, '✅ رجعت الاسم والصورة الأصلية.') : tr(g, '✅ تم تحديث هوية البوت بهالسيرفر.'));
    } catch (e) {
      return i.editReply(`❌ ${e.message}`);
    }
  },

  async ban(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    const reason = reasonOf(i);
    const err = hierarchyError(i, member);
    if (err) return i.reply({ content: err, flags: EPH });
    if (member && !member.bannable) return i.reply({ content: tr(g, 'ما بقدر أحظره (رتبته أعلى من رتبتي).'), flags: EPH });
    await i.deferReply();
    await dm(i, user, 'ban', reason);
    try {
      await g.members.ban(user, {
        reason: `${reason} | by ${i.user.username}`,
        deleteMessageSeconds: (i.options.getInteger('delete_days') || 0) * 86400,
      });
    } catch (e) {
      return i.editReply(tr(g, '❌ فشل الحظر: {err}', { err: e.message }));
    }
    const c = await record(i, 'ban', user, reason);
    return i.editReply(tr(g, '🔨 تم حظر **{name}** | Case #{n}', { name: user.username, n: c.number }));
  },

  async unban(i) {
    const g = i.guild;
    const id = i.options.getString('user_id').trim();
    const reason = reasonOf(i);
    await i.deferReply();
    try {
      const user = await i.client.users.fetch(id);
      await g.members.unban(id, `${reason} | by ${i.user.username}`);
      const c = await record(i, 'unban', user, reason);
      return i.editReply(tr(g, '✅ تم فك الحظر عن **{name}** | Case #{n}', { name: user.username, n: c.number }));
    } catch {
      return i.editReply(tr(g, '❌ ما لقيت هالعضو بقائمة المحظورين (تأكد من الآيدي).'));
    }
  },

  async kick(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    const reason = reasonOf(i);
    if (!member) return i.reply({ content: tr(g, 'هالعضو مش موجود بالسيرفر.'), flags: EPH });
    const err = hierarchyError(i, member);
    if (err) return i.reply({ content: err, flags: EPH });
    if (!member.kickable) return i.reply({ content: tr(g, 'ما بقدر أطرده (رتبته أعلى من رتبتي).'), flags: EPH });
    await i.deferReply();
    await dm(i, user, 'kick', reason);
    try {
      await member.kick(`${reason} | by ${i.user.username}`);
    } catch (e) {
      return i.editReply(tr(g, '❌ فشل الطرد: {err}', { err: e.message }));
    }
    const c = await record(i, 'kick', user, reason);
    return i.editReply(tr(g, '👢 تم طرد **{name}** | Case #{n}', { name: user.username, n: c.number }));
  },

  async timeout(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    const minutes = i.options.getInteger('minutes');
    const reason = reasonOf(i);
    if (!member) return i.reply({ content: tr(g, 'هالعضو مش موجود بالسيرفر.'), flags: EPH });
    const err = hierarchyError(i, member);
    if (err) return i.reply({ content: err, flags: EPH });
    if (!member.moderatable) {
      return i.reply({ content: tr(g, 'ما بقدر أعطيه تايم أوت (رتبته أعلى من رتبتي).'), flags: EPH });
    }
    await i.deferReply();
    try {
      await member.timeout(minutes * 60000, `${reason} | by ${i.user.username}`);
    } catch (e) {
      return i.editReply(tr(g, '❌ فشل: {err}', { err: e.message }));
    }
    await dm(i, user, 'timeout', `${reason} (${tr(g, '{n} دقيقة', { n: minutes })})`);
    const c = await record(i, 'timeout', user, reason, { minutes });
    return i.editReply(
      tr(g, '🔇 تم إعطاء **{name}** تايم أوت {n} دقيقة | Case #{c}', { name: user.username, n: minutes, c: c.number }),
    );
  },

  async untimeout(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    if (!member) return i.reply({ content: tr(g, 'هالعضو مش موجود بالسيرفر.'), flags: EPH });
    await i.deferReply();
    try {
      await member.timeout(null, `by ${i.user.username}`);
    } catch (e) {
      return i.editReply(tr(g, '❌ فشل: {err}', { err: e.message }));
    }
    const c = await record(i, 'untimeout', user, '—');
    return i.editReply(tr(g, '🔊 تم فك التايم أوت عن **{name}** | Case #{n}', { name: user.username, n: c.number }));
  },

  async warn(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    const reason = reasonOf(i);
    const err = hierarchyError(i, member);
    if (err) return i.reply({ content: err, flags: EPH });
    if (user.bot) return i.reply({ content: tr(g, 'ما بتقدر تحذّر بوت.'), flags: EPH });
    await i.deferReply();
    await dm(i, user, 'warn', reason);
    const c = await record(i, 'warn', user, reason);
    const n = db.activeWarns(g.id, user.id);
    let text = tr(g, '⚠️ تم تحذير **{name}** (تحذير رقم {w}) | Case #{n}', { name: user.username, w: n, n: c.number });

    const s = db.getSettings(g.id).moderation;
    if (s.warnsBeforeTimeout > 0 && n >= s.warnsBeforeTimeout && member && member.moderatable) {
      const ok = await member
        .timeout(s.autoTimeoutMinutes * 60000, `Auto: ${n} warnings`)
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await record(i, 'timeout', user, tr(g, 'تلقائي: وصل {n} تحذيرات', { n }), { minutes: s.autoTimeoutMinutes });
        text += `\n${tr(g, '🔇 انعطى تايم أوت تلقائي {n} دقيقة.', { n: s.autoTimeoutMinutes })}`;
      }
    }
    return i.editReply(text);
  },

  async warnings(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const { items, total } = db.listCases(g.id, { userId: user.id, limit: 10 });
    if (!total) return i.reply({ content: tr(g, '**{name}** نظيف، ما عليه شي.', { name: user.username }), flags: EPH });
    const embed = new EmbedBuilder()
      .setColor(0x29b6f6)
      .setTitle(tr(g, 'سجل {name}', { name: user.username }))
      .setDescription(
        items
          .map(
            (c) =>
              `**#${c.number}** ${typeName(g, c.type)}${c.cleared ? ` (${tr(g, 'مصفّر')})` : ''} — ${c.reason || '—'} <t:${Math.floor(c.createdAt / 1000)}:R>`,
          )
          .join('\n')
          .slice(0, 4000),
      )
      .setFooter({
        text: tr(g, 'تحذيرات فعّالة: {a} | إجمالي السجل: {t}', { a: db.activeWarns(g.id, user.id), t: total }),
      });
    return i.reply({ embeds: [embed], flags: EPH });
  },

  async clearwarns(i) {
    const g = i.guild;
    const user = i.options.getUser('user');
    const n = db.clearWarns(g.id, user.id);
    return i.reply({ content: tr(g, '🧹 تم تصفير {n} تحذير عن **{name}**.', { n, name: user.username }), flags: EPH });
  },

  async purge(i) {
    const g = i.guild;
    const amount = i.options.getInteger('amount');
    const user = i.options.getUser('user');
    await i.deferReply({ flags: EPH });
    try {
      let msgs = await i.channel.messages.fetch({ limit: 100 });
      if (user) msgs = msgs.filter((m) => m.author.id === user.id);
      const deleted = await i.channel.bulkDelete([...msgs.values()].slice(0, amount), true);
      return i.editReply(tr(g, '🧹 تم حذف {n} رسالة. (ما بينحذف أقدم من 14 يوم)', { n: deleted.size }));
    } catch (e) {
      return i.editReply(tr(g, '❌ فشل الحذف: {err}', { err: e.message }));
    }
  },
};

async function handle(i) {
  const fn = handlers[i.commandName];
  if (fn) await fn(i);
}

module.exports = { register, handle };
