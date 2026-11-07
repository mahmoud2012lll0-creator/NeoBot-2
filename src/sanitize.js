'use strict';

const clone = (v) => JSON.parse(JSON.stringify(v));

// بياخد مدخلات (من الموقع مثلاً) وبيرجع نسخة بنفس شكل القالب (tpl) فقط:
// أي مفتاح غريب بينحذف، وأي نوع غلط بيرجع للقيمة الافتراضية.
function sanitize(input, tpl) {
  if (Array.isArray(tpl)) {
    if (!Array.isArray(input)) return clone(tpl);
    if (tpl.length && typeof tpl[0] === 'object') {
      return input.filter((x) => x && typeof x === 'object').map((x) => sanitize(x, tpl[0]));
    }
    return input.filter((x) => typeof x === 'string' || typeof x === 'number').map(String);
  }
  if (tpl && typeof tpl === 'object') {
    const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const out = {};
    for (const k of Object.keys(tpl)) out[k] = k in src ? sanitize(src[k], tpl[k]) : clone(tpl[k]);
    return out;
  }
  if (typeof tpl === 'boolean') return typeof input === 'boolean' ? input : tpl;
  if (typeof tpl === 'number') {
    const n = Number(input);
    return Number.isFinite(n) ? n : tpl;
  }
  return typeof input === 'string' ? input.slice(0, 2000) : tpl;
}

module.exports = { sanitize, clone };
