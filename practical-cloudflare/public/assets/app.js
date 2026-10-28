// Practical Register: the page logic. Data comes from api.php; the practical lists come from syllabus.js.
(() => {
'use strict';

const ITEMS = new Map();
for (const cls of Object.keys(SYL)) for (const subj of Object.keys(SYL[cls])) for (const g of SYL[cls][subj].groups)
  g.items.forEach((title, i) => ITEMS.set(`${cls}.${subj}.${g.k}.${i + 1}`, { cls, subj, group:g, n:i + 1, title }));
const pidOf = (cls, subj, g, n) => `${cls}.${subj}.${g.k}.${n}`;
const groupNeed = g => g.need || g.items.length;
const RN = { '6':'VI', '7':'VII', '8':'VIII', '9':'IX', '10':'X', '11':'XI', '12':'XII' };
// The only two server addresses the page uses. A port to another backend changes just these.
const API_URL = '/api', PHOTO_URL = '/photo';

const state = {
  status:'loading',                      // loading | ready | error
  user:null, csrf:'', role:'loading',    // loading | anon | pw | admin | teacher
  sessions:[], settings:{ sections:{}, teachers:[] },
  syl:{ cls:'12', subj:'physics' }, sylSet:false,
  filt:{ board:'', cls:'', subj:'', teacher:'' }, ovBoard:'',
  confirmDel:null, confirmPw:null, sectionsDirty:false, tdraft:{}, tdirty:{}, teachSig:'',
  saving:false, totalAuto:false, editing:null, pending:[], tab:'overview', timer:null
};

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const str = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const normSec = v => str(String(v == null ? '' : v), 12).toUpperCase();
const numOrNull = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = s => toDate(s).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
const fmtShort = s => toDate(s).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
const daysAgo = s => Math.round((toDate(todayStr()) - toDate(s)) / 86400000);
const agoText = s => { const d = daysAgo(s); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '—';
const subjTag = k => `<span class="subj"><i style="background:${SUBJ[k].color}"></i>${SUBJ[k].name}</span>`;
const classSubjects = cls => Object.keys(SYL[cls]);
const photoBtn = (cls, id, s, extra) => `<button class="${cls}" type="button" data-photo="${esc(id)}" data-sid="${esc(s.key)}" aria-label="Open photo, ${ROMAN[s.cls]}-${esc(s.sec)} ${SUBJ[s.subj].name}, ${fmtShort(s.date)}"><img src="${PHOTO_URL}?id=${esc(id)}" alt="" loading="lazy">${extra || ''}</button>`;
const CHECK = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.6l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
// "2026-10-08T10:42:07" (wall-clock time) -> "8 Oct 2026, 10:42 am"
const fmtStamp = t => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t); if (!m) return ''; const h = Number(m[4]); return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${h % 12 || 12}:${m[5]} ${h < 12 ? 'am' : 'pm'}`; };
const fmtCoord = (lat, lng) => `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`;
const geoLine = m => m && m.lat != null ? `<span class="geo">${CHECK}Location tagged</span>` : '';
function formMsg(id, text, bad) { const el = $(id); if (!el) return; el.textContent = text; el.classList.toggle('bad', !!bad); }
let toastTimer = null;
function toast(text) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

/* ---------- server ---------- */
async function api(action, body, form) {
  const opt = { credentials:'same-origin', cache:'no-store' };
  if (form) { opt.method = 'POST'; opt.headers = { 'X-CSRF':state.csrf }; opt.body = form; }
  else if (body !== undefined) { opt.method = 'POST'; opt.headers = { 'Content-Type':'application/json', 'X-CSRF':state.csrf }; opt.body = JSON.stringify(body); }
  let r, j = null;
  try { r = await fetch(API_URL + '?a=' + encodeURIComponent(action), opt); } catch (_) { throw { code:'network', message:'The server could not be reached. Check your connection and try again.' }; }
  try { j = await r.json(); } catch (_) {}
  if (!r.ok || !j || j.ok !== true) throw { code:(j && j.code) || 'server', message:(j && j.message) || 'The server had a problem. Try again in a minute.' };
  return j;
}
// A failed call: an expired sign-in goes back to the sign-in screen, anything else shows the server's message.
function failed(e, msgId) {
  if (e && (e.code === 'auth' || e.code === 'must_change')) { session(); return; }
  formMsg(msgId, (e && e.message) || 'Something went wrong. Try again.', true);
}

function cleanSession(d) {
  if (!d || typeof d !== 'object' || !own(SYL, d.cls) || !own(SYL[d.cls], d.subj)) return null;
  if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;
  const sec = normSec(d.sec);
  if (!sec) return null;
  const it = typeof d.pid === 'string' ? ITEMS.get(d.pid) : null;
  const listed = it && it.cls === d.cls && it.subj === d.subj;
  const photos = [], pmeta = {};
  for (const p of Array.isArray(d.photos) ? d.photos : []) {
    if (!p || typeof p.id !== 'string' || !/^[0-9a-f]{32}$/.test(p.id)) continue;
    const geo = typeof p.lat === 'number' && typeof p.lng === 'number';
    photos.push(p.id);
    pmeta[p.id] = { lat:geo ? p.lat : null, lng:geo ? p.lng : null, t:typeof p.t === 'string' ? p.t : null, src:p.src === 'device' ? 'device' : (geo ? 'photo' : '') };
  }
  return {
    id:d.id, key:String(d.id), uid:d.uid, cls:d.cls, subj:d.subj, sec, date:d.date,
    pid: listed ? d.pid : 'other',
    title: listed ? it.title : (str(d.title, 160) || 'Other practical work'),
    group: listed ? it.group.name : 'Outside the board list',
    teacher: str(d.teacher, 60) || 'Name not given',
    present:numOrNull(d.present), total:numOrNull(d.total), files:numOrNull(d.files),
    note:str(d.note, 300), at: typeof d.at === 'string' ? d.at : '', photos, pmeta
  };
}
function cleanSections(d) {
  const out = {};
  for (const cls of Object.keys(SYL)) out[cls] = [...new Set((d && Array.isArray(d[cls]) ? d[cls] : []).map(normSec).filter(Boolean))].slice(0, 20);
  return out;
}
function cleanTeachers(arr) {
  const out = [];
  for (const t of Array.isArray(arr) ? arr : []) {
    if (!t || typeof t.id !== 'number') continue;
    const assign = (Array.isArray(t.assign) ? t.assign : []).filter(a => a && own(SYL, a.cls) && own(SYL[a.cls], a.subj)).map(a => ({ cls:a.cls, subj:a.subj, secs:(Array.isArray(a.secs) ? a.secs : []).map(normSec).filter(Boolean) }));
    out.push({ id:t.id, name:str(t.name, 60), username:str(t.username, 40), active:t.active !== false, mustChange:!!t.mustChange, assign });
  }
  return out;
}

/* ---------- who is looking ---------- */
const teacherById = id => state.settings.teachers.find(t => t.id === id) || null;
// The teacher's current name if the ID still exists, else the name saved with the entry.
const tname = s => { const p = teacherById(s.uid); return p ? p.name : (state.user && state.user.id === s.uid ? state.user.name : s.teacher); };
const canModify = s => state.role === 'admin' || (state.role === 'teacher' && s.uid === state.user.id);
// A teacher with classes assigned works only inside them; null means no restriction.
const myCombos = () => (state.role === 'teacher' && state.user && state.user.assign.length) ? state.user.assign : null;
const comboOK = (cls, subj) => { const a = myCombos(); return !a || a.some(x => x.cls === cls && x.subj === subj); };
function sectionsFor(cls, subj) {
  const a = myCombos(), set = new Set();
  const school = () => (state.settings.sections[cls] || []).forEach(s => set.add(s));
  if (a) {
    for (const x of a) if (x.cls === cls && x.subj === subj) { if (x.secs.length) x.secs.forEach(s => set.add(s)); else school(); }
  } else {
    school();
    for (const t of state.settings.teachers) for (const x of t.assign) if (x.cls === cls && (!subj || x.subj === subj)) x.secs.forEach(s => set.add(s));
  }
  for (const s of state.sessions) if (s.cls === cls && (!a || !subj || s.subj === subj)) set.add(s.sec);
  return [...set].sort((x, y) => x.localeCompare(y, 'en', { numeric:true }));
}
function buildIndex() {
  const idx = new Map();
  for (const s of state.sessions) {
    if (s.pid === 'other') continue;
    const k = `${s.cls}|${s.subj}|${s.sec}`;
    let m = idx.get(k); if (!m) { m = new Map(); idx.set(k, m); }
    let a = m.get(s.pid); if (!a) { a = []; m.set(s.pid, a); }
    a.push(s);
  }
  return idx;
}
function coverage(idx, cls, subj, sec) {
  const m = idx.get(`${cls}|${subj}|${sec}`);
  let covered = 0, need = 0;
  for (const g of SYL[cls][subj].groups) {
    const n = groupNeed(g);
    let d = 0;
    if (m) g.items.forEach((_, i) => { if (m.has(pidOf(cls, subj, g, i + 1))) d++; });
    covered += Math.min(d, n); need += n;
  }
  return { covered, need };
}
function nextFor(idx, cls, subj, sec) {
  const m = idx.get(`${cls}|${subj}|${sec}`);
  for (const g of SYL[cls][subj].groups) {
    let d = 0, first = null;
    g.items.forEach((t, i) => { if (m && m.has(pidOf(cls, subj, g, i + 1))) d++; else if (first == null) first = `${numOf(g, i)}. ${t}`; });
    if (d < groupNeed(g) && first != null) return { group:g.name, title:first };
  }
  return null;
}
function tally(list) {
  let p = 0, pt = 0, f = 0, ft = 0;
  for (const s of list) {
    if (s.total > 0 && s.present != null) { p += Math.min(s.present, s.total); pt += s.total; }
    if (s.total > 0 && s.files != null) { f += Math.min(s.files, s.total); ft += s.total; }
  }
  return { p, pt, f, ft };
}
const sorted = list => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
const meter = (a, b) => b > 0
  ? `<div class="meter-cell"><div class="meter" role="img" aria-label="${a} of ${b} covered"><span style="width:${Math.round(a / b * 100)}%"></span></div><span class="meter-val">${Math.round(a / b * 100)}%</span></div>`
  : `<span class="dim">—</span>`;

/* ---------- overview ---------- */
function renderOverview() {
  const ob = state.ovBoard, teacher = state.role === 'teacher';
  const KEYS = Object.keys(SYL).filter(k => (!ob || boardOf(k) === ob) && classSubjects(k).some(sj => comboOK(k, sj)));
  const all = state.sessions.filter(s => !ob || boardOf(s.cls) === ob), idx = buildIndex(), t = tally(all);
  const month = todayStr().slice(0, 7);
  const thisMonth = all.filter(s => s.date.slice(0, 7) === month).length;
  let cov = 0, need = 0, combos = 0;
  for (const cls of KEYS) for (const subj of classSubjects(cls)) {
    if (!comboOK(cls, subj)) continue;
    for (const sec of sectionsFor(cls, subj)) { const c = coverage(idx, cls, subj, sec); cov += c.covered; need += c.need; combos++; }
  }
  $('emptyPanel').hidden = !(state.role === 'admin' && state.status === 'ready' && state.sessions.length === 0 && state.settings.teachers.length === 0);
  $('figs').innerHTML = [
    ['Practicals logged', all.length ? String(all.length) : (state.status === 'ready' ? '0' : '—'), all.length ? `${thisMonth} this month` : 'entries so far'],
    ['Syllabus covered', pct(cov, need), combos ? `across ${combos} class-subject sections` : (teacher ? 'log a practical to start' : 'add teachers and sections in Setup')],
    ['Attendance', pct(t.p, t.pt), t.pt ? `${t.p} of ${t.pt} student-sessions` : 'students present in lab'],
    ['Record files checked', pct(t.f, t.ft), t.ft ? `${t.f} of ${t.ft} files signed` : 'files signed after practicals']
  ].map(f => `<div class="fig"><span class="k">${f[0]}</span><span class="v">${f[1]}</span><span class="s">${esc(f[2])}</span></div>`).join('');

  let rows = '';
  for (const cls of KEYS) for (const subj of classSubjects(cls)) {
    if (!comboOK(cls, subj)) continue;
    const secs = sectionsFor(cls, subj), list = all.filter(s => s.cls === cls && s.subj === subj), tt = tally(list);
    const def = SYL[cls][subj];
    const listed = def.groups.reduce((n, g) => n + g.items.length, 0), req = def.groups.reduce((n, g) => n + groupNeed(g), 0);
    let c = 0, n = 0;
    for (const sec of secs) { const x = coverage(idx, cls, subj, sec); c += x.covered; n += x.need; }
    const last = list.length ? sorted(list)[0].date : null;
    rows += `<tr>
      <td><button class="linkish" type="button" data-syl="${cls}|${subj}"><span class="roman">${ROMAN[cls]}</span><span class="cs">${subjTag(subj)}</span></button></td>
      <td class="n">${req}${req < listed ? `<span class="sub">of ${listed} listed</span>` : ''}</td>
      <td>${secs.length ? esc(secs.join(', ')) : '<span class="dim">Not set</span>'}</td>
      <td class="n">${list.length}</td>
      <td>${meter(c, n)}</td>
      <td class="n">${pct(tt.p, tt.pt)}</td>
      <td class="n">${pct(tt.f, tt.ft)}</td>
      <td class="nowrap">${last ? `${fmtShort(last)}<span class="sub">${agoText(last)}</span>` : '<span class="dim">None yet</span>'}</td>
    </tr>`;
  }
  $('classTable').innerHTML = `<table class="t-class"><thead><tr><th>Class and subject</th><th class="n">Record needs</th><th>Sections</th><th class="n">Entries</th><th>Covered</th><th class="n">Attendance</th><th class="n">Files checked</th><th>Last practical</th></tr></thead><tbody>${rows}</tbody></table>`;

  if (teacher) {
    // What this teacher should do next, section by section.
    const a = myCombos(), lines = [], seen = new Set();
    const add = (cls, subj, sec) => {
      const k = `${cls}|${subj}|${sec}`; if (seen.has(k)) return; seen.add(k);
      const c = coverage(idx, cls, subj, sec), nx = nextFor(idx, cls, subj, sec);
      lines.push(`<li><span><strong>${ROMAN[cls]}-${esc(sec)} ${SUBJ[subj].name}</strong> · ${c.covered} of ${c.need} covered</span><span class="meta">${nx ? 'Next: ' + esc(nx.title) : 'Everything on the list is done.'}</span></li>`);
    };
    if (a) for (const x of a) for (const sec of sectionsFor(x.cls, x.subj)) add(x.cls, x.subj, sec);
    for (const s of state.sessions) add(s.cls, s.subj, s.sec);
    $('nextList').innerHTML = lines.length ? `<ul class="next">${lines.join('')}</ul>` : `<p class="pad">Log your first practical and the next one to do in that section shows here.</p>`;
  } else {
    const byT = new Map();
    for (const p of state.settings.teachers) byT.set(p.id, { name:p.name, profile:p, list:[] });
    for (const s of all) {
      if (!byT.has(s.uid)) byT.set(s.uid, { name:tname(s) + (state.user && s.uid === state.user.id ? ' (admin)' : ''), profile:null, list:[] });
      byT.get(s.uid).list.push(s);
    }
    const teachers = [...byT.values()].sort((x, y) => y.list.length - x.list.length || x.name.localeCompare(y.name));
    $('teachAside').textContent = teachers.length ? `${teachers.filter(x => x.list.length).length} of ${teachers.length} have logged` : '';
    $('teacherTable').innerHTML = teachers.length ? `<table class="t-teach"><thead><tr><th>Teacher</th><th class="n">Entries</th><th class="n">Practicals</th><th>Last entry</th></tr></thead><tbody>${teachers.map(x => {
      const subs = [...new Set(x.list.map(s => s.subj))], distinct = new Set(x.list.filter(s => s.pid !== 'other').map(s => s.pid)).size;
      const last = x.list.length ? sorted(x.list)[0].date : null;
      const p = x.profile, bits = [subs.length ? subs.map(k => SUBJ[k].name).join(', ') : 'No entries yet'];
      if (p) bits.push(!p.active ? 'ID deactivated' : p.mustChange ? 'temporary password not used yet' : 'ID in use');
      return `<tr><td><strong>${esc(x.name)}</strong><span class="sub">${esc(bits.join(' · '))}</span></td><td class="n">${x.list.length}</td><td class="n">${distinct}</td><td class="nowrap">${last ? `${fmtShort(last)}<span class="sub">${agoText(last)}</span>` : '<span class="dim">—</span>'}</td></tr>`;
    }).join('')}</tbody></table>` : `<p class="pad">Teachers appear here once their IDs are created in Setup.</p>`;
  }

  const recent = sorted(all).slice(0, 6);
  $('recent').innerHTML = recent.length ? `<ul class="recent">${recent.map(s => `<li><span>${esc(s.title)}</span><span class="meta"><span class="roman">${ROMAN[s.cls]}-${esc(s.sec)}</span>${subjTag(s.subj)}<span>${esc(tname(s))}</span><span>${fmtShort(s.date)}</span></span></li>`).join('')}</ul>` : `<p class="pad">The six most recent entries show here.</p>`;

  const shots = [];
  for (const s of sorted(all)) for (const id of s.photos) shots.push({ id, s });
  $('photoAside').textContent = shots.length ? `${Math.min(12, shots.length)} of ${shots.length}` : '';
  $('gallery').innerHTML = shots.length
    ? `<div class="gallery">${shots.slice(0, 12).map(x => photoBtn('ptile', x.id, x.s, `<span class="cap"><b>${ROMAN[x.s.cls]}-${esc(x.s.sec)} ${SUBJ[x.s.subj].name}</b><span>${fmtShort(x.s.date)} · ${esc(tname(x.s))}</span>${geoLine(x.s.pmeta[x.id])}</span>`)).join('')}</div>`
    : `<p class="pad">Photos added with an entry show here, newest first.</p>`;
}

/* ---------- selects ---------- */
// Rebuilds a select only when its option set really changed, so a refresh never drops what the user picked.
function setOptions(sel, pairs, keep) {
  const sig = pairs.map(p => p[0] + '\u0001' + p[1]).join('\u0002');
  const want = keep != null ? keep : sel.value;
  if (sel.dataset.sig !== sig) { sel.innerHTML = pairs.map(p => `<option value="${esc(p[0])}">${esc(p[1])}</option>`).join(''); sel.dataset.sig = sig; }
  sel.value = pairs.some(p => p[0] === want) ? want : (pairs[0] ? pairs[0][0] : '');
  return sel.value;
}
function fillSubjectSelect(sel, cls, keep, restrict) {
  const subs = classSubjects(cls).filter(k => !restrict || comboOK(cls, k));
  return setOptions(sel, subs.map(k => [k, SUBJ[k].name]), keep);
}

/* ---------- syllabus ---------- */
function renderSyllabus() {
  const { cls, subj } = state.syl, def = SYL[cls][subj], secs = sectionsFor(cls, subj), idx = buildIndex();
  $('sylNote').textContent = def.note;
  const cols = secs.length ? secs.map(s => `<th class="sec">${ROMAN[cls]}-${esc(s)}</th>`).join('') : '<th class="sec">Status</th>';
  let body = '';
  if (secs.length) body += `<tr class="sum"><th colspan="2" scope="row">Covered so far</th>${secs.map(s => { const c = coverage(idx, cls, subj, s); return `<td class="sec"><strong>${c.covered}/${c.need}</strong></td>`; }).join('')}</tr>`;
  for (const g of def.groups) {
    const n = groupNeed(g);
    const needTxt = n < g.items.length ? (n === 1 ? 'any one' : `any ${n} of ${g.items.length}`) : (g.items.length > 1 ? `all ${g.items.length}` : '');
    body += `<tr class="grp"><th colspan="2" scope="rowgroup">${esc(g.name)}${needTxt ? `<span class="need">${needTxt}</span>` : ''}</th>${secs.length ? secs.map(s => {
      const m = idx.get(`${cls}|${subj}|${s}`); let d = 0;
      if (m) g.items.forEach((_, i) => { if (m.has(pidOf(cls, subj, g, i + 1))) d++; });
      return `<th class="sec">${d}/${n}</th>`;
    }).join('') : '<th class="sec"></th>'}</tr>`;
    g.items.forEach((title, i) => {
      const pid = pidOf(cls, subj, g, i + 1);
      const cells = secs.length ? secs.map(s => {
        const m = idx.get(`${cls}|${subj}|${s}`), a = m && m.get(pid);
        if (!a) return '<td class="sec"><span class="todo" aria-label="Not done">—</span></td>';
        const first = [...a].sort((x, y) => x.date.localeCompare(y.date))[0];
        return `<td class="sec"><span class="done" title="${esc(tname(first))}">${CHECK}${fmtShort(first.date)}${a.length > 1 ? `<small>×${a.length}</small>` : ''}</span></td>`;
      }).join('') : '<td class="sec"><span class="todo">Not logged</span></td>';
      body += `<tr><td class="num">${numOf(g, i)}</td><td>${esc(title)}</td>${cells}</tr>`;
    });
  }
  $('sylTable').innerHTML = `<table class="matrix"><thead><tr><th class="n">#</th><th>Practical</th>${cols}</tr></thead><tbody>${body}</tbody></table>`;
}

/* ---------- entries ---------- */
function renderEntries() {
  const names = [...new Set(state.sessions.map(tname))].sort((a, b) => a.localeCompare(b));
  const sel = $('eTeacher'), keep = state.filt.teacher;
  sel.innerHTML = '<option value="">All</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value = names.includes(keep) ? keep : ''; state.filt.teacher = sel.value;
  const f = state.filt;
  const list = sorted(state.sessions.filter(s => (!f.board || boardOf(s.cls) === f.board) && (!f.cls || rawCls(s.cls) === f.cls) && (!f.subj || s.subj === f.subj) && (!f.teacher || tname(s) === f.teacher)));
  $('entriesAside').textContent = `${list.length} of ${state.sessions.length} entries`;
  const acts = list.some(canModify);
  $('entriesTable').innerHTML = list.length ? `<table class="t-entries"><thead><tr><th>Date</th><th>Class</th><th>Subject</th><th>Practical</th><th>Teacher</th><th class="n">Present</th><th class="n">Files</th><th>Photos</th>${acts ? '<th></th>' : ''}</tr></thead><tbody>${list.map(s => `<tr>
    <td class="nowrap">${fmtDate(s.date)}</td>
    <td class="nowrap"><span class="roman">${ROMAN[s.cls]}-${esc(s.sec)}</span></td>
    <td>${subjTag(s.subj)}</td>
    <td>${esc(s.title)}<span class="sub">${esc(s.group)}${s.note ? ' · ' + esc(s.note) : ''}</span></td>
    <td>${esc(tname(s))}</td>
    <td class="n">${s.present != null && s.total ? `${s.present}/${s.total}` : '—'}</td>
    <td class="n">${s.files != null && s.total ? `${s.files}/${s.total}` : '—'}</td>
    <td class="nowrap">${s.photos.length ? s.photos.map(id => photoBtn('pmini', id, s)).join('') + `<span class="sub">Location on ${s.photos.filter(id => s.pmeta[id].lat != null).length} of ${s.photos.length}</span>` : '<span class="dim">—</span>'}</td>
    ${acts ? `<td class="nowrap">${!canModify(s) ? '' : state.confirmDel === s.key
      ? `<button class="btn small danger" type="button" data-del-yes="${esc(s.key)}">Delete entry</button> <button class="btn small ghost" type="button" data-del-no="1">Keep</button>`
      : `<button class="btn small ghost" type="button" data-edit="${esc(s.key)}">Edit</button> <button class="btn small ghost" type="button" data-del="${esc(s.key)}">Delete</button>`}</td>` : ''}
  </tr>`).join('')}</tbody></table>` : `<p class="pad">${state.sessions.length ? 'No entries match these filters.' : 'Entries saved from Log a practical are listed here, newest first.'}</p>`;
}

/* ---------- log form ---------- */
const fKey = () => classKey($('fBoard').value, $('fClass').value);
function fillPracticals() {
  const cls = fKey(), subj = $('fSubj').value;
  if (!own(SYL, cls) || !own(SYL[cls], subj)) return;
  const def = SYL[cls][subj];
  $('fPractical').innerHTML = '<option value="">Choose a practical</option>' + def.groups.map(g =>
    `<optgroup label="${esc(g.name)}">${g.items.map((t, i) => `<option value="${pidOf(cls, subj, g, i + 1)}">${numOf(g, i)}. ${esc(t)}</option>`).join('')}</optgroup>`).join('') +
    `<optgroup label="Outside the ${BOARDS[boardOf(cls)]} list"><option value="other">Other practical work</option></optgroup>`;
  $('fPractical').dataset.sig = cls + '|' + subj;
  $('otherWrap').hidden = true;
}
// Board, class, subject and teacher offered in the form: everything for the admin, only assigned classes for a teacher.
function refreshFormSelects() {
  if (state.editing || !state.user) return;
  const a = myCombos(), me = state.user;
  const boards = Object.keys(BOARDS).filter(b => !a || a.some(x => boardOf(x.cls) === b));
  const want = $('fBoard').dataset.want || null;   // the board this person used last time
  if (want) delete $('fBoard').dataset.want;
  const board = setOptions($('fBoard'), boards.map(b => [b, BOARDS[b]]), want);
  const classes = Object.keys(RN).filter(c => !a || a.some(x => x.cls === classKey(board, c)));
  setOptions($('fClass'), classes.map(c => [c, `${RN[c]} (${c})`]), $('fClass').value || '12');
  fillSubjectSelect($('fSubj'), fKey(), $('fSubj').value, true);
  if ($('fPractical').dataset.sig !== fKey() + '|' + $('fSubj').value) fillPracticals();
  const admin = state.role === 'admin';
  setOptions($('fTeacher'), admin
    ? [['', 'Choose the teacher']].concat(state.settings.teachers.filter(t => t.active).map(t => [String(t.id), t.name]), [[String(me.id), me.name + ' (admin)']])
    : [[String(me.id), me.name]]);
  $('fTeacher').disabled = !admin;
}
function fillDatalists() {
  if (!$('fSubj').value) return;
  $('secList').innerHTML = sectionsFor(fKey(), $('fSubj').value).map(s => `<option value="${esc(s)}"></option>`).join('');
}
function autoTotal() {
  if (state.editing) return;
  const el = $('fTotal');
  if (el.value && !state.totalAuto) return;
  const cls = fKey(), sec = normSec($('fSec').value);
  const last = sorted(state.sessions.filter(s => s.cls === cls && s.sec === sec && s.total))[0];
  el.value = last ? last.total : ''; state.totalAuto = !!last;
}
function lockForm(on) { for (const id of ['fBoard', 'fClass', 'fSec', 'fSubj']) $(id).disabled = on; $('fTeacher').disabled = on || state.role !== 'admin'; }
function renderEditState() {
  const e = !!state.editing;
  $('editNote').hidden = !e; $('cancelEdit').hidden = !e; $('photoField').hidden = e;
  $('saveBtn').textContent = e ? 'Save changes' : 'Save entry';
}
function startEdit(key) {
  const s = state.sessions.find(x => x.key === key);
  if (!s || !canModify(s) || state.saving) return;
  state.editing = { key, id:s.id };
  const b = boardOf(s.cls), c = rawCls(s.cls);
  setOptions($('fBoard'), [[b, BOARDS[b]]], b);
  setOptions($('fClass'), [[c, `${RN[c]} (${c})`]], c);
  setOptions($('fSubj'), [[s.subj, SUBJ[s.subj].name]], s.subj);
  setOptions($('fTeacher'), [[String(s.uid), tname(s)]], String(s.uid));
  fillPracticals();
  $('fPractical').value = s.pid; $('otherWrap').hidden = s.pid !== 'other'; $('fOther').value = s.pid === 'other' ? s.title : '';
  $('fDate').value = s.date; $('fSec').value = s.sec;
  $('fPresent').value = s.present == null ? '' : s.present; $('fTotal').value = s.total == null ? '' : s.total;
  $('fFiles').value = s.files == null ? '' : s.files; $('fNote').value = s.note;
  clearPending(); lockForm(true); renderEditState(); formMsg('formMsg', ''); showTab('log', true);
}
function endEdit() {
  state.editing = null; lockForm(false);
  $('fPractical').value = ''; $('fOther').value = ''; $('otherWrap').hidden = true; $('fSec').value = '';
  $('fPresent').value = ''; $('fTotal').value = ''; $('fFiles').value = ''; $('fNote').value = ''; $('fDate').value = todayStr();
  state.totalAuto = false;
  renderEditState(); refreshFormSelects();
}

/* ---------- photos and location ---------- */
const MAX_PHOTOS = 4;
const PHOTO_HINT = 'Up to 4 photos. Each is stamped with its time, location, class and teacher. Allow location when your phone asks.';
// The phone's own position, asked once per visit and only when a photo carries no GPS of its own.
let geoWait = null;
function deviceGeo() {
  if (!('geolocation' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  if (!geoWait) geoWait = new Promise(res => navigator.geolocation.getCurrentPosition(
    p => res({ lat:Math.round(p.coords.latitude * 1e6) / 1e6, lng:Math.round(p.coords.longitude * 1e6) / 1e6 }),
    () => { geoWait = null; res(null); },
    { enableHighAccuracy:true, timeout:15000, maximumAge:120000 }));
  return geoWait;
}
function renderStrip() {
  const el = $('photoStrip');
  el.hidden = !state.pending.length;
  el.innerHTML = state.pending.map((p, i) => `<div class="pick"><figure class="thumb"><img src="${p.url}" alt="Photo ${i + 1} to upload"><button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button></figure>${
    p.meta === undefined ? '<span class="gps">Finding location…</span>' : p.meta.lat == null ? '<span class="gps">No location</span>'
      : `<span class="gps yes">${CHECK}${p.meta.src === 'device' ? 'Phone location' : 'GPS from photo'}</span>`}</div>`).join('');
  const none = state.pending.filter(p => p.meta && p.meta.lat == null).length;
  $('photoHint').textContent = !state.pending.length ? PHOTO_HINT + (window.isSecureContext ? '' : ' Phone location works only when this site opens with https.')
    : `${state.pending.length} of ${MAX_PHOTOS} photos added.` + (none ? ` ${none} ${none === 1 ? 'has' : 'have'} no location: the photo carries none and the phone's location was not allowed. The stamp will show time, class and teacher only.` : '');
}
function addPhotos(files) {
  let skipped = 0;
  for (const f of files) {
    if (state.pending.length >= MAX_PHOTOS) { skipped++; continue; }
    const item = { file:f, url:URL.createObjectURL(f), id:null, key:'', meta:undefined };
    state.pending.push(item);
    readMeta(f).then(m => { item.meta = m; if (state.pending.includes(item)) renderStrip(); });
  }
  renderStrip();
  formMsg('formMsg', skipped ? `Only ${MAX_PHOTOS} photos fit in one entry, so ${skipped} ${skipped === 1 ? 'was' : 'were'} not added.` : '', !!skipped);
}
function clearPending() { for (const p of state.pending) URL.revokeObjectURL(p.url); state.pending = []; renderStrip(); }
// Location for a photo: the GPS the camera wrote into it, else the phone's position right now.
async function readMeta(file) {
  const m = await readExif(file);
  if (m.lat != null) m.src = 'photo';
  else { const g = await deviceGeo(); if (g) { m.lat = g.lat; m.lng = g.lng; m.src = 'device'; } else m.src = ''; }
  return m;
}
async function readExif(file) {
  const out = { lat:null, lng:null, t:null, src:'' };
  try {
    const v = new DataView(await file.slice(0, 262144).arrayBuffer());
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
    let o = 2;
    while (o + 4 <= v.byteLength) {
      const marker = v.getUint16(o);
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      const len = v.getUint16(o + 2);
      if (marker === 0xFFE1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966 && v.getUint16(o + 8) === 0) {
        parseTiff(v, o + 10, Math.min(v.byteLength, o + 2 + len), out);
        break;
      }
      o += 2 + len;
    }
  } catch (_) {}
  return out;
}
function parseTiff(v, base, end, out) {
  if (base + 8 > end) return;
  const order = v.getUint16(base);
  if (order !== 0x4949 && order !== 0x4D4D) return;
  const le = order === 0x4949, u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const ok = (p, n) => p >= base && p + n <= end;
  const ifd = (off, fn) => {
    const p = base + off; if (!ok(p, 2)) return;
    const n = u16(p);
    for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; if (!ok(e, 12)) return; fn(u16(e), u16(e + 2), u32(e + 4), e + 8); }
  };
  const ascii = (count, vp) => {
    const p = count > 4 ? base + u32(vp) : vp; if (!ok(p, count)) return '';
    let s = ''; for (let i = 0; i < count; i++) { const ch = v.getUint8(p + i); if (!ch) break; s += String.fromCharCode(ch); }
    return s;
  };
  const dms = vp => {
    const p = base + u32(vp); if (!ok(p, 24)) return null;
    const r = []; for (let i = 0; i < 3; i++) { const den = u32(p + i * 8 + 4); if (!den) return null; r.push(u32(p + i * 8) / den); }
    return r[0] + r[1] / 60 + r[2] / 3600;
  };
  let exifOff = 0, gpsOff = 0;
  ifd(u32(base + 4), (tag, type, count, vp) => { if (tag === 0x8769) exifOff = u32(vp); else if (tag === 0x8825) gpsOff = u32(vp); });
  if (exifOff) ifd(exifOff, (tag, type, count, vp) => {
    if (tag !== 0x9003 || type !== 2) return;
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(count, vp));
    if (m && m[1] !== '0000') out.t = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  });
  if (!gpsOff) return;
  let latRef = '', lngRef = '', lat = null, lng = null;
  ifd(gpsOff, (tag, type, count, vp) => {
    if (tag === 1) latRef = ascii(count, vp); else if (tag === 3) lngRef = ascii(count, vp);
    else if (tag === 2 && type === 5 && count === 3) lat = dms(vp);
    else if (tag === 4 && type === 5 && count === 3) lng = dms(vp);
  });
  if (lat == null || lng == null || !/^[NS]/.test(latRef) || !/^[EW]/.test(lngRef)) return;
  if (latRef[0] === 'S') lat = -lat;
  if (lngRef[0] === 'W') lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return;
  out.lat = Math.round(lat * 1e6) / 1e6; out.lng = Math.round(lng * 1e6) / 1e6;
}
function stampLines(meta, cls, sec, subj, teacher) {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const now = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
  const lines = [meta.t ? fmtStamp(meta.t) : 'Uploaded ' + fmtStamp(now)];
  if (meta.lat != null) lines.push(fmtCoord(meta.lat, meta.lng) + (meta.src === 'device' ? ' · phone location' : ''));
  lines.push(`${ROMAN[cls]}-${sec} ${SUBJ[subj].name} · ${teacher}`);
  return lines;
}
function drawStamp(c, lines) {
  const g = c.getContext('2d'), fs = Math.max(13, Math.round(Math.min(c.width, c.height * 1.4) * 0.026));
  const pad = Math.round(fs * 0.75), lh = Math.round(fs * 1.4), maxW = c.width - pad * 2;
  g.font = `600 ${fs}px "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif`; g.textBaseline = 'top';
  const fit = t => { if (g.measureText(t).width <= maxW) return t; let s = t; while (s.length > 4 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
  const rows = lines.map(fit), h = pad * 2 + rows.length * lh - (lh - fs);
  g.fillStyle = 'rgba(8,14,19,.74)'; g.fillRect(0, c.height - h, c.width, h);
  g.fillStyle = '#FFFFFF';
  rows.forEach((t, i) => g.fillText(t, pad, c.height - h + pad + i * lh));
}
// Phone photos are several MB each; shrink to a 1600px JPEG and burn in the stamp before upload.
async function shrink(file, lines) {
  let src = null;
  try { src = await createImageBitmap(file, { imageOrientation:'from-image' }); } catch (_) {}
  if (!src) {
    const url = URL.createObjectURL(file);
    try { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }); }
    catch (_) { throw { code:'unsupported', message:'' }; }
    finally { URL.revokeObjectURL(url); }
  }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  if (!w || !h) throw { code:'unsupported', message:'' };
  const k = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (lines && lines.length) drawStamp(c, lines);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
  if (!blob) throw { code:'unsupported', message:'' };
  return blob;
}
async function uploadPhoto(blob, meta) {
  const fd = new FormData();
  fd.append('file', blob, 'photo.jpg');
  if (meta.lat != null) { fd.append('lat', String(meta.lat)); fd.append('lng', String(meta.lng)); fd.append('src', meta.src); }
  if (meta.t) fd.append('t', meta.t);
  return (await api('photo.upload', undefined, fd)).id;
}
function photoError(e, n) {
  const c = e && e.code;
  if (c === 'unsupported') return `Photo ${n} could not be read. Use a JPG or PNG photo, or remove it and save.`;
  if (c === 'too_large') return `Photo ${n} is too large. Remove it or pick a smaller one.`;
  if (c === 'network') return `Photo ${n} did not upload. Check your connection and press Save entry again.`;
  return `Photo ${n}: ${(e && e.message) || 'did not upload. Try again.'}`;
}
let lastFocus = null;
function openPhoto(id, sid) {
  const s = state.sessions.find(x => x.key === sid);
  lastFocus = document.activeElement;
  $('lbImg').src = PHOTO_URL + '?id=' + encodeURIComponent(id);
  $('lbImg').alt = s ? `Photo from: ${s.title}` : 'Lab photo';
  $('lbCap').textContent = s ? `${s.title} · ${ROMAN[s.cls]}-${s.sec} ${SUBJ[s.subj].name} · ${tname(s)} · ${fmtDate(s.date)}` : '';
  const m = s && s.pmeta[id];
  $('lbGeo').hidden = !m;
  if (m) {
    const hasGeo = m.lat != null;
    $('lbGeoText').textContent = (m.t ? `Taken ${fmtStamp(m.t)}` : 'Capture time not in photo') + ' · '
      + (hasGeo ? fmtCoord(m.lat, m.lng) + (m.src === 'device' ? ' (phone location when uploaded)' : ' (GPS from the photo)') : 'No location saved');
    $('lbMap').hidden = !hasGeo;
    if (hasGeo) $('lbMap').href = `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`; else $('lbMap').removeAttribute('href');
  }
  $('lightbox').hidden = false; $('lbClose').focus();
}
function closePhoto() {
  $('lightbox').hidden = true; $('lbImg').removeAttribute('src');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

async function saveEntry(ev) {
  ev.preventDefault();
  if (state.saving || !state.user) return;
  const cls = fKey(), subj = $('fSubj').value, date = $('fDate').value, sec = normSec($('fSec').value);
  const uid = Number($('fTeacher').value) || 0;
  const pid = $('fPractical').value, other = str($('fOther').value, 160);
  const present = $('fPresent').value === '' ? null : Number($('fPresent').value), total = $('fTotal').value === '' ? null : Number($('fTotal').value);
  const files = $('fFiles').value === '' ? 0 : Number($('fFiles').value);
  const whole = n => Number.isInteger(n) && n >= 0 && n <= 200;
  let err = '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err = 'Choose the date of the practical.';
  else if (date > todayStr()) err = 'The date cannot be in the future.';
  else if (!sec) err = 'Enter the section, for example A.';
  else if (!uid) err = 'Choose the teacher who took the practical.';
  else if (!pid) err = 'Choose the practical that was done.';
  else if (pid === 'other' && !other) err = 'Describe what was done in the lab.';
  else if (total == null || !whole(total) || total < 1) err = 'Enter the number of students in the section.';
  else if (present == null || !whole(present)) err = 'Enter how many students were present.';
  else if (present > total) err = 'Students present cannot be more than students in the section.';
  else if (!whole(files) || files > total) err = 'Record files checked cannot be more than students in the section.';
  if (err) { formMsg('formMsg', err, true); return; }
  const doc = { date, pid, title: pid === 'other' ? other : '', present, total, files, note:str($('fNote').value, 300) };

  state.saving = true; $('saveBtn').disabled = true;
  try {
    if (state.editing) {
      formMsg('formMsg', 'Saving…');
      await api('entry.save', Object.assign({ id:state.editing.id }, doc));
      endEdit(); await refresh(); formMsg('formMsg', 'Changes saved.'); toast('Entry updated'); showTab('entries', true);
      return;
    }
    const t = teacherById(uid), who = t ? t.name : state.user.name;
    const picks = state.pending.slice(), ids = [];
    const key = [cls, sec, subj, who].join('|');
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      // The stamp is baked into the pixels: a photo uploaded on an earlier attempt with other details is redone.
      if (p.id && p.key !== key) { api('photo.discard', { id:p.id }).catch(() => {}); p.id = null; }
      if (!p.id) {
        formMsg('formMsg', `Uploading photo ${i + 1} of ${picks.length}…`);
        try {
          if (p.meta === undefined) p.meta = await readMeta(p.file);
          p.id = await uploadPhoto(await shrink(p.file, stampLines(p.meta, cls, sec, subj, who)), p.meta); p.key = key;
        } catch (e) {
          if (e && (e.code === 'auth' || e.code === 'must_change')) { session(); return; }
          formMsg('formMsg', photoError(e, i + 1), true); return;
        }
      }
      ids.push(p.id);
    }
    formMsg('formMsg', 'Saving…');
    await api('entry.save', Object.assign({ cls, sec, subj, uid, photos:ids }, doc));
    clearPending();
    try { localStorage.setItem('spr.board', $('fBoard').value); } catch (_) {}
    $('fPractical').value = ''; $('fOther').value = ''; $('otherWrap').hidden = true; $('fPresent').value = ''; $('fFiles').value = ''; $('fNote').value = '';
    state.totalAuto = true;
    await refresh();
    formMsg('formMsg', `Saved for ${ROMAN[cls]}-${sec} ${SUBJ[subj].name}. Log the next one or open Syllabus to see the tick.`);
    toast('Entry saved');
  } catch (e) { failed(e, 'formMsg'); }
  finally { state.saving = false; $('saveBtn').disabled = false; }
}

/* ---------- setup (admin): teacher IDs and sections ---------- */
const subjOptions = (c, keep) => (Number(c) <= 10 ? ['science'] : ['physics', 'chemistry', 'biology']).map(k => `<option value="${k}"${k === keep ? ' selected' : ''}>${SUBJ[k].name}</option>`).join('');
const parseSecs = v => [...new Set(String(v).split(/[,;\n]+/).map(normSec).filter(Boolean))].slice(0, 20);
// Each teacher card edits a draft; a refresh from the server replaces only drafts that have no unsaved change.
function syncDrafts() {
  const live = new Set();
  for (const t of state.settings.teachers) {
    live.add(String(t.id));
    if (!state.tdirty[t.id]) state.tdraft[t.id] = { name:t.name, assign:t.assign.map(a => ({ cls:a.cls, subj:a.subj, secs:a.secs.slice() })) };
  }
  for (const k of Object.keys(state.tdraft)) if (!live.has(k)) { delete state.tdraft[k]; delete state.tdirty[k]; }
  const sig = JSON.stringify(state.settings.teachers);
  if (sig !== state.teachSig) { state.teachSig = sig; renderTeacherEditor(); }
  if (!state.sectionsDirty) for (const cls of Object.keys(SYL)) $('sec' + cls).value = (state.settings.sections[cls] || []).join(', ');
}
function renderTeacherEditor() {
  $('tEditor').innerHTML = state.settings.teachers.map(t => {
    const d = state.tdraft[t.id] || { name:t.name, assign:t.assign }, i = t.id;
    const status = !t.active ? 'This ID is deactivated: the teacher cannot sign in. Their entries stay in the register.'
      : t.mustChange ? 'Waiting for first sign-in with the temporary password.' : 'In use: the teacher has set their own password.';
    return `<div class="ted">
      <div class="ted-head">
        <div class="field"><label for="tn-${i}">Teacher name</label><input type="text" id="tn-${i}" data-tname="${i}" maxlength="60" value="${esc(d.name)}" autocomplete="off"></div>
        <span class="idtag">ID: ${esc(t.username)}</span>
      </div>
      <span class="ted-status">${status}</span>
      <div class="chips">${d.assign.length ? d.assign.map((a, j) => `<span class="achip">${ROMAN[a.cls]} · ${SUBJ[a.subj].name} · ${a.secs.length ? 'section ' + esc(a.secs.join(', ')) : 'all sections'}<button type="button" data-arm="${i}|${j}" aria-label="Remove ${ROMAN[a.cls]} ${SUBJ[a.subj].name}">×</button></span>`).join('') : '<span class="ted-status">No classes added, so this teacher can log for any class.</span>'}</div>
      <div class="ted-add">
        <div class="field"><label for="ab-${i}">Board</label><select id="ab-${i}"><option value="cbse">CBSE</option><option value="up">UP Board</option></select></div>
        <div class="field"><label for="ac-${i}">Class</label><select id="ac-${i}" data-ac="${i}">${Object.keys(RN).map(c => `<option value="${c}"${c === '12' ? ' selected' : ''}>${RN[c]} (${c})</option>`).join('')}</select></div>
        <div class="field"><label for="as-${i}">Subject</label><select id="as-${i}">${subjOptions('12')}</select></div>
        <div class="field"><label for="ax-${i}">Sections</label><input type="text" id="ax-${i}" maxlength="60" placeholder="A, B" autocomplete="off"></div>
        <button class="btn ghost small" type="button" data-aadd="${i}">Add class</button>
      </div>
      <div class="ted-actions">
        <button class="btn small" type="button" data-tsave="${i}">Save changes</button>
        ${state.confirmPw === i
          ? `<button class="btn small danger" type="button" data-tpw-yes="${i}">Yes, replace the password</button> <button class="btn ghost small" type="button" data-tpw-no="1">Keep the current one</button>`
          : `<button class="btn ghost small" type="button" data-tpw="${i}">New temporary password</button>`}
        <button class="btn ghost small" type="button" data-tact="${i}">${t.active ? 'Deactivate ID' : 'Activate ID'}</button>
        <span class="form-msg" id="tm-${i}" role="status">${state.tdirty[i] ? 'Not saved yet.' : ''}</span>
      </div>
    </div>`;
  }).join('') || '<span class="ted-status">No teacher IDs yet. Create the first one above.</span>';
}
// The school's own teacher list: offered to the admin as one button while any of those teachers has no ID.
async function loadSeed() {
  if (state.role !== 'admin') return;
  try { state.seed = (await api('seed.list')).teachers || []; } catch (_) { state.seed = []; }
  const s = state.seed, box = $('seedBox');
  box.hidden = !s.length;
  if (s.length) box.innerHTML = `<strong>${s.length} ${s.length === 1 ? 'teacher' : 'teachers'} on the school's list ${s.length === 1 ? 'has' : 'have'} no ID yet:</strong> ${esc(s.map(t => t.name).join(', '))}. Their classes are filled in from the list. <button class="btn small" type="button" id="seedBtn">Create these IDs</button>`;
}
async function createSeed(el) {
  el.disabled = true; formMsg('teacherMsg', 'Creating…');
  try {
    // The server makes two IDs per request (free-plan CPU limit), so ask until none are left.
    const rows = [];
    for (let i = 0; i < 20; i++) { const got = (await api('seed.create', {})).created || []; if (!got.length) break; rows.push(...got); }
    $('tempPw').hidden = false;
    $('tempPw').innerHTML = `<strong>${rows.length} IDs created.</strong> Note these down now: the temporary passwords are shown only once. Each teacher sets their own password at first sign-in.
      <div class="table-wrap" style="margin-block:10px"><table><thead><tr><th>Teacher</th><th>ID</th><th>Temporary password</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td><span class="temp-pw">${esc(r.username)}</span></td><td><span class="temp-pw">${esc(r.tempPassword)}</span></td></tr>`).join('')}</tbody></table></div>
      <button class="btn ghost small" type="button" id="tempPwHide">I have noted them, hide</button>`;
    formMsg('teacherMsg', '');
    state.teachSig = ''; await refresh(); await loadSeed();
  } catch (e) { el.disabled = false; failed(e, 'teacherMsg'); }
}
function showTempPw(name, username, temp) {
  $('tempPw').hidden = false;
  $('tempPw').innerHTML = `<strong>${esc(name)}</strong> · ID <span class="temp-pw">${esc(username)}</span> · Temporary password <span class="temp-pw">${esc(temp)}</span><br>Give these to the teacher now. This password is shown only once, and at first sign-in the teacher must set their own. <button class="btn ghost small" type="button" id="tempPwHide">Hide</button>`;
}
async function createTeacher(ev) {
  ev.preventDefault();
  const name = str($('ntName').value, 60), username = str($('ntUser').value, 40).toLowerCase();
  if (!name) { formMsg('teacherMsg', 'Enter the teacher\'s name.', true); return; }
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) { formMsg('teacherMsg', 'The ID needs 3 to 30 characters: small letters, digits, dot, dash or underscore.', true); return; }
  $('ntBtn').disabled = true; formMsg('teacherMsg', 'Creating…');
  try {
    const j = await api('user.create', { name, username });
    $('ntName').value = ''; $('ntUser').value = '';
    showTempPw(name, j.user.username, j.tempPassword);
    formMsg('teacherMsg', 'ID created. Add the teacher\'s classes in the card below.');
    await refresh(); loadSeed();
  } catch (e) { failed(e, 'teacherMsg'); }
  finally { $('ntBtn').disabled = false; }
}
function setupClick(el) {
  const ds = el.dataset;
  if (el.id === 'tempPwHide') { $('tempPw').hidden = true; $('tempPw').textContent = ''; return true; }
  if (el.id === 'seedBtn') { createSeed(el); return true; }
  if (ds.arm) { const [i, j] = ds.arm.split('|').map(Number); if (state.tdraft[i]) { state.tdraft[i].assign.splice(j, 1); state.tdirty[i] = true; renderTeacherEditor(); } return true; }
  if (ds.aadd) {
    const i = Number(ds.aadd), d = state.tdraft[i]; if (!d) return true;
    const cls = classKey($('ab-' + i).value, $('ac-' + i).value), subj = $('as-' + i).value, secs = parseSecs($('ax-' + i).value);
    if (!own(SYL, cls) || !own(SYL[cls], subj)) return true;
    const hit = d.assign.find(a => a.cls === cls && a.subj === subj);
    if (hit) hit.secs = [...new Set(hit.secs.concat(secs))]; else d.assign.push({ cls, subj, secs });
    state.tdirty[i] = true; renderTeacherEditor();
    return true;
  }
  if (ds.tsave) {
    const i = Number(ds.tsave), d = state.tdraft[i]; if (!d) return true;
    const name = str(d.name, 60);
    if (!name) { formMsg('tm-' + i, 'Enter the teacher\'s name.', true); return true; }
    el.disabled = true;
    api('user.update', { id:i, name, assign:d.assign }).then(async () => { state.tdirty[i] = false; state.teachSig = ''; await refresh(); toast('Teacher saved'); }, e => { el.disabled = false; failed(e, 'tm-' + i); });
    return true;
  }
  if (ds.tpw) { state.confirmPw = Number(ds.tpw); renderTeacherEditor(); formMsg('tm-' + ds.tpw, 'The teacher\'s current password will stop working.'); return true; }
  if (ds.tpwNo) { state.confirmPw = null; renderTeacherEditor(); return true; }
  if (ds.tpwYes) {
    const i = Number(ds.tpwYes), t = teacherById(i); state.confirmPw = null; el.disabled = true;
    api('user.resetpw', { id:i }).then(async j => { showTempPw(t ? t.name : '', j.username, j.tempPassword); state.teachSig = ''; await refresh(); $('tempPw').scrollIntoView({ block:'center' }); }, e => { renderTeacherEditor(); failed(e, 'tm-' + i); });
    return true;
  }
  if (ds.tact) {
    const i = Number(ds.tact), t = teacherById(i); if (!t) return true;
    el.disabled = true;
    api('user.update', { id:i, active:!t.active }).then(async () => { state.teachSig = ''; await refresh(); toast(t.active ? 'ID deactivated' : 'ID activated'); }, e => { el.disabled = false; failed(e, 'tm-' + i); });
    return true;
  }
  return false;
}
async function saveSections(ev) {
  ev.preventDefault();
  const sections = {};
  for (const cls of Object.keys(SYL)) sections[cls] = parseSecs($('sec' + cls).value);
  $('setupSave').disabled = true; formMsg('setupMsg', 'Saving…');
  try { await api('sections.save', { sections }); state.sectionsDirty = false; await refresh(); formMsg('setupMsg', 'Sections saved.'); toast('Sections saved'); }
  catch (e) { failed(e, 'setupMsg'); }
  finally { $('setupSave').disabled = false; }
}

/* ---------- role and status ---------- */
function renderAccess() {
  const r = state.role, teacher = r === 'teacher', me = state.user;
  $('tabbtn-setup').hidden = r !== 'admin';
  $('tabbtn-overview').textContent = teacher ? 'My work' : 'Overview';
  $('tabbtn-entries').textContent = teacher ? 'My entries' : 'Entries';
  $('entriesTitle').textContent = teacher ? 'My entries' : 'All entries';
  if (r !== 'admin' && state.tab === 'setup') showTab('overview', true);
  $('teachPanel').hidden = teacher; $('nextPanel').hidden = !teacher;
  $('eTeacherField').hidden = teacher;
  const a = myCombos();
  $('oBoardBar').hidden = !!a && new Set(a.map(x => boardOf(x.cls))).size < 2;
  if ($('oBoardBar').hidden && state.ovBoard) { state.ovBoard = ''; $('oBoard').value = ''; }
  // a teacher's Syllabus tab opens on their own first class
  if (teacher && a && !state.sylSet) {
    state.sylSet = true; state.syl = { cls:a[0].cls, subj:a[0].subj };
    $('sBoard').value = boardOf(a[0].cls); $('sClass').value = rawCls(a[0].cls); fillSubjectSelect($('sSubj'), a[0].cls, a[0].subj);
  }
  $('sync').classList.toggle('live', state.status === 'ready');
  $('syncText').textContent = me ? (r === 'admin' ? 'Admin · ' + me.name : me.name) : '';
  const b = $('banner');
  b.hidden = state.status !== 'error';
  if (!b.hidden) b.textContent = 'The register could not load from the server. Check your connection; it will try again by itself.';
}
function renderAll() { renderAccess(); renderOverview(); renderSyllabus(); renderEntries(); refreshFormSelects(); fillDatalists(); }

async function refresh() {
  try {
    const j = await api('state');
    state.settings = { sections:cleanSections(j.sections), teachers:cleanTeachers(j.teachers) };
    if (state.role === 'teacher') { const meNow = state.settings.teachers.find(t => t.id === state.user.id); if (meNow) { state.user.name = meNow.name; state.user.assign = meNow.assign; } }
    state.sessions = (Array.isArray(j.entries) ? j.entries : []).map(cleanSession).filter(Boolean);
    state.status = 'ready';
    if (state.role === 'admin') syncDrafts();
  } catch (e) {
    if (e && (e.code === 'auth' || e.code === 'must_change')) { session(); return; }
    state.status = 'error';
  }
  renderAll(); autoTotal();
}

/* ---------- sign-in, password, screens ---------- */
function show(v) {
  const map = { boot:'bootMsg', auth:'authView', pw:'pwView', app:'appView' };
  for (const k of Object.keys(map)) $(map[k]).hidden = k !== v;
}
function openPw(forced) {
  $('pwTitle').textContent = forced ? 'Set your own password' : 'Change your password';
  $('pwLede').textContent = forced ? 'You signed in with a temporary password. Set your own now; after this only you know it.' : '';
  $('pwLede').hidden = !forced;
  $('pCurLabel').textContent = forced ? 'Temporary password' : 'Current password';
  $('pwCancel').textContent = forced ? 'Sign out' : 'Cancel';
  $('pwForm').dataset.forced = forced ? '1' : '';
  $('pCur').value = ''; $('pNew').value = ''; $('pNew2').value = ''; formMsg('pwMsg', '');
  show('pw'); $('pCur').focus();
}
async function session() {
  clearInterval(state.timer); state.timer = null;
  let j;
  try { j = await api('me'); }
  catch (_) { show('boot'); $('bootMsg').textContent = 'The register could not be reached. Check your connection and reload the page.'; return; }
  if (j.installed === false) { location.href = '/setup'; return; }
  state.csrf = j.csrf; state.user = j.user;
  if (!j.user) { state.role = 'anon'; state.sessions = []; show('auth'); $('lUser').focus(); return; }
  if (j.user.mustChange) { state.role = 'pw'; openPw(true); return; }
  state.role = j.user.role === 'admin' ? 'admin' : 'teacher';
  state.status = 'loading';
  try { if (localStorage.getItem('spr.board') === 'up') $('fBoard').dataset.want = 'up'; } catch (_) {}
  show('app');
  await refresh();
  loadSeed();
  // Other people's entries arrive by asking again once a minute while the page is in view.
  state.timer = setInterval(() => { if (document.visibilityState === 'visible' && !state.saving && (state.role === 'admin' || state.role === 'teacher')) refresh(); }, 60000);
}
async function doLogin(ev) {
  ev.preventDefault();
  const username = $('lUser').value.trim(), password = $('lPass').value;
  if (!username || !password) { formMsg('loginMsg', 'Enter your ID and password.', true); return; }
  $('loginBtn').disabled = true; formMsg('loginMsg', 'Signing in…');
  try { await api('login', { username, password }); $('lPass').value = ''; formMsg('loginMsg', ''); await session(); }
  catch (e) { formMsg('loginMsg', (e && e.message) || 'Could not sign in.', true); if (e && e.code === 'csrf') session(); }
  finally { $('loginBtn').disabled = false; }
}
async function doPassword(ev) {
  ev.preventDefault();
  const current = $('pCur').value, next = $('pNew').value;
  if (next.length < 8) { formMsg('pwMsg', 'The new password needs at least 8 characters.', true); return; }
  if (next !== $('pNew2').value) { formMsg('pwMsg', 'The two new passwords do not match.', true); return; }
  $('pwBtn').disabled = true; formMsg('pwMsg', 'Saving…');
  try { await api('password', { current, next }); toast('Password saved'); await session(); }
  catch (e) { if (e && e.code === 'auth') session(); else formMsg('pwMsg', (e && e.message) || 'Could not save the password.', true); }
  finally { $('pwBtn').disabled = false; }
}
async function doLogout() {
  try { await api('logout', {}); } catch (_) {}
  location.reload();
}

/* ---------- tabs ---------- */
const TABS = ['overview', 'log', 'syllabus', 'entries', 'setup'];
function showTab(name, pushHash) {
  if (!TABS.includes(name) || (name === 'setup' && state.role !== 'admin')) name = 'overview';
  state.tab = name;
  for (const t of TABS) { $('view-' + t).hidden = t !== name; $('tabbtn-' + t).setAttribute('aria-selected', String(t === name)); }
  if (pushHash) { try { history.replaceState(null, '', '#' + name); } catch (_) {} }
}

/* ---------- wiring ---------- */
function wire() {
  document.addEventListener('click', ev => {
    const el = ev.target.closest('button'); if (!el) return;
    if (el.dataset.tab) showTab(el.dataset.tab, true);
    else if (el.dataset.goto) showTab(el.dataset.goto, true);
    else if (el.dataset.syl) {
      const [cls, subj] = el.dataset.syl.split('|');
      state.syl = { cls, subj }; $('sBoard').value = boardOf(cls); $('sClass').value = rawCls(cls); fillSubjectSelect($('sSubj'), cls, subj); renderSyllabus(); showTab('syllabus', true);
    }
    else if (el.dataset.rm) {
      if (state.saving) return;
      const p = state.pending.splice(Number(el.dataset.rm), 1)[0];
      if (p) { URL.revokeObjectURL(p.url); if (p.id) api('photo.discard', { id:p.id }).catch(() => {}); }
      renderStrip(); formMsg('formMsg', '');
    }
    else if (el.dataset.photo) openPhoto(el.dataset.photo, el.dataset.sid);
    else if (el.id === 'lbClose') closePhoto();
    else if (el.id === 'logoutBtn') doLogout();
    else if (el.id === 'pwOpen') openPw(false);
    else if (el.id === 'pwCancel') { if ($('pwForm').dataset.forced) doLogout(); else show('app'); }
    else if (el.id === 'cancelEdit') { endEdit(); formMsg('formMsg', ''); showTab('entries', true); }
    else if (el.dataset.edit) startEdit(el.dataset.edit);
    else if (el.dataset.del) { state.confirmDel = el.dataset.del; renderEntries(); }
    else if (el.dataset.delNo) { state.confirmDel = null; renderEntries(); }
    else if (el.dataset.delYes) {
      const gone = state.sessions.find(s => s.key === el.dataset.delYes);
      state.confirmDel = null; el.disabled = true;
      if (!gone || !canModify(gone)) { renderEntries(); return; }
      if (state.editing && state.editing.key === gone.key) endEdit();
      api('entry.delete', { id:gone.id }).then(async () => { await refresh(); toast('Entry deleted'); }, e => { if (e && e.code === 'auth') session(); else { toast('Could not delete the entry'); renderEntries(); } });
    }
    else if (state.role === 'admin') setupClick(el);
  });
  const sylPick = () => { state.syl.cls = classKey($('sBoard').value, $('sClass').value); state.syl.subj = fillSubjectSelect($('sSubj'), state.syl.cls, state.syl.subj); renderSyllabus(); };
  $('sBoard').addEventListener('change', sylPick);
  $('sClass').addEventListener('change', sylPick);
  $('sSubj').addEventListener('change', () => { state.syl.subj = $('sSubj').value; renderSyllabus(); });
  $('oBoard').addEventListener('change', () => { state.ovBoard = $('oBoard').value; renderOverview(); });
  $('eBoard').addEventListener('change', () => { state.filt.board = $('eBoard').value; renderEntries(); });
  $('eClass').addEventListener('change', () => { state.filt.cls = $('eClass').value; renderEntries(); });
  $('eSubj').addEventListener('change', () => { state.filt.subj = $('eSubj').value; renderEntries(); });
  $('eTeacher').addEventListener('change', () => { state.filt.teacher = $('eTeacher').value; renderEntries(); });
  const formPick = () => { refreshFormSelects(); fillDatalists(); autoTotal(); };
  $('fBoard').addEventListener('change', formPick);
  $('fClass').addEventListener('change', formPick);
  $('fSubj').addEventListener('change', () => { fillPracticals(); fillDatalists(); });
  $('fSec').addEventListener('change', autoTotal);
  $('fTotal').addEventListener('input', () => { state.totalAuto = false; });
  $('fPractical').addEventListener('change', () => { $('otherWrap').hidden = $('fPractical').value !== 'other'; });
  $('logForm').addEventListener('submit', saveEntry);
  $('fPhotos').addEventListener('change', () => { addPhotos([...$('fPhotos').files]); $('fPhotos').value = ''; });
  $('lightbox').addEventListener('click', ev => { if (ev.target === $('lightbox')) closePhoto(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('lightbox').hidden) closePhoto(); });
  // A photo that is gone from the server: drop its tile instead of showing a broken image.
  document.addEventListener('error', ev => {
    const t = ev.target;
    if (t && t.tagName === 'IMG') { const b = t.closest('[data-photo]'); if (b) b.classList.add('gone'); }
  }, true);
  $('loginForm').addEventListener('submit', doLogin);
  $('pwForm').addEventListener('submit', doPassword);
  $('newTeacherForm').addEventListener('submit', createTeacher);
  $('setupForm').addEventListener('input', () => { state.sectionsDirty = true; });
  $('setupForm').addEventListener('submit', saveSections);
  $('tEditor').addEventListener('input', ev => {
    const i = ev.target.dataset && ev.target.dataset.tname;
    if (i != null && state.tdraft[i]) { state.tdraft[i].name = ev.target.value; state.tdirty[i] = true; formMsg('tm-' + i, 'Not saved yet.'); }
  });
  $('tEditor').addEventListener('change', ev => {
    const i = ev.target.dataset && ev.target.dataset.ac;
    if (i != null) $('as-' + i).innerHTML = subjOptions(ev.target.value, $('as-' + i).value);
  });
}

function boot() {
  $('fDate').value = todayStr(); $('fDate').max = todayStr();
  fillSubjectSelect($('sSubj'), state.syl.cls, state.syl.subj);
  renderStrip();
  wire();
  let h = ''; try { h = (location.hash || '').replace('#', ''); } catch (_) {}
  state.tab = TABS.includes(h) ? h : 'overview';
  session().then(() => showTab(state.tab, false));
}
boot();
})();
