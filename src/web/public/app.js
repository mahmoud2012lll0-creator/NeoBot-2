'use strict';

/* ============================== أدوات ============================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CDN_RE = /^https:\/\/cdn\.discordapp\.com\/[\w\-./?=&%@]+$/;
const safeCdn = (u) => (typeof u === 'string' && CDN_RE.test(u) ? u : '');
const safeAvatar = safeCdn;

const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setp(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => (a[k] ??= {}), o);
  t[last] = v;
}

/* ============================== لغة الواجهة (عربي / English) ============================== */
let uiLang = 'ar';
try {
  uiLang = localStorage.getItem('neobot.ui') === 'en' ? 'en' : 'ar';
} catch {
  /* ignore */
}
const UI = window.UI_EN || {};
const PAT = window.UI_PATTERNS || [];
const AR_RE = /[؀-ۿ]/;

// بيترجم نص عربي للإنجليزي (إذا اللغة English). النص اللي مش بالقاموس بيضل كما هو.
function TT(s) {
  if (uiLang !== 'en' || !s) return s;
  const t = String(s);
  if (UI[t]) return UI[t];
  const m = /^([^\u0600-\u06FF]*)([\s\S]*?)([\s.:؟?…!]*)$/.exec(t);
  if (m && m[2]) {
    if (UI[m[2] + m[3]]) return m[1] + UI[m[2] + m[3]];
    if (UI[m[2]]) return m[1] + UI[m[2]] + m[3];
  }
  for (const [re, fn] of PAT) {
    const x = re.exec(t);
    if (x) return fn(...x.slice(1));
  }
  return t;
}

function translateDom(root = document.body) {
  if (uiLang !== 'en') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const tag = n.parentElement && n.parentElement.tagName;
    if (tag === 'TEXTAREA' || tag === 'SCRIPT' || tag === 'STYLE') continue;
    const raw = n.nodeValue;
    const t = raw.trim();
    if (!t || !AR_RE.test(t)) continue;
    const r = TT(t);
    if (r !== t) n.nodeValue = raw.replace(t, () => r);
  }
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
    ['placeholder', 'title', 'aria-label'].forEach((a) => {
      const v = el.getAttribute(a);
      if (v && AR_RE.test(v)) el.setAttribute(a, TT(v));
    });
  });
}

function applyDir() {
  document.documentElement.lang = uiLang;
  document.documentElement.dir = uiLang === 'en' ? 'ltr' : 'rtl';
  document.title = uiLang === 'en' ? 'NeoBot | Dashboard' : 'NeoBot | لوحة التحكم';
}

function setHTML(el, html) {
  el.innerHTML = html;
  translateDom(el);
}

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { hour12: false }).slice(0, 17) : '—');
const fmtMin = (m) =>
  uiLang === 'en'
    ? m >= 120 ? `${(m / 60).toFixed(1)} h` : `${m} min`
    : m >= 120 ? `${(m / 60).toFixed(1)} ساعة` : `${m} دقيقة`;

