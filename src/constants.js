'use strict';

// صلاحيات صفحات لوحة التحكم اللي بتنعطى لفريق الإدارة
const STAFF_PERMS = ['stats', 'branding', 'tickets', 'ticketlog', 'rules', 'welcome', 'logs', 'protection', 'moderation'];

// النصوص الافتراضية لكل لغة (بتنطبق لما تختار "طبّق النصوص الافتراضية" عند تغيير اللغة)
const TEXTS = {
  ar: {
    ticketTitle: 'نظام تذاكر | Ticket System',
    placeholder: 'اختر نوع التذكرة ...',
    types: [
      { value: 'support', label: 'دعم فني', description: 'مشكلة أو سؤال تقني', emoji: '🛠️' },
      { value: 'report', label: 'تبليغ / شكوى', description: 'تبليغ عن لاعب أو مخالفة', emoji: '🚨' },
      { value: 'other', label: 'استفسار آخر', description: 'أي موضوع ثاني', emoji: '📩' },
    ],
    ticketWelcome:
      'أهلاً {user}، تم فتح تذكرتك من نوع **{type}**.\nاكتب مشكلتك بالتفصيل وانتظر الفريق، رح يردوا عليك بأقرب وقت.',
    welcome: 'أهلاً {user} في **{server}** 🎉\nأنت العضو رقم **{memberCount}**',
    dm: 'أهلاً فيك في {server}! نتمنى لك وقت ممتع.',
    leave: 'غادرنا **{username}** 😢',
    rulesTitle: 'قوانين السيرفر',
  },
  en: {
    ticketTitle: 'Ticket System',
    placeholder: 'Choose ticket type ...',
    types: [
      { value: 'support', label: 'Technical Support', description: 'A technical problem or question', emoji: '🛠️' },
      { value: 'report', label: 'Report / Complaint', description: 'Report a player or a violation', emoji: '🚨' },
      { value: 'other', label: 'Other Inquiry', description: 'Anything else', emoji: '📩' },
    ],
    ticketWelcome:
      'Hello {user}, your **{type}** ticket has been opened.\nDescribe your issue in detail and wait for the team, they will reply as soon as possible.',
    welcome: 'Welcome {user} to **{server}** 🎉\nYou are member number **{memberCount}**',
    dm: 'Welcome to {server}! We hope you have a great time.',
    leave: '**{username}** has left us 😢',
    rulesTitle: 'Server Rules',
  },
};

module.exports = { STAFF_PERMS, TEXTS };
