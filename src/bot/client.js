'use strict';

const { Client, GatewayIntentBits, Partials, Events, MessageFlags } = require('discord.js');
const commands = require('./commands');
const tickets = require('./tickets');
const welcome = require('./welcome');
const protection = require('./protection');
const logs = require('./logs');
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { brandOf, setBrandFooter } = require('./helpers');
const { tr } = require('../i18n');

const logErr = (where) => (e) => console.error(`[${where}]`, e);

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // privileged
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // privileged
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[bot] شغال كـ ${c.user.tag} على ${c.guilds.cache.size} سيرفر`);
    for (const g of c.guilds.cache.values()) await commands.register(g);
  });
  client.on(Events.GuildCreate, async (g) => {
    await commands.register(g);
    try {
      const me = g.members.me;
      const ch =
        g.systemChannel ||
        g.channels.cache.find(
          (c) => c.type === ChannelType.GuildText && c.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages),
        );
      if (!ch) return;
      const embed = new EmbedBuilder()
        .setColor(0x29b6f6)
        .setTitle(tr(g, 'شكراً لإضافتي! 👋'))
        .setDescription(
          [
            tr(g, '**ابدأ من هون:**'),
            tr(g, '• `/branding` غيّر اسمي وصورتي بسيرفرك'),
            tr(g, '• `/panel` أرسل لوحة التذاكر'),
            tr(g, '• `/rules` انشر القوانين'),
            tr(g, '• من لوحة التحكم فعّل الترحيب واللوقات والحماية، وغيّر اللغة (عربي/English)'),
            '',
            tr(g, 'ملاحظة: خلّي رتبتي أعلى من الرتب اللي بدي أعطيها أو أعاقب أصحابها.'),
          ].join('\n'),
        );
      const b = brandOf(g);
      if (b.logo) embed.setThumbnail(b.logo);
      setBrandFooter(embed, g);
      await ch.send({ embeds: [embed] });
    } catch (e) {
      console.error('[guildCreate] welcome failed:', e.message);
    }
  });
  client.on(Events.Error, logErr('client'));

  logs.register(client);

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const punished = await protection.onJoin(member);
      if (!punished) await welcome.onJoin(member);
    } catch (e) {
      logErr('join')(e);
    }
  });
  client.on(Events.GuildMemberRemove, (member) => welcome.onLeave(member).catch(logErr('leave')));
  client.on(Events.MessageCreate, (m) => protection.onMessage(m).catch(logErr('protection')));

  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (!i.guild) return;
      if (i.isChatInputCommand()) return await commands.handle(i);
      if (i.isStringSelectMenu() && i.customId === 'ticket:select') return await tickets.handleSelect(i);
      if (i.isButton() && i.customId.startsWith('ticket:')) return await tickets.handleButton(i);
    } catch (err) {
      console.error('[interaction]', err);
      const payload = { content: 'صار خطأ غير متوقع.', flags: MessageFlags.Ephemeral };
      try {
        if (i.deferred || i.replied) await i.followUp(payload);
        else await i.reply(payload);
      } catch {
        /* تجاهل */
      }
    }
  });

  return client;
}

module.exports = { createClient };