let toastTimer;
function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = TT(msg);
  t.className = `toast ${type}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.method && opts.method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.method && opts.method !== 'GET' ? JSON.stringify(opts.body || {}) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (res.status === 401) {
    // لا نعيد الرسم إذا كنا أصلاً غير مسجلين (بيمنع حلقة لا نهائية)
    if (state.user) {
      state.user = null;
      render();
    }
    throw new Error('انتهت الجلسة');
  }
  if (!res.ok) throw new Error((data && data.error) || `خطأ ${res.status}`);
  return data;
}

/* ============================== الحالة ============================== */
const state = {
  user: null,
  guilds: [],
  invite: '',
  gid: null,
  meta: null,
  settings: null,
  page: 'stats',
  dirty: false,
  openRules: new Set(),
  log: { status: '', q: '', page: 1 },
  cases: { type: '', page: 1 },
  ticketId: null,
  view: '',
  owner: null,
};

// [المفتاح, أيقونة, الاسم, الصلاحية المطلوبة]  ('__full' = صلاحية كاملة فقط)
const PAGES = [
  ['stats', '📊', 'الإحصائيات', 'stats'],
  ['branding', '🎨', 'هوية البوت', 'branding'],
  ['tickets', '🎫', 'التذاكر', 'tickets'],
  ['ticketlog', '🗂️', 'سجل التذاكر', 'ticketlog'],
  ['rules', '📜', 'القوانين', 'rules'],
  ['welcome', '👋', 'الترحيب والرتب', 'welcome'],
  ['logs', '🧾', 'اللوقات', 'logs'],
  ['protection', '🛡️', 'الحماية', 'protection'],
  ['moderation', '🔨', 'المودريشن', 'moderation'],
  ['staff', '👥', 'الإدارة', '__full'],
];
const SAVE_PAGES = new Set(['tickets', 'rules', 'welcome', 'logs', 'protection', 'moderation', 'staff']);
const PERM_LABELS = [
  ['stats', 'الإحصائيات'],
  ['branding', 'هوية البوت'],
  ['tickets', 'إعدادات التذاكر'],
  ['ticketlog', 'سجل التذاكر'],
  ['rules', 'القوانين'],
  ['welcome', 'الترحيب والرتب'],
  ['logs', 'اللوقات'],
  ['protection', 'الحماية'],
  ['moderation', 'المودريشن'],
];

function visiblePages() {
  const acc = (state.meta && state.meta.access) || { full: false, perms: [] };
  return PAGES.filter(([, , , perm]) => (perm === '__full' ? acc.full : acc.full || acc.perms.includes(perm)));
}

/* ============================== حقول النماذج ============================== */
const val = (p) => getp(state.settings, p);

const F = {
  text: (p, label, hint = '') =>
    `<div class="field"><label>${label}</label><input type="text" data-path="${p}" value="${esc(val(p))}">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`,
  url: (p, label, hint = '') =>
    `<div class="field"><label>${label}</label><input type="url" dir="ltr" placeholder="https://..." data-path="${p}" value="${esc(val(p))}">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`,
  area: (p, label, hint = '') =>
    `<div class="field"><label>${label}</label><textarea data-path="${p}">${esc(val(p))}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`,
  num: (p, label, min, max, hint = '') =>
    `<div class="field"><label>${label}</label><input type="number" min="${min}" max="${max}" data-path="${p}" value="${esc(val(p))}">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`,
  color: (p, label) =>
    `<div class="field"><label>${label}</label><input type="color" data-path="${p}" value="${esc(val(p))}"></div>`,
  sw: (p, label) =>
    `<label class="switch"><input type="checkbox" data-path="${p}" ${val(p) ? 'checked' : ''}><span>${label}</span></label>`,
  select: (p, label, items, none = '— بدون —') => {
    const cur = val(p);
    const opts = items.map((i) => `<option value="${esc(i.id)}" ${i.id === cur ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
    return `<div class="field"><label>${label}</label><select data-path="${p}"><option value="">${none}</option>${opts}</select></div>`;
  },
  chan: (p, label) => F.select(p, label, state.meta.channels.map((c) => ({ id: c.id, name: '# ' + c.name }))),
  cat: (p, label) => F.select(p, label, state.meta.categories),
  fixed: (p, label, items) => {
    const cur = val(p);
    return `<div class="field"><label>${label}</label><select data-path="${p}">${items
      .map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`)
      .join('')}</select></div>`;
  },
  chips: (p, label, items, prefix = '') => {
    const cur = new Set(val(p) || []);
    return `<div class="field"><label>${label}</label>${chipBox(items, cur, prefix, `data-path="${p}" data-kind="chips"`)}</div>`;
  },
  roles: (p, label) => F.chips(p, label, state.meta.roles, '@ '),
  channels: (p, label) => F.chips(p, label, state.meta.channels, '# '),
  lines: (p, label, hint = '') =>
    `<div class="field"><label>${label}</label><textarea data-kind="lines" data-path="${p}" dir="ltr">${esc((val(p) || []).join('\n'))}</textarea>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`,
};

function chipBox(items, selected, prefix, attrs) {
  const chips = items
    .map((i) => `<span class="chip ${selected.has(i.id) ? 'on' : ''}" data-id="${esc(i.id)}">${prefix}${esc(i.name)}</span>`)
    .join('');
  return `<div class="chips" ${attrs}>${chips || '<span class="hint">ما في عناصر</span>'}</div>`;
}

function collect() {
  if (!state.settings) return;
  $$('#content [data-path]').forEach((el) => {
    const p = el.dataset.path;
    let v;
    if (el.dataset.kind === 'chips') v = $$('.chip.on', el).map((c) => c.dataset.id);
    else if (el.dataset.kind === 'lines') v = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
    else if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') v = el.value === '' ? 0 : Number(el.value);
    else v = el.value;
    setp(state.settings, p, v);
  });

  if ($('#types')) {
    state.settings.tickets.types = $$('#content .tcard').map((r) => ({
      emoji: $('[data-f=emoji]', r).value,
      value: $('[data-f=value]', r).value,
      label: $('[data-f=label]', r).value,
      description: $('[data-f=description]', r).value,
      roleIds: $$('[data-f=roleIds] .chip.on', r).map((c) => c.dataset.id),
    }));
  }

  if ($('#rulesList')) {
    state.settings.rules.items = $$('#rulesList .rule').map((r) => ({
      title: $('[data-r=title]', r).value,
      text: $('[data-r=text]', r).value,
    }));
    state.openRules = new Set($$('#rulesList .rule').flatMap((r, i) => (r.open ? [i] : [])));
  }

  if ($('#staffList')) {
    const old = new Map(state.settings.staff.members.map((m) => [m.id, m]));
    state.settings.staff.members = $$('#staffList .smember').map((r) => {
      const prev = old.get(r.dataset.id) || {};
      return {
        id: r.dataset.id,
        tag: prev.tag || '',
        avatar: prev.avatar || '',
        perms: $$('input[data-sperm]:checked', r).map((c) => c.dataset.sperm),
      };
    });
  }
}

async function save() {
  collect();
  const btn = $('#saveBtn');
  if (btn) btn.disabled = true;
  try {
    state.settings = await api(`/api/guilds/${state.gid}/settings`, { method: 'PUT', body: state.settings });
    state.dirty = false;
    toast('تم الحفظ ✅');
    renderPage();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================== الصفحات ============================== */
const section = (title, body) => `<div class="card"><h3>${title}</h3>${body}</div>`;
const notice = (html, kind = '') => `<div class="notice ${kind}">${html}</div>`;

const pages = {
  async stats() {
    const s = await api(`/api/guilds/${state.gid}/stats`);
    const t = s.tickets;
    const max = Math.max(1, ...t.perDay.map((d) => d.count));
    const maxType = Math.max(1, ...t.byType.map((x) => x.count));
    const tile = (n, l) => `<div class="stat" data-tilt><b>${esc(n)}</b><span>${l}</span></div>`;
    const caseNames = { ban: 'حظر', kick: 'طرد', timeout: 'تايم أوت', warn: 'تحذير', unban: 'فك حظر', untimeout: 'فك تايم أوت' };
    return `
      <h1>الإحصائيات</h1><p class="sub">نظرة سريعة على نشاط السيرفر.</p>
      <div class="grid g4" style="margin-bottom:16px">
        ${tile(s.members, 'عدد الأعضاء')}${tile(t.total, 'كل التذاكر')}${tile(t.open, 'مفتوحة الآن')}${tile(t.today, 'تذاكر اليوم')}
        ${tile(t.closed, 'مغلقة')}${tile(t.last30, 'آخر 30 يوم')}${tile(t.claimedRate + '%', 'نسبة الاستلام')}${tile(t.avgCloseMinutes ? fmtMin(t.avgCloseMinutes) : '—', 'متوسط وقت الإغلاق')}
      </div>
      <div class="grid g2">
        ${section('التذاكر آخر 7 أيام', `<div class="bars">${t.perDay.map((d) => `<div class="bar"><span>${d.count}</span><div style="height:${(d.count / max) * 100}%"></div><span>${esc(d.date.slice(5))}</span></div>`).join('')}</div>`)}
        ${section('حسب النوع', t.byType.length ? t.byType.map((x) => `<div class="hbar"><span>${esc(x.label)}</span><div class="track"><i style="width:${(x.count / maxType) * 100}%"></i></div><span>${x.count}</span></div>`).join('') : '<div class="empty">لا يوجد بيانات</div>')}
        ${section('أفضل فريق الدعم (استلام)', t.topStaff.length ? t.topStaff.map((u, i) => `<div class="hbar"><span>${i + 1}. ${esc(u.tag || u.id)}</span><div class="track"><i style="width:${(u.count / t.topStaff[0].count) * 100}%"></i></div><span>${u.count}</span></div>`).join('') : '<div class="empty">لا يوجد بيانات</div>')}
        ${section('عقوبات المودريشن', Object.keys(s.cases).length ? Object.entries(s.cases).map(([k, n]) => `<div class="hbar"><span>${caseNames[k] || esc(k)}</span><div class="track"><i style="width:${Math.min(100, n * 5)}%"></i></div><span>${n}</span></div>`).join('') : '<div class="empty">لا يوجد بيانات</div>')}
      </div>`;
  },

  async branding() {
    const b = state.meta.bot || { name: '', logo: '' };
    const full = state.meta.access.full;
    const lang = state.settings.language;
    return `
      <h1>هوية البوت</h1>
      <p class="sub">غيّر اسم وصورة البوت لهالسيرفر فقط. الاسم والصورة بيظهروا على رسائله وإيمبداته وفوتر اللوحات.</p>
      ${section(
        'الاسم والصورة',
        `<div class="row" style="align-items:flex-start;gap:22px">
          <img id="brandImg" class="biglogo" data-tilt src="${esc(safeAvatar(b.logo) || '/logo.png')}" alt="">
          <div style="flex:1;min-width:240px;display:grid;gap:14px">
            <div class="field"><label>اسم البوت (حتى 32 حرف)</label><input type="text" id="brandName" maxlength="32" value="${esc(b.name)}"></div>
            <div class="field"><label>صورة اللوقو (png, jpg, gif, webp — حتى 8MB)</label><input type="file" id="brandFile" accept="image/png,image/jpeg,image/gif,image/webp"></div>
            <div class="row"><button class="btn" data-act="brandapply" type="button">تطبيق</button>
              <button class="btn ghost" data-act="brandreset" type="button">رجوع للأصلي</button></div>
            <div class="hint">تغيير الصورة إله حد يومي من ديسكورد، فإذا رفض جرّب بعد شوي. نفس الشي بتعمله من ديسكورد بأمر <b>/branding</b>.</div>
          </div></div>`,
      )}
      ${full ? section(
        'لغة البوت',
        `<p class="hint" style="margin:0 0 12px">اللغة اللي بيحكي فيها البوت بهالسيرفر (الردود، اللوقات، التذاكر، أوامر السلاش).</p>
         <div class="grid g2"><div class="field"><label>اللغة</label>
           <select id="botLang"><option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option></select></div>
         <div style="padding-top:26px"><label class="switch"><input type="checkbox" id="botLangTexts"><span>طبّق النصوص الافتراضية للغة الجديدة (عنوان اللوحة، أنواع التذاكر، رسائل الترحيب)</span></label></div></div>
         <div style="margin-top:14px"><button class="btn" data-act="langapply" type="button">تغيير لغة البوت</button></div>`,
      ) : ''}`;
  },

  async tickets() {
    const t = state.settings.tickets;
    const p = t.panel;
    const noRoles = !t.supportRoleIds.length && t.types.every((x) => !x.roleIds.length);
    const types = t.types
      .map(
        (ty) => `<div class="tcard">
          <div class="trow">
            <input type="text" data-f="emoji" value="${esc(ty.emoji)}" placeholder="🛠️" maxlength="60">
            <input type="text" data-f="value" value="${esc(ty.value)}" placeholder="id (إنجليزي)" dir="ltr" maxlength="40">
            <input type="text" data-f="label" value="${esc(ty.label)}" placeholder="الاسم" maxlength="100">
            <input type="text" data-f="description" value="${esc(ty.description)}" placeholder="وصف قصير" maxlength="100">
            <button class="btn danger" data-act="deltype" type="button">✕</button></div>
          <div class="lbl" style="margin:6px 0 4px">رتب الإدارة لهالنوع (فاضي = رتب الدعم العامة)</div>
          ${chipBox(state.meta.roles, new Set(ty.roleIds), '@ ', 'data-f="roleIds"')}</div>`,
      )
      .join('');
    return `
      <h1>نظام التذاكر</h1><p class="sub">إعدادات اللوحة وأنواع التذاكر وصلاحيات الفريق.</p>
      ${notice('🔒 التذكرة بيشوفها بس: صاحبها + رتب الإدارة المحددة + الأدمنز. باقي الأعضاء ما بيشوفوها أبداً.')}
      ${noRoles ? notice('⚠️ ما حددت أي رتبة إدارة، فالتذاكر رح يشوفها الأدمنز بس. اختر الرتب من تحت.', 'warn') : ''}
      ${section(
        'عام',
        `<div class="grid g2">${F.sw('tickets.enabled', 'تفعيل نظام التذاكر')}<span></span>
          ${F.cat('tickets.categoryId', 'الكاتيجوري (وين تنفتح التذاكر)')}
          ${F.chan('tickets.logChannelId', 'قناة لوج التذاكر (نسخة المحادثة)')}
          ${F.num('tickets.maxOpenPerUser', 'أقصى عدد تذاكر مفتوحة للعضو', 1, 10)}</div>
         <div style="margin-top:14px">${F.roles('tickets.supportRoleIds', 'رتب الإدارة العامة (بتشوف كل التذاكر)')}</div>`,
      )}
      ${section(
        'شكل اللوحة',
        `<div class="grid g2">${F.text('tickets.panel.title', 'العنوان')}${F.text('tickets.panel.placeholder', 'نص القائمة المنسدلة')}
          ${F.color('tickets.panel.color', 'لون الشريط')}${F.text('tickets.panel.footer', 'الفوتر', 'اتركه فاضي ليظهر: Powered by (اسم البوت بالسيرفر)')}
          ${F.url('tickets.panel.thumbnailUrl', 'اللوقو (صورة صغيرة)', 'اتركه فاضي لاستخدام صورة البوت بهالسيرفر')}${F.url('tickets.panel.bannerUrl', 'البانر (صورة كبيرة)')}</div>
         <div style="margin-top:14px">${F.area('tickets.panel.description', 'وصف اللوحة (اختياري)')}</div>
         <div class="lbl" style="margin:14px 0 6px">معاينة</div>
         <div id="preview" style="border-inline-start:4px solid ${esc(p.color)};background:var(--panel2);border-radius:8px;padding:12px;max-width:460px">
           <b id="pvTitle">${esc(p.title)}</b>
           <div id="pvImg" style="margin-top:8px">${p.bannerUrl ? `<img src="${esc(p.bannerUrl)}" style="width:100%;border-radius:6px" alt="">` : ''}</div>
           <div class="hint" id="pvFoot" style="margin-top:6px">${esc(p.footer)}</div></div>`,
      )}
      ${section(
        'أنواع التذاكر (القائمة المنسدلة)',
        `<div id="types">${types}</div><button class="btn ghost" data-act="addtype" type="button">+ إضافة نوع</button>
         <div class="hint" style="margin-top:8px">الحد الأقصى 25 نوع. الـ id لازم يكون أحرف إنجليزية وأرقام فقط.</div>`,
      )}
      ${section('رسالة الترحيب داخل التذكرة', `${F.area('tickets.messages.welcome', 'النص', 'المتغيرات: {user} {username} {type} {server}')}`)}
      ${section(
        'إرسال اللوحة',
        `<div class="row"><div style="flex:1;min-width:220px">${F.select('_panelChannel', 'القناة', state.meta.channels.map((c) => ({ id: c.id, name: '# ' + c.name })), '— اختر قناة —')}</div>
          <button class="btn" data-act="sendpanel" type="button">حفظ وإرسال اللوحة</button></div>
         <div class="hint">بيحفظ الإعدادات الحالية أول ثم بيرسل اللوحة. اللوحات القديمة ما بتتغير، احذفها وأرسل جديدة.</div>`,
      )}`;
  },

  async ticketlog() {
    if (state.ticketId) {
      const t = await api(`/api/guilds/${state.gid}/tickets/${state.ticketId}`);
      const msgs = (t.messages || [])
        .map((m) => {
          const av = safeAvatar(m.avatar);
          return `<div class="msg">${av ? `<img class="avatar" src="${esc(av)}" alt="">` : '<div class="avatar"></div>'}
            <div><div class="meta"><b>${esc(m.author)}</b> · ${fmtDate(m.ts)}</div>
            <div class="txt">${esc(m.content)}</div>
            ${(m.attachments || []).map((a) => `<div class="meta">📎 ${esc(a.name)}</div>`).join('')}</div></div>`;
        })
        .join('');
      return `
        <button class="btn ghost" data-act="back" type="button">← رجوع</button>
        <h1 style="margin-top:14px">تذكرة #${String(t.number).padStart(4, '0')}</h1>
        <p class="sub"><span class="tag ${t.status}">${t.status === 'open' ? 'مفتوحة' : 'مغلقة'}</span> ${esc(t.typeLabel || t.type)}</p>
        <div class="grid g4" style="margin-bottom:16px">
          <div class="stat"><b style="font-size:16px">${esc(t.ownerTag)}</b><span>صاحب التذكرة</span></div>
          <div class="stat"><b style="font-size:16px">${esc(t.claimedByTag || '—')}</b><span>استلمها</span></div>
          <div class="stat"><b style="font-size:16px">${fmtDate(t.createdAt)}</b><span>فُتحت</span></div>
          <div class="stat"><b style="font-size:16px">${t.closedAt ? fmtDate(t.closedAt) : '—'}</b><span>أُغلقت</span></div>
        </div>
        ${section(`المحادثة (${t.messageCount || 0})`, msgs ? `<div class="msgs">${msgs}</div>` : '<div class="empty">المحادثة بتنحفظ عند إغلاق التذكرة.</div>')}`;
    }
    const { status, q, page } = state.log;
    const r = await api(`/api/guilds/${state.gid}/tickets?page=${page}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`);
    const rows = r.items
      .map(
        (t) => `<tr class="click" data-num="${t.number}"><td>#${String(t.number).padStart(4, '0')}</td><td>${esc(t.ownerTag)}</td>
        <td>${esc(t.typeLabel || t.type)}</td><td><span class="tag ${t.status}">${t.status === 'open' ? 'مفتوحة' : 'مغلقة'}</span></td>
        <td>${esc(t.claimedByTag || '—')}</td><td>${fmtDate(t.createdAt)}</td></tr>`,
      )
      .join('');
    const pg = Math.max(1, Math.ceil(r.total / r.pageSize));
    return `
      <h1>سجل التذاكر</h1><p class="sub">كل التذاكر مع المحادثات المحفوظة (${r.total}).</p>
      <div class="card"><div class="row">
        <input type="text" id="logq" placeholder="بحث: رقم، اسم، آيدي، نوع" value="${esc(q)}" style="flex:1;min-width:200px">
        <select id="logstatus" style="width:140px"><option value="">الكل</option><option value="open" ${status === 'open' ? 'selected' : ''}>مفتوحة</option><option value="closed" ${status === 'closed' ? 'selected' : ''}>مغلقة</option></select>
        <button class="btn" data-act="logsearch" type="button">بحث</button></div></div>
      <div class="card">${rows ? `<table><thead><tr><th>#</th><th>العضو</th><th>النوع</th><th>الحالة</th><th>استلمها</th><th>التاريخ</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">ما في تذاكر</div>'}
        <div class="pager"><button class="btn ghost" data-act="pg" data-d="-1" ${page <= 1 ? 'disabled' : ''}>السابق</button><span>${page} / ${pg}</span><button class="btn ghost" data-act="pg" data-d="1" ${page >= pg ? 'disabled' : ''}>التالي</button></div></div>`;
  },

  async rules() {
    const items = state.settings.rules.items;
    const list = items
      .map(
        (it, i) => `<details class="rule" ${state.openRules.has(i) ? 'open' : ''}>
          <summary><span class="rgrip">⋮⋮</span><span>قانون</span> <b>${i + 1}</b><span class="rt">${it.title ? ' — ' + esc(it.title) : ''}</span>
            <span class="rbtns"><button class="btn ghost sm" data-act="ruleup" data-i="${i}" type="button" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn ghost sm" data-act="ruledown" data-i="${i}" type="button" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn danger sm" data-act="ruledel" data-i="${i}" type="button">✕</button></span></summary>
          <div class="rbody"><div class="field"><label>عنوان القانون</label><input type="text" data-r="title" maxlength="200" value="${esc(it.title)}"></div>
          <div class="field"><label>نص القانون</label><textarea data-r="text" maxlength="1000">${esc(it.text)}</textarea></div></div></details>`,
      )
      .join('');
    return `
      <h1>القوانين</h1><p class="sub">أنشئ قائمة قوانين السيرفر وانشرها بقناة واحدة. لو نشرتها مرة ثانية بتتحدث نفس الرسالة بدون تكرار.</p>
      ${section(
        'إعدادات القوانين',
        `<div class="grid g2">${F.chan('rules.channelId', 'قناة القوانين')}<div style="padding-top:26px">${F.sw('rules.useEmbed', 'استخدام Embed للقوانين')}</div>
          ${F.text('rules.title', 'العنوان')}${F.color('rules.color', 'لون الإيمبد')}</div>
         <div style="margin-top:14px">${F.area('rules.description', 'الوصف (يظهر فوق القوانين)')}</div>`,
      )}
      ${section(
        'قائمة القوانين',
        `<p class="hint" style="margin:-4px 0 12px">أضف حتى 25 قانون لسيرفرك</p>
         <div id="rulesList">${list || '<div class="empty">ما في قوانين. اضغط إضافة قانون.</div>'}</div>
         <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="ruleadd" type="button" ${items.length >= 25 ? 'disabled' : ''}>+ إضافة قانون</button>
         <button class="btn" data-act="rulespublish" type="button">حفظ ونشر القوانين</button></div>`,
      )}`;
  },

  async welcome() {
    return `
      <h1>الترحيب والرتب</h1><p class="sub">المتغيرات: {user} {username} {server} {memberCount} {id}</p>
      ${section(
        'رسالة الترحيب',
        `<div style="margin-bottom:14px">${F.sw('welcome.enabled', 'تفعيل نظام الترحيب')}</div>
         <div class="grid g2">${F.chan('welcome.channelId', 'قناة الترحيب')}${F.color('welcome.color', 'لون الإيمبد')}</div>
         <div style="margin:14px 0">${F.area('welcome.message', 'نص الترحيب')}</div>
         <div class="grid g2">${F.url('welcome.bannerUrl', 'بانر الترحيب (اختياري)')}<div style="padding-top:24px">${F.sw('welcome.useEmbed', 'إرسالها كإيمبد')}</div></div>`,
      )}
      ${section('رتب تلقائية', `<div class="grid g2">${F.roles('welcome.autoRoleIds', 'رتب الأعضاء الجدد')}${F.roles('welcome.botAutoRoleIds', 'رتب البوتات الجديدة')}</div>
        <div class="hint" style="margin-top:8px">لازم رتبة البوت تكون أعلى من هالرتب.</div>`)}
      ${section('رسالة خاصة (DM)', `${F.sw('welcome.dmEnabled', 'إرسال رسالة خاصة للعضو الجديد')}<div style="margin-top:12px">${F.area('welcome.dmMessage', 'نص الرسالة الخاصة')}</div>`)}
      ${section('رسالة المغادرة', `${F.sw('welcome.leaveEnabled', 'تفعيل رسالة المغادرة')}<div class="grid g2" style="margin-top:12px">${F.chan('welcome.leaveChannelId', 'قناة المغادرة')}${F.text('welcome.leaveMessage', 'النص')}</div>`)}`;
  },

  async logs() {
    const ev = [
      ['messageDelete', 'حذف الرسائل'], ['messageEdit', 'تعديل الرسائل'], ['memberJoin', 'دخول الأعضاء'], ['memberLeave', 'خروج الأعضاء'],
      ['memberUpdate', 'تحديث الأعضاء (رتب، لقب، تايم أوت)'], ['ban', 'الحظر وفك الحظر'], ['channel', 'القنوات'], ['role', 'الرتب'], ['voice', 'الصوت'],
    ];
    return `
      <h1>اللوقات</h1><p class="sub">تسجيل أحداث السيرفر بقناة واحدة.</p>
      ${section('عام', `<div class="grid g2">${F.sw('logs.enabled', 'تفعيل اللوقات')}<span></span>${F.chan('logs.channelId', 'قناة اللوق')}</div>`)}
      ${section('الأحداث', `<div class="grid g2">${ev.map(([k, n]) => F.sw(`logs.events.${k}`, n)).join('')}</div>`)}`;
  },

  async protection() {
    return `
      <h1>الحماية</h1><p class="sub">حماية تلقائية للسيرفر. الأدمن ومن عنده Manage Server مستثنين دائماً.</p>
      ${section('عام', `${F.sw('protection.enabled', 'تفعيل نظام الحماية')}
        <div class="grid g2" style="margin-top:14px">${F.chan('protection.logChannelId', 'قناة لوق الحماية', '')}<span class="hint" style="padding-top:26px">إذا تركتها فاضية بيستخدم قناة اللوقات العامة.</span></div>
        <div class="grid g2" style="margin-top:14px">${F.roles('protection.whitelistRoleIds', 'رتب مستثناة')}${F.channels('protection.whitelistChannelIds', 'قنوات مستثناة')}</div>`)}
      ${section('منع السبام', `${F.sw('protection.antiSpam.enabled', 'تفعيل')}<div class="grid g3" style="margin-top:12px">
        ${F.num('protection.antiSpam.maxMessages', 'عدد الرسائل', 2, 30)}${F.num('protection.antiSpam.perSeconds', 'خلال (ثواني)', 1, 60)}${F.num('protection.antiSpam.timeoutMinutes', 'مدة التايم أوت (دقائق)', 1, 40320)}</div>`)}
      ${section('منع الروابط', `${F.sw('protection.antiLinks.enabled', 'تفعيل')}<div style="margin-top:12px">${F.lines('protection.antiLinks.allowedDomains', 'دومينات مسموحة', 'دومين بكل سطر، مثل: youtube.com')}</div>`)}
      ${section('منع روابط الدعوات', F.sw('protection.antiInvites.enabled', 'حذف روابط دعوات سيرفرات ديسكورد'))}
      ${section('منع المنشن الجماعي', `${F.sw('protection.antiMassMention.enabled', 'تفعيل')}<div class="grid g2" style="margin-top:12px">${F.num('protection.antiMassMention.max', 'أقصى عدد منشن بالرسالة', 2, 50)}${F.num('protection.antiMassMention.timeoutMinutes', 'مدة التايم أوت (دقائق)', 1, 40320)}</div>`)}
      ${section('حماية الدخول (Anti-Raid)', `${F.sw('protection.antiRaid.enabled', 'تفعيل')}<div class="grid g2" style="margin-top:12px">
        ${F.num('protection.antiRaid.maxJoins', 'عدد الداخلين المشبوه', 2, 100)}${F.num('protection.antiRaid.perSeconds', 'خلال (ثواني)', 2, 300)}
        ${F.num('protection.antiRaid.minAccountAgeDays', 'أقل عمر حساب بالأيام (0 = معطل)', 0, 365)}${F.fixed('protection.antiRaid.action', 'الإجراء', [['kick', 'طرد'], ['ban', 'حظر']])}</div>`)}`;
  },

  async moderation() {
    const { type, page } = state.cases;
    const r = await api(`/api/guilds/${state.gid}/cases?page=${page}&type=${encodeURIComponent(type)}`);
    const names = { ban: 'حظر', unban: 'فك حظر', kick: 'طرد', timeout: 'تايم أوت', untimeout: 'فك تايم أوت', warn: 'تحذير' };
    const rows = r.items
      .map(
        (c) => `<tr><td>#${c.number}</td><td><span class="tag ${esc(c.type)}">${names[c.type] || esc(c.type)}</span></td><td>${esc(c.userTag)}</td>
        <td>${esc(c.modTag)}</td><td>${esc(c.reason || '—')}${c.cleared ? ' <span class="tag">مصفّر</span>' : ''}</td><td>${fmtDate(c.createdAt)}</td></tr>`,
      )
      .join('');
    const pg = Math.max(1, Math.ceil(r.total / r.pageSize));
    return `
      <h1>المودريشن</h1><p class="sub">الأوامر: /ban /unban /kick /timeout /untimeout /warn /warnings /clearwarns /purge</p>
      ${section('الإعدادات', `<div class="grid g2">${F.chan('moderation.logChannelId', 'قناة لوق المودريشن')}<div style="padding-top:26px">${F.sw('moderation.dmOnAction', 'إرسال رسالة خاصة للعضو عند العقوبة')}</div>
        ${F.num('moderation.warnsBeforeTimeout', 'عدد التحذيرات قبل التايم أوت التلقائي (0 = معطل)', 0, 20)}${F.num('moderation.autoTimeoutMinutes', 'مدة التايم أوت التلقائي (دقائق)', 1, 40320)}</div>`)}
      ${section(
        `سجل العقوبات (${r.total})`,
        `<div class="row" style="margin-bottom:12px"><select id="casetype" style="width:180px"><option value="">كل الأنواع</option>${Object.entries(names).map(([k, n]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
         ${rows ? `<table><thead><tr><th>#</th><th>النوع</th><th>العضو</th><th>المشرف</th><th>السبب</th><th>التاريخ</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">ما في عقوبات</div>'}
         <div class="pager"><button class="btn ghost" data-act="cpg" data-d="-1" ${page <= 1 ? 'disabled' : ''}>السابق</button><span>${page} / ${pg}</span><button class="btn ghost" data-act="cpg" data-d="1" ${page >= pg ? 'disabled' : ''}>التالي</button></div>`,
      )}`;
  },

  async staff() {
    const members = state.settings.staff.members;
    const cards = members
      .map((m) => {
        const av = safeAvatar(m.avatar);
        return `<div class="smember" data-id="${esc(m.id)}">
          <div class="shead">${av ? `<img class="avatar" src="${esc(av)}" alt="">` : '<div class="avatar"></div>'}
            <div style="flex:1"><b>${esc(m.tag || m.id)}</b><div class="hint" dir="ltr">${esc(m.id)}</div></div>
            <button class="btn danger sm" data-act="staffdel" data-id="${esc(m.id)}" type="button">✕</button></div>
          <div class="perms">${PERM_LABELS.map(([k, n]) => `<label class="switch sm"><input type="checkbox" data-sperm="${k}" ${m.perms.includes(k) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>`;
      })
      .join('');
    return `
      <h1>الإدارة</h1>
      <p class="sub">أضف الناس اللي بتوظفهم معك. كل واحد بيدخل على لوحة التحكم بحساب ديسكورد تبعه ويشوف بس الصفحات اللي بتعطيه صلاحية عليها.</p>
      ${notice('ℹ️ هالقائمة لصلاحيات لوحة التحكم. أما مين بيشوف التذاكر داخل ديسكورد فبتحدده من صفحة التذاكر (رتب الإدارة).')}
      ${section(
        'إضافة عضو إدارة',
        `<div class="row"><input type="text" id="staffId" dir="ltr" placeholder="آيدي حساب ديسكورد (مثال: 123456789012345678)" style="flex:1;min-width:240px">
          <button class="btn" data-act="staffadd" type="button">+ إضافة</button></div>
         <div class="hint" style="margin-top:8px">لنسخ الآيدي: فعّل Developer Mode من إعدادات ديسكورد ثم كليك يمين على المستخدم ← Copy User ID. بعد الإضافة اضغط "حفظ التغييرات".</div>`,
      )}
      ${section(`فريق الإدارة (${members.length})`, `<div id="staffList">${cards || '<div class="empty">ما في أعضاء إدارة بعد.</div>'}</div>`)}`;
  },
};

/* ============================== العرض ============================== */
const initials = (name) =>
  String(name || '?').split(/\s+/).filter(Boolean).map((w) => Array.from(w)[0]).join('').slice(0, 2).toUpperCase();

function topbar() {
  const u = state.user;
  const av = u && safeAvatar(u.avatar);
  return `<header class="topbar">
    <button class="btn ghost" data-act="lite" title="تخفيف المؤثرات" type="button">⚡</button> <button class="btn ghost" data-act="uilang" type="button">🌐 ${uiLang === 'en' ? 'عربي' : 'English'}</button>
    <div class="tbrand"><img src="/logo.png" alt=""> NeoBot</div>
    <div class="tuser">${u && u.botRole ? `<button class="btn ghost" data-act="${state.view === 'owner' ? 'ownerclose' : 'owneropen'}" type="button">${state.view === 'owner' ? '← السيرفرات' : '👑 لوحة المالك'}</button>` : ''}${u ? `${av ? `<img class="avatar" src="${esc(av)}" alt="">` : '<div class="avatar"></div>'}<span>${esc(u.username)}</span>
      <button class="btn ghost" data-act="logout" title="تسجيل الخروج" type="button">⎋</button>` : ''}</div></header>`;
}

async function render() {
  applyDir();
  const app = $('#app');

  if (!state.user) {
    try {
      state.user = await api('/api/me');
    } catch {
      setHTML(app, `${topbar()}<div class="center" style="min-height:calc(100vh - 80px)"><div class="login"><img class="hero" data-tilt src="/logo.png" alt="NeoBot"><h1>NeoBot</h1>
        <p class="sub">لوحة تحكم البوت. سجّل دخولك بحساب ديسكورد لإدارة سيرفراتك.</p>
        <a class="btn big" href="/auth/login" style="display:inline-block;text-decoration:none">تسجيل الدخول بديسكورد</a></div></div>`);
      return;
    }
  }

  // ---------- لوحة صاحب البوت ----------
  if (state.view === 'owner' && state.user.botRole) {
    try {
      state.owner = await api('/api/owner/overview');
    } catch (e) {
      toast(e.message, 'err');
      state.view = '';
      return render();
    }
    const o = state.owner;
    const isOwner = o.role === 'owner';
    const gRows = o.guilds
      .map((g) => `<tr><td>${safeCdn(g.icon) ? `<img class="avatar" src="${esc(safeCdn(g.icon))}" alt="">` : ''}</td><td><b>${esc(g.name)}</b><div class="hint" dir="ltr">${esc(g.id)}</div></td>
        <td>${g.members}</td><td>${g.tickets}</td><td>${g.language === 'en' ? 'English' : 'العربية'}</td>
        <td>${isOwner ? `<button class="btn danger sm" data-act="ownerleave" data-id="${esc(g.id)}" data-name="${esc(g.name)}" type="button">خروج البوت</button>` : ''}</td></tr>`)
      .join('');
    const aRows = o.admins
      .map((a) => `<div class="smember"><div class="shead">${safeAvatar(a.avatar) ? `<img class="avatar" src="${esc(safeAvatar(a.avatar))}" alt="">` : '<div class="avatar"></div>'}
        <div style="flex:1"><b>${esc(a.tag || a.id)}</b><div class="hint" dir="ltr">${esc(a.id)}</div></div>
        ${isOwner ? `<button class="btn danger sm" data-act="ownerdeladmin" data-id="${esc(a.id)}" type="button">✕</button>` : ''}</div></div>`)
      .join('');
    setHTML(app, `${topbar()}<main class="picker" style="text-align:start">
      <h1>👑 لوحة المالك</h1><p class="sub">هالصفحة بس لصاحب البوت وإدارة البوت. الأعضاء العاديين ما بيشوفوها.</p>
      <div class="card"><h3>السيرفرات اللي فيها البوت (${o.guilds.length})</h3>
        ${gRows ? `<table><thead><tr><th></th><th>السيرفر</th><th>الأعضاء</th><th>التذاكر</th><th>اللغة</th><th></th></tr></thead><tbody>${gRows}</tbody></table>` : '<div class="empty">لا يوجد بيانات</div>'}</div>
      <div class="card"><h3>إدارة البوت (${o.admins.length})</h3>
        ${isOwner ? `<div class="row" style="margin-bottom:12px"><input type="text" id="botAdminId" dir="ltr" placeholder="آيدي حساب ديسكورد" style="flex:1;min-width:240px"><button class="btn" data-act="owneradd" type="button">+ إضافة</button></div>` : ''}
        ${aRows || '<div class="empty">ما في أعضاء إدارة بعد.</div>'}</div></main>`);
    return;
  }

  // ---------- اختيار السيرفر (كروت) ----------
  if (!state.gid) {
    if (!state.guilds.length) {
      try {
        const r = await api('/api/guilds');
        state.guilds = r.guilds;
        state.invite = r.invite;
      } catch (e) {
        toast(e.message, 'err');
      }
    }
    const cards = state.guilds
      .map((g) => {
        const banner = safeCdn(g.banner);
        const icon = safeCdn(g.icon);
        const botLogo = safeCdn(g.botLogo);
        return `<div class="gcard" data-tilt data-gid="${esc(g.id)}">
          <div class="gbanner" ${banner ? `style="background-image:url('${esc(banner)}')"` : ''}></div>
          ${g.owner ? '<span class="gbadge">Owner</span>' : ''}
          <div class="gicon">${icon ? `<img src="${esc(icon)}" alt="">` : `<span>${esc(initials(g.name))}</span>`}</div>
          <div class="gname">${esc(g.name)}</div>
          <div class="gbot">${botLogo ? `<img src="${esc(botLogo)}" alt="">` : ''}<span>${esc(g.botName || 'NeoBot')}</span> · ${g.members} <span>عضو</span></div>
          <button class="btn gmanage" type="button">إدارة</button></div>`;
      })
      .join('');
    setHTML(app, `${topbar()}<main class="picker">
      <h1>اختر السيرفر</h1>
      <p class="sub">${state.guilds.length ? 'السيرفرات اللي عندك فيها صلاحية على البوت.' : 'ما لقيت سيرفر تديره والبوت موجود فيه. لازم يكون عندك صلاحية Manage Server، أو يكون صاحب السيرفر ضايفك بقسم الإدارة.'}</p>
      <div class="gcards">${cards}
        <a class="gcard gadd" data-tilt href="${esc(state.invite)}" target="_blank" rel="noopener"><div class="gplus">+</div><div class="gname">إضافة البوت لسيرفر</div></a></div>
      <div class="row" style="justify-content:center;margin-top:22px"><button class="btn ghost" data-act="reload" type="button">تحديث</button></div></main>`);
    return;
  }

  // ---------- لوحة السيرفر ----------
  if (!state.meta) {
    try {
      [state.meta, state.settings] = await Promise.all([
        api(`/api/guilds/${state.gid}/meta`),
        api(`/api/guilds/${state.gid}/settings`),
      ]);
    } catch (e) {
      toast(e.message, 'err');
      state.gid = null;
      return render();
    }
  }
  const vis = visiblePages();
  if (!vis.some((p) => p[0] === state.page)) state.page = vis.length ? vis[0][0] : 'stats';

  const u = state.user;
  setHTML(app, `<div class="layout">
    <aside class="side">
      <div class="brand"><img src="/logo.png" alt=""> NeoBot</div>
      <div class="guildbox" data-act="switch">${state.meta.icon ? `<img src="${esc(state.meta.icon)}" alt="">` : '<img alt="">'}
        <div><b>${esc(state.meta.name)}</b><small>تغيير السيرفر</small></div></div>
      <nav class="nav">${vis.map(([k, ic, n]) => `<button data-page="${k}" class="${state.page === k ? 'active' : ''}">${ic} ${n}</button>`).join('')}</nav>
      <div class="userbar">${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : '<div class="avatar"></div>'}
        <div class="name">${esc(u.username)}</div>
        <button class="btn ghost" data-act="lite" title="تخفيف المؤثرات" type="button">⚡</button>
        <button class="btn ghost" data-act="uilang" title="اللغة" type="button">🌐</button>
        <button class="btn ghost" data-act="logout" title="خروج" type="button">⎋</button></div>
    </aside>
    <main class="main"><div id="content"></div></main>
    ${SAVE_PAGES.has(state.page) ? `<div class="savebar"><span class="hint" id="dirtyHint"></span><button class="btn" id="saveBtn">حفظ التغييرات</button></div>` : ''}
  </div>`);
  await renderPage();
}

async function renderPage() {
  const c = $('#content');
  if (!c) return;
  setHTML(c, '<div class="empty">جاري التحميل...</div>');
  try {
    setHTML(c, await pages[state.page]());
  } catch (e) {
    setHTML(c, `<div class="empty">${esc(TT(e.message))}</div>`);
  }
  const h = $('#dirtyHint');
  if (h) h.textContent = state.dirty ? TT('عندك تغييرات غير محفوظة') : '';
}

function markDirty() {
  state.dirty = true;
  const h = $('#dirtyHint');
  if (h) h.textContent = TT('عندك تغييرات غير محفوظة');
}

const readFile = (f) =>
  new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(new Error('ما قدرت أقرأ الملف'));
    r.readAsDataURL(f);
  });

