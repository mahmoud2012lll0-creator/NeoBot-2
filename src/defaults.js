'use strict';

const { TEXTS } = require('./constants');

const A = TEXTS.ar;

// الإعدادات الافتراضية لكل سيرفر.
// أي مفتاح جديد بتضيفه هون بيظهر تلقائياً بالسيرفرات القديمة.
// ملاحظة: الأعضاء الفارغين بالمصفوفات اللي فيها عنصر مثال (rules.items, staff.members) بينحذفوا بالتنقية.
module.exports = {
  language: 'ar',

  tickets: {
    enabled: true,
    categoryId: '',
    supportRoleIds: [],
    logChannelId: '',
    maxOpenPerUser: 1,
    panel: {
      title: A.ticketTitle,
      description: '',
      color: '#29B6F6',
      thumbnailUrl: '',
      bannerUrl: '',
      footer: '',
      placeholder: A.placeholder,
    },
    types: A.types.map((t) => ({ ...t, roleIds: [] })),
    messages: { welcome: A.ticketWelcome },
  },

  rules: {
    channelId: '',
    useEmbed: true,
    color: '#29B6F6',
    title: A.rulesTitle,
    description: '',
    items: [{ title: '', text: '' }],
    messageIds: [],
  },

  staff: {
    members: [{ id: '', tag: '', avatar: '', perms: [] }],
  },

  welcome: {
    enabled: false,
    channelId: '',
    message: A.welcome,
    useEmbed: true,
    color: '#29B6F6',
    bannerUrl: '',
    autoRoleIds: [],
    botAutoRoleIds: [],
    dmEnabled: false,
    dmMessage: A.dm,
    leaveEnabled: false,
    leaveChannelId: '',
    leaveMessage: A.leave,
  },

  logs: {
    enabled: false,
    channelId: '',
    events: {
      messageDelete: true,
      messageEdit: true,
      memberJoin: true,
      memberLeave: true,
      memberUpdate: true,
      ban: true,
      channel: true,
      role: true,
      voice: true,
    },
  },

  moderation: {
    logChannelId: '',
    dmOnAction: true,
    warnsBeforeTimeout: 3,
    autoTimeoutMinutes: 60,
  },

  protection: {
    enabled: false,
    logChannelId: '',
    whitelistRoleIds: [],
    whitelistChannelIds: [],
    antiSpam: { enabled: false, maxMessages: 5, perSeconds: 5, timeoutMinutes: 10 },
    antiLinks: { enabled: false, allowedDomains: [] },
    antiInvites: { enabled: false },
    antiMassMention: { enabled: false, max: 5, timeoutMinutes: 10 },
    antiRaid: { enabled: false, maxJoins: 8, perSeconds: 10, minAccountAgeDays: 0, action: 'kick' },
  },
};
