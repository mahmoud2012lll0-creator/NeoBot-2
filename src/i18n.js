'use strict';

// نظام الترجمة: المفتاح هو النص العربي نفسه، والقيمة الإنجليزية بالقاموس EN.
// الاستخدام: tr(guildOrId, 'نص عربي فيه {متغير}', { متغير: 5 })
// إذا ما في ترجمة إنجليزية للنص بيرجع العربي (فيه اختبار بيتأكد إنه ما في نقص).

const db = require('./db');
const EN = require('./i18n.en');

function langOf(g) {
  if (g === 'ar' || g === 'en') return g;
  const id = typeof g === 'string' ? g : g && g.id;
  return id ? db.getSettings(id).language : 'ar';
}

function tr(g, ar, vars = {}) {
  const s = langOf(g) === 'en' ? EN[ar] ?? ar : ar;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

module.exports = { tr, langOf, EN };