/* ============================== الأحداث ============================== */
document.addEventListener('click', async (e) => {
  const t = e.target;

  const chip = t.closest('.chip');
  if (chip) {
    chip.classList.toggle('on');
    return markDirty();
  }

  const nav = t.closest('[data-page]');
  if (nav) {
    collect();
    state.page = nav.dataset.page;
    state.ticketId = null;
    return render();
  }

  const gc = t.closest('.gcard[data-gid]');
  if (gc) {
    state.gid = gc.dataset.gid;
    state.meta = null;
    state.page = 'stats';
    state.dirty = false;
    return render();
  }

  const row = t.closest('tr[data-num]');
  if (row) {
    state.ticketId = row.dataset.num;
    return renderPage();
  }

  if (t.id === 'saveBtn') return save();

  const el = t.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const d = Number(el.dataset.d || 0);
  const idx = Number(el.dataset.i);

  switch (act) {
    case 'uilang':
      collect();
      uiLang = uiLang === 'en' ? 'ar' : 'en';
      try {
        localStorage.setItem('neobot.ui', uiLang);
      } catch {
        /* ignore */
      }
      return render();
    case 'lite':
      try {
        localStorage.setItem('neobot.lite', document.documentElement.classList.contains('lite') ? '0' : '1');
      } catch {
        /* ignore */
      }
      return location.reload();
    case 'logout':
      await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
      Object.assign(state, { view: '', user: null, guilds: [], gid: null, meta: null, settings: null, dirty: false });
      return render();
    case 'owneropen':
      state.view = 'owner';
      return render();
    case 'ownerclose':
      state.view = '';
      return render();
    case 'owneradd': {
      const id = $('#botAdminId').value.trim();
      if (!/^\d{15,25}$/.test(id)) return toast('الآيدي غير صالح', 'err');
      try {
        await api('/api/owner/admins', { method: 'POST', body: { id } });
        return render();
      } catch (err) {
        return toast(err.message, 'err');
      }
    }
    case 'ownerdeladmin':
      await api(`/api/owner/admins/${el.dataset.id}`, { method: 'DELETE' }).catch((err) => toast(err.message, 'err'));
      return render();
    case 'ownerleave':
      if (!confirm(TT('تطلّع البوت من هالسيرفر؟') + ' ' + el.dataset.name)) return;
      await api(`/api/owner/guilds/${el.dataset.id}/leave`, { method: 'POST', body: {} }).catch((err) => toast(err.message, 'err'));
      return render();
    case 'reload':
      state.guilds = [];
      return render();
    case 'switch':
      if (state.dirty && !confirm(TT('عندك تغييرات غير محفوظة. تتجاهلها؟'))) return;
      Object.assign(state, { gid: null, meta: null, settings: null, dirty: false, guilds: [] });
      return render();

    /* ----- التذاكر ----- */
    case 'addtype': {
      collect();
      if (state.settings.tickets.types.length >= 25) return toast('الحد الأقصى 25 نوع', 'err');
      state.settings.tickets.types.push({ value: '', label: '', description: '', emoji: '', roleIds: [] });
      markDirty();
      return renderPage();
    }
    case 'deltype': {
      collect();
      state.settings.tickets.types.splice($$('.tcard').indexOf(el.closest('.tcard')), 1);
      markDirty();
      return renderPage();
    }
    case 'sendpanel': {
      const ch = $('[data-path="_panelChannel"]').value;
      if (!ch) return toast('اختر قناة أول', 'err');
      collect();
      try {
        const copy = { ...state.settings };
        delete copy._panelChannel;
        state.settings = await api(`/api/guilds/${state.gid}/settings`, { method: 'PUT', body: copy });
        state.dirty = false;
        await api(`/api/guilds/${state.gid}/panel`, { method: 'POST', body: { channelId: ch } });
        toast('تم إرسال اللوحة ✅');
      } catch (err) {
        toast(err.message, 'err');
      }
      return;
    }

    /* ----- القوانين ----- */
    case 'ruleadd': {
      collect();
      const items = state.settings.rules.items;
      if (items.length >= 25) return toast('الحد الأقصى 25 قانون', 'err');
      items.push({ title: '', text: '' });
      state.openRules.add(items.length - 1);
      markDirty();
      return renderPage();
    }
    case 'ruledel': {
      collect();
      state.settings.rules.items.splice(idx, 1);
      state.openRules = new Set();
      markDirty();
      return renderPage();
    }
    case 'ruleup':
    case 'ruledown': {
      e.preventDefault();
      collect();
      const items = state.settings.rules.items;
      const j = act === 'ruleup' ? idx - 1 : idx + 1;
      if (j < 0 || j >= items.length) return;
      [items[idx], items[j]] = [items[j], items[idx]];
      state.openRules = new Set([j]);
      markDirty();
      return renderPage();
    }
    case 'rulespublish': {
      collect();
      if (!state.settings.rules.channelId) return toast('اختر قناة القوانين أول.', 'err');
      try {
        state.settings = await api(`/api/guilds/${state.gid}/settings`, { method: 'PUT', body: state.settings });
        state.dirty = false;
        await api(`/api/guilds/${state.gid}/rules/publish`, { method: 'POST', body: {} });
        state.settings = await api(`/api/guilds/${state.gid}/settings`);
        toast('تم نشر القوانين ✅');
        renderPage();
      } catch (err) {
        toast(err.message, 'err');
      }
      return;
    }

    /* ----- الإدارة ----- */
    case 'staffadd': {
      const id = $('#staffId').value.trim();
      if (!/^\d{15,25}$/.test(id)) return toast('الآيدي غير صالح', 'err');
      collect();
      if (state.settings.staff.members.some((m) => m.id === id)) return toast('هالشخص مضاف أصلاً', 'err');
      if (state.settings.staff.members.length >= 50) return toast('الحد الأقصى 50 عضو', 'err');
      try {
        const u = await api(`/api/guilds/${state.gid}/staff/lookup`, { method: 'POST', body: { id } });
        state.settings.staff.members.push({ id: u.id, tag: u.tag, avatar: u.avatar, perms: ['stats'] });
        markDirty();
        renderPage();
      } catch (err) {
        toast(err.message, 'err');
      }
      return;
    }
    case 'staffdel': {
      collect();
      state.settings.staff.members = state.settings.staff.members.filter((m) => m.id !== el.dataset.id);
      markDirty();
      return renderPage();
    }

    /* ----- الهوية واللغة ----- */
    case 'brandapply':
    case 'brandreset': {
      const body = {};
      if (act === 'brandreset') {
        if (!confirm(TT('ترجع اسم وصورة البوت الأصلية بهالسيرفر؟'))) return;
        body.reset = true;
      } else {
        body.name = $('#brandName').value;
        const f = $('#brandFile').files[0];
        if (f) {
          if (f.size > 8 * 1024 * 1024) return toast('الصورة أكبر من 8MB', 'err');
          body.logo = await readFile(f).catch(() => null);
          if (!body.logo) return toast('ما قدرت أقرأ الملف', 'err');
        }
      }
      const btns = $$('[data-act^=brand]');
      btns.forEach((x) => (x.disabled = true));
      try {
        await api(`/api/guilds/${state.gid}/branding`, { method: 'POST', body });
        state.meta = await api(`/api/guilds/${state.gid}/meta`);
        toast('تم تحديث الهوية ✅');
        return render();
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        btns.forEach((x) => (x.disabled = false));
      }
      return;
    }
    case 'langapply': {
      try {
        state.settings = await api(`/api/guilds/${state.gid}/language`, {
          method: 'POST',
          body: { language: $('#botLang').value, applyTexts: $('#botLangTexts').checked },
        });
        toast('تم تغيير لغة البوت ✅');
        renderPage();
      } catch (err) {
        toast(err.message, 'err');
      }
      return;
    }

    case 'back':
      state.ticketId = null;
      return renderPage();
    case 'logsearch':
      state.log = { status: $('#logstatus').value, q: $('#logq').value.trim(), page: 1 };
      return renderPage();
    case 'pg':
      state.log.page = Math.max(1, state.log.page + d);
      return renderPage();
    case 'cpg':
      state.cases.page = Math.max(1, state.cases.page + d);
      return renderPage();
    default:
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'brandFile' && e.target.files[0]) {
    readFile(e.target.files[0]).then((u) => ($('#brandImg').src = u)).catch(() => {});
  }
  if (e.target.id === 'casetype') {
    state.cases = { type: e.target.value, page: 1 };
    renderPage();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'logq') $('[data-act=logsearch]').click();
  if (e.key === 'Enter' && e.target.id === 'staffId') $('[data-act=staffadd]').click();
});

document.addEventListener('input', (e) => {
  if (!e.target.closest('#content')) return;
  const id = e.target.id;
  if (e.target.dataset.path === '_panelChannel' || ['logq', 'brandName', 'brandFile', 'staffId', 'casetype', 'logstatus', 'botLang', 'botLangTexts'].includes(id)) return;
  markDirty();
  // معاينة اللوحة
  const p = e.target.dataset.path;
  if (p === 'tickets.panel.title') $('#pvTitle').textContent = e.target.value;
  if (p === 'tickets.panel.footer') $('#pvFoot').textContent = e.target.value;
  if (p === 'tickets.panel.color') $('#preview').style.borderInlineStartColor = e.target.value;
  if (p === 'tickets.panel.bannerUrl') {
    const box = $('#pvImg');
    box.textContent = '';
    if (/^https?:\/\/\S+$/i.test(e.target.value)) {
      const img = document.createElement('img');
      img.src = e.target.value;
      img.style.cssText = 'width:100%;border-radius:6px';
      img.alt = '';
      box.appendChild(img);
    }
  }
});

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ============================== مؤثرات 3D ============================== */
let lite = false;
try { lite = localStorage.getItem('neobot.lite') === '1'; } catch { /* ignore */ }
document.documentElement.classList.toggle('lite', lite);
const reduceMotion = lite || window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ميلان ثلاثي الأبعاد للعناصر اللي عليها data-tilt حسب مكان الماوس
let tiltEl = null;
function tiltReset(el) {
  if (el) el.style.transform = '';
}
document.addEventListener('pointermove', (e) => {
  if (reduceMotion || e.pointerType === 'touch') return;
  const el = e.target.closest && e.target.closest('[data-tilt]');
  if (el !== tiltEl) {
    tiltReset(tiltEl);
    tiltEl = el;
  }
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  const max = el.classList.contains('stat') ? 7 : 11;
  el.style.transform = `perspective(700px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(10px)`;
});
document.addEventListener('pointerleave', () => {
  tiltReset(tiltEl);
  tiltEl = null;
});

// مكعبات عائمة بالخلفية
(function buildScene() {
  const scene = $('#scene');
  if (!scene || reduceMotion) return;
  const spots = [[8, 18, 54], [86, 12, 40], [74, 58, 56]];
  spots.forEach(([x, y, size], i) => {
    const w = document.createElement('div');
    w.className = 'cubewrap';
    w.style.cssText = `left:${x}%;top:${y}%;--s:${size}px;animation-delay:${-i * 1.7}s`;
    const c = document.createElement('div');
    c.className = 'cube';
    c.style.animationDuration = `${16 + i * 3}s`;
    for (let k = 0; k < 6; k++) c.appendChild(document.createElement('i'));
    w.appendChild(c);
    scene.appendChild(w);
  });
})();

render();
