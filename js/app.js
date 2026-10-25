import * as db from './db.js';
import * as sync from './sync.js';
import { TRIP, KINDS, CATEGORIES, BUS_CATEGORIES, PLAN_VERSION, OLD_PLAN_IDS, SEED_STOPS, SEED_EXPENSES } from './seed.js';
import { makeSortable } from './sortable.js';

const state = {
  view: 'stops', stops: [], expenses: [], photos: [],
  expCity: 'All', photoCity: 'All', device: '', cloud: null, lastSync: null,
};
const photoUrls = new Map();

// ---------- helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const live = (arr) => arr.filter((r) => !r.deleted);
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const km = (n) => Number(n).toLocaleString('en-IN') + ' km';
const dayLabel = (d) => d ? new Date(d + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date';
const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const nowTime = () => new Date().toTimeString().slice(0, 5);
const timeAgo = (t) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (m < 1440) return Math.round(m / 60) + ' h ago';
  return new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

const sortedStops = () => live(state.stops).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order);

function tripDays() {
  const days = new Set(TRIP.days);
  for (const s of live(state.stops)) if (s.date) days.add(s.date);
  return [...days].sort();
}

// "Day 3 · Mon, 9 Nov" for trip days; just the date for any other day (e.g. an advance paid earlier).
function dayTitle(d) {
  const n = TRIP.days.indexOf(d);
  return n >= 0 ? `Day ${n + 1} · ${dayLabel(d)}` : dayLabel(d);
}

const telHref = (n) => 'tel:' + String(n || '').replace(/[^\d+]/g, '');
const PHONE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';

const isBus = (e) => BUS_CATEGORIES.includes(e.category);

// Cities in the order the trip reaches them, then any others.
function cities() {
  const list = [];
  for (const s of sortedStops()) if (s.city && !list.includes(s.city)) list.push(s.city);
  for (const r of [...live(state.expenses), ...live(state.photos)]) if (r.city && !list.includes(r.city)) list.push(r.city);
  return list;
}

// Where the bus is now: the last stop with a km reading, else the first stop today.
function currentCity() {
  const stops = sortedStops();
  const withKm = stops.filter((s) => s.km != null);
  if (withKm.length) return withKm[withKm.length - 1].city;
  const today = stops.find((s) => s.date === todayIso());
  return today ? today.city : (stops[0]?.city || '');
}

function lastReading(beforeId) {
  let last = null;
  for (const s of sortedStops()) {
    if (s.id === beforeId) break;
    if (s.km != null) last = s;
  }
  return last;
}

// ---------- data ----------
async function load() {
  [state.stops, state.expenses, state.photos] = await Promise.all(['stops', 'expenses', 'photos'].map(db.getAll));
}

async function refresh() { await load(); render(); }

// ---------- dialog form ----------
function field(f) {
  const id = 'f-' + f.name;
  const req = f.required ? 'required' : '';
  let input;
  if (f.type === 'select' || f.type === 'city' || f.type === 'day') {
    // Card picker: shows the chosen value; tap it to open a grid of cards.
    let opts = (f.options || []).map((o) => (Array.isArray(o) ? o : [o, o]));
    if (f.type === 'city') opts = [...new Set([...(f.value ? [f.value] : []), ...cities()])].map((c) => [c, c]);
    if (f.type === 'day') opts = [...new Set([...tripDays(), ...(f.value ? [f.value] : [])])].sort().map((d) => [d, dayLabel(d)]);
    const isNew = f.type === 'city' && !opts.length;
    const sel = isNew ? '__new' : String(f.value ?? opts[0]?.[0] ?? '');
    const selLabel = isNew ? '+ New city' : (opts.find(([v]) => String(v) === sel)?.[1] ?? sel);
    const cards = opts.map(([v, l]) =>
      `<button type="button" class="pick-card ${String(v) === sel ? 'on' : ''}" data-value="${esc(v)}">${esc(l)}</button>`).join('');
    const newCard = f.type === 'city' ? `<button type="button" class="pick-card new ${isNew ? 'on' : ''}" data-value="__new">+ New city</button>`
      : f.type === 'day' ? '<button type="button" class="pick-card new" data-value="__other">Other date</button>' : '';
    input = `<div class="picker">
      <input type="hidden" id="${id}" name="${f.name}" value="${esc(sel)}">
      <button type="button" class="picker-current" data-picker-toggle><span>${esc(selLabel)}</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="picker-cards" hidden>${cards}${newCard}</div>
      ${f.type === 'city' ? `<input name="${f.name}New" type="text" placeholder="Type the city name" autocomplete="off" class="city-new" ${isNew ? '' : 'hidden'}>` : ''}
      ${f.type === 'day' ? `<input name="${f.name}Other" type="date" class="city-new" hidden>` : ''}
    </div>`;
    return `<div class="field"><span>${esc(f.label)}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${f.name}" rows="3">${esc(f.value)}</textarea>`;
  } else {
    const list = f.list ? `list="${id}-list"` : '';
    const dl = f.list ? `<datalist id="${id}-list">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value)}" ${list} ${req}
      ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="off">${dl}`;
    if (f.type === 'tel') {
      input = `<span class="tel-row">${input}<a class="call-btn" href="${esc(telHref(f.value))}" ${f.value ? '' : 'hidden'}>${PHONE_ICON}Call</a></span>`;
    }
  }
  const html = `<label class="field"><span>${esc(f.label)}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
  return f.stayOnly ? `<div class="stay-only" ${f.show ? '' : 'hidden'}>${html}</div>` : html;
}

function openForm({ title, fields, onSave, onDelete, saveLabel = 'Save' }) {
  const dlg = $('#sheet');
  dlg.innerHTML = `<form method="dialog" class="sheet-form">
    <h2>${esc(title)}</h2>
    ${fields.map(field).join('')}
    <div class="sheet-actions">
      ${onDelete ? '<button type="button" class="btn danger" data-act="delete">Delete</button>' : ''}
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-act="cancel">Cancel</button>
      <button type="submit" class="btn primary">${esc(saveLabel)}</button>
    </div></form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await onSave(data);
      dlg.close();
      await refresh();
    } catch (err) { toast(err.message); }
  });
  $('[data-act=cancel]', dlg).onclick = () => dlg.close();
  if (onDelete) {
    $('[data-act=delete]', dlg).onclick = async () => {
      if (!confirmInline(dlg)) return;
      await onDelete();
      dlg.close();
      await refresh();
    };
  }
  dlg.showModal();
  const first = $('input:not([type=hidden]), select, textarea', form);
  if (first && fields[0]?.autofocus !== false) setTimeout(() => first.focus(), 50);
}

// Two-tap delete instead of a browser confirm() popup.
function confirmInline(dlg) {
  const b = $('[data-act=delete]', dlg);
  if (b.dataset.armed) return true;
  b.dataset.armed = '1';
  b.textContent = 'Tap again to delete';
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000);
  return false;
}

function cityOf(d) {
  const c = (d.city === '__new' ? d.cityNew || '' : d.city || '').trim();
  if (!c) throw new Error('Pick a city or type a new one.');
  return c;
}

function dayOf(d) {
  const day = d.date === '__other' ? d.dateOther || '' : d.date || '';
  if (!day) throw new Error('Pick a day or choose a date.');
  return day;
}

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

// ---------- stops ----------
function stopForm(stop) {
  const isNew = !stop;
  const s = stop || { date: tripDays().includes(todayIso()) ? todayIso() : TRIP.days[0], city: currentCity(), kind: 'Visit' };
  const prev = lastReading(s.id);
  openForm({
    title: isNew ? 'Add stop' : 'Edit stop',
    fields: [
      { name: 'name', label: 'Stop name', value: s.name, required: true, placeholder: 'e.g. Rajwada, fuel pump, lunch' },
      { name: 'city', label: 'City', type: 'city', value: s.city },
      { name: 'date', label: 'Day', type: 'day', value: s.date },
      { name: 'kind', label: 'Type', type: 'select', value: s.kind, options: KINDS },
      { name: 'contact', label: 'Contact person', value: s.contact, stayOnly: true, show: s.kind === 'Stay' },
      { name: 'phone', label: 'Phone number', type: 'tel', inputmode: 'tel', value: s.phone, stayOnly: true, show: s.kind === 'Stay' },
      { name: 'km', label: 'Odometer reading (km)', type: 'number', inputmode: 'numeric', value: s.km ?? '',
        hint: prev ? `Last reading: ${km(prev.km)} at ${prev.name}` : 'No reading recorded yet' },
      { name: 'time', label: 'Time', type: 'time', value: s.time },
      { name: 'notes', label: 'Notes', type: 'textarea', value: s.notes },
    ],
    onSave: async (d) => {
      const date = dayOf(d);
      const rec = stop ? { ...stop } : { id: db.uid(), order: nextOrder(state.stops, (x) => x.date === date) };
      Object.assign(rec, { name: d.name.trim(), city: cityOf(d), date, kind: d.kind, notes: d.notes, time: d.time,
        contact: (d.contact || '').trim(), phone: (d.phone || '').trim() });
      rec.km = numOrNull(d.km);
      if (rec.km != null && !rec.time) rec.time = nowTime();
      checkReading(rec, prev);
      await db.save('stops', rec);
      toast(isNew ? 'Stop added' : 'Stop saved');
    },
    onDelete: stop ? () => db.softDelete('stops', { ...stop }) : null,
  });
}

function kmForm(stop) {
  const prev = lastReading(stop.id);
  openForm({
    title: `KM reading: ${stop.name}`,
    saveLabel: 'Record',
    fields: [
      { name: 'km', label: 'Odometer reading (km)', type: 'number', inputmode: 'numeric', value: stop.km ?? '', required: true,
        hint: prev ? `Last reading: ${km(prev.km)} at ${prev.name}` : 'This will be the first reading' },
      { name: 'time', label: 'Time', type: 'time', value: stop.time || nowTime() },
    ],
    onSave: async (d) => {
      const rec = { ...stop, km: Number(d.km), time: d.time || nowTime() };
      checkReading(rec, prev);
      await db.save('stops', rec);
      toast('Reading saved');
    },
  });
}

function checkReading(rec, prev) {
  if (rec.km != null && prev && rec.km < prev.km) {
    throw new Error(`Reading ${rec.km} is lower than the last one (${prev.km} at ${prev.name}). Check the number.`);
  }
}

function nextOrder(records, sameGroup) {
  const inGroup = live(records).filter(sameGroup);
  return inGroup.length ? Math.max(...inGroup.map((r) => r.order || 0)) + 10 : 0;
}

function renderStops() {
  const stops = sortedStops();
  let prevKm = null;
  const gapById = {};
  for (const s of stops) {
    if (s.km != null) { if (prevKm != null) gapById[s.id] = s.km - prevKm; prevKm = s.km; }
  }
  const byDay = new Map(tripDays().map((d) => [d, []]));
  for (const s of stops) byDay.get(s.date || '')?.push(s) ?? byDay.set(s.date || '', [s]);

  let html = '<div class="list" id="stop-list">';
  for (const [day, list] of byDay) {
    const dayKm = dayDriven(list);
    html += `<div class="sortable-header" data-group="${esc(day)}">
      <span>${esc(dayTitle(day))}</span><span class="muted">${dayKm != null ? km(dayKm) : ''}</span></div>`;
    if (!list.length) html += '<div class="empty-day">Drag a stop here</div>';
    for (const s of list) {
      html += `<div class="card sortable-item kind-${esc(s.kind.toLowerCase())}" data-id="${esc(s.id)}">
        <div class="drag-handle" aria-label="Drag to reorder">⋮⋮</div>
        <div class="card-body" data-open-stop="${esc(s.id)}">
          <div class="card-title">${esc(s.name)}</div>
          <div class="card-sub"><span class="badge">${esc(s.kind)}</span> ${esc(s.city)}${s.plannedKm ? ` · plan ${s.plannedKm} km` : ''}</div>
          ${s.kind === 'Stay' && (s.contact || s.phone) ? `<div class="card-contact"><span>${esc(s.contact)}${s.contact && s.phone ? ' · ' : ''}${esc(s.phone || '')}</span>${s.phone ? `<a class="call-btn small" href="${esc(telHref(s.phone))}">${PHONE_ICON}Call</a>` : ''}</div>` : ''}
          ${s.notes ? `<div class="card-note">${esc(s.notes)}</div>` : ''}
        </div>
        <button class="km-btn ${s.km != null ? 'has' : ''}" data-km="${esc(s.id)}">
          ${s.km != null ? `<b>${Number(s.km).toLocaleString('en-IN')}</b><small>${esc(s.time || '')}${gapById[s.id] != null ? ` · +${gapById[s.id]}` : ''}</small>` : '<b>+ KM</b><small>record</small>'}
        </button>
      </div>`;
    }
  }
  html += '</div>';
  return html;
}

function dayDriven(list) {
  const r = list.filter((s) => s.km != null).map((s) => s.km);
  return r.length >= 2 ? Math.max(...r) - Math.min(...r) : null;
}

async function onStopsReordered(order) {
  const byId = new Map(state.stops.map((s) => [s.id, s]));
  const changed = [];
  const perDay = {};
  for (const { id, group } of order) {
    const s = byId.get(id);
    const idx = (perDay[group] = (perDay[group] ?? -1) + 1);
    if (s.date !== group || s.order !== idx * 10) changed.push({ ...s, date: group, order: idx * 10 });
  }
  await db.saveMany('stops', changed);
  await refresh();
}

// ---------- expenses ----------
function payers() {
  const set = new Set([state.device].filter(Boolean));
  for (const e of live(state.expenses)) if (e.paidBy) set.add(e.paidBy);
  return [...set];
}

function expenseForm(exp) {
  const isNew = !exp;
  const e = exp || {
    date: tripDays().includes(todayIso()) ? todayIso() : TRIP.days[0],
    city: !['All', 'Bus'].includes(state.expCity) ? state.expCity : currentCity(),
    category: state.expCity === 'Bus' ? 'Fuel' : 'Food', paidBy: state.device,
  };
  openForm({
    title: isNew ? 'Add expense' : 'Edit expense',
    fields: [
      { name: 'amount', label: 'Amount (₹)', type: 'number', inputmode: 'decimal', step: '0.01', value: e.amount ?? '', required: true },
      { name: 'category', label: 'Category', type: 'select', value: e.category, options: CATEGORIES },
      { name: 'city', label: 'City', type: 'city', value: e.city },
      { name: 'date', label: 'Date', type: 'day', value: e.date, hint: 'Paid before or after the trip? Choose Other date.' },
      { name: 'paidBy', label: 'Paid by', value: e.paidBy, list: payers() },
      { name: 'note', label: 'Note', value: e.note, placeholder: 'e.g. diesel full tank, lunch thali' },
    ],
    onSave: async (d) => {
      const amount = Number(d.amount);
      if (!(amount > 0)) throw new Error('Enter an amount above zero.');
      const city = cityOf(d);
      const rec = exp ? { ...exp } : { id: db.uid(), order: nextOrder(state.expenses, (x) => x.city === city) };
      Object.assign(rec, { amount, category: d.category, city, date: dayOf(d), paidBy: d.paidBy.trim(), note: d.note.trim() });
      await db.save('expenses', rec);
      toast(isNew ? `${inr(amount)} added` : 'Expense saved');
    },
    onDelete: exp ? () => db.softDelete('expenses', { ...exp }) : null,
  });
}

function chips(all, active, attr) {
  return `<div class="chips">${['All', ...all].map((c) =>
    `<button class="chip ${c === active ? 'on' : ''}" ${attr}="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
}

function expenseCard(e, draggable) {
  return `<div class="card ${draggable ? 'sortable-item' : ''}" data-id="${esc(e.id)}">
    ${draggable ? '<div class="drag-handle" aria-label="Drag to reorder">⋮⋮</div>' : '<div class="no-handle"></div>'}
    <div class="card-body" data-open-exp="${esc(e.id)}">
      <div class="card-title">${esc(e.note || e.category)}</div>
      <div class="card-sub"><span class="badge cat ${isBus(e) ? 'bus' : ''}">${esc(e.category)}</span> ${esc(dayLabel(e.date))}${draggable ? '' : ' · ' + esc(e.city)}${e.paidBy ? ' · ' + esc(e.paidBy) : ''}</div>
    </div>
    <div class="amount">${inr(e.amount)}</div>
  </div>`;
}

const sum = (list) => list.reduce((a, e) => a + Number(e.amount || 0), 0);

function renderExpenses() {
  const exps = live(state.expenses);
  const bus = exps.filter(isBus);
  const cityList = cities().filter((c) => exps.some((e) => e.city === c));
  if (state.expCity !== 'All' && state.expCity !== 'Bus' && !cityList.includes(state.expCity)) state.expCity = 'All';
  let html = `<div class="total-bar"><span>Total spent</span><b>${inr(sum(exps))}</b></div>`;
  const busParts = BUS_CATEGORIES.map((c) => [c, sum(bus.filter((e) => e.category === c))]).filter(([, v]) => v);
  html += `<button class="bus-bar ${state.expCity === 'Bus' ? 'on' : ''}" data-exp-city="Bus">
    <span class="bus-top"><span>Bus</span><b>${inr(sum(bus))}</b></span>
    <span class="bus-parts">${busParts.length ? busParts.map(([c, v]) => `${esc(c === 'Fuel' ? c : c.replace('Bus ', '').replace(/^./, (x) => x.toUpperCase()))} ${inr(v)}`).join(' · ') : 'Fuel, advance, toll and parking show here'}</span>
  </button>`;
  html += `<div class="chips">${['All', 'Bus', ...cityList].map((c) =>
    `<button class="chip ${c === state.expCity ? 'on' : ''} ${c === 'Bus' ? 'bus' : ''}" data-exp-city="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;

  if (state.expCity === 'Bus') {
    // Bus view: grouped by category, oldest first. Not draggable, since the groups are categories, not cities.
    html += '<div class="list">';
    for (const c of BUS_CATEGORIES) {
      const list = bus.filter((e) => e.category === c).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt);
      if (!list.length) continue;
      html += `<div class="sortable-header"><span>${esc(c)}</span><span>${inr(sum(list))}</span></div>`;
      html += list.map((e) => expenseCard(e, false)).join('');
    }
    if (!bus.length) html += '<p class="empty">No bus expenses yet. Tap + to add fuel, toll, parking or an advance.</p>';
    return html + '</div>';
  }

  const shown = state.expCity === 'All' ? cityList : [state.expCity];
  html += '<div class="list" id="exp-list">';
  for (const city of shown) {
    const list = exps.filter((e) => e.city === city).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    html += `<div class="sortable-header" data-group="${esc(city)}"><span>${esc(city)}</span><span>${inr(sum(list))}</span></div>`;
    html += list.map((e) => expenseCard(e, true)).join('');
  }
  if (!exps.length) html += '<p class="empty">No expenses yet. Tap + to add one.</p>';
  html += '</div>';
  if (state.expCity === 'All' && cityList.length > 1) html += '<p class="hint">Drag an expense under another city to move it there.</p>';
  return html;
}

async function onExpensesReordered(order) {
  const byId = new Map(state.expenses.map((e) => [e.id, e]));
  const changed = [];
  const perCity = {};
  for (const { id, group } of order) {
    const e = byId.get(id);
    const idx = (perCity[group] = (perCity[group] ?? -1) + 1);
    if (e.city !== group || e.order !== idx * 10) changed.push({ ...e, city: group, order: idx * 10 });
  }
  await db.saveMany('expenses', changed);
  await refresh();
}

// ---------- photos ----------
async function compress(file, maxSide, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}

async function addPhotos(files) {
  const city = state.photoCity !== 'All' ? state.photoCity : currentCity();
  toast(`Saving ${files.length} photo(s) to ${city}…`, 10000);
  for (const file of files) {
    const [blob, thumb] = await Promise.all([compress(file, 1600, 0.82), compress(file, 360, 0.7)]);
    await db.save('photos', { id: db.uid(), city, caption: '', takenAt: file.lastModified || Date.now(), blob, thumb, name: file.name });
  }
  toast(`${files.length} photo(s) saved to ${city}`);
  await refresh();
}

function urlFor(p, kind = 'thumb') {
  const key = p.id + kind + p.updatedAt;
  if (!photoUrls.has(key)) photoUrls.set(key, URL.createObjectURL(p[kind] || p.blob));
  return photoUrls.get(key);
}

function renderPhotos() {
  const photos = live(state.photos);
  const cityList = cities().filter((c) => photos.some((p) => p.city === c));
  const shown = state.photoCity === 'All' ? cityList : [state.photoCity];
  let html = chips(cityList, state.photoCity, 'data-photo-city');
  for (const city of shown) {
    const list = photos.filter((p) => p.city === city).sort((a, b) => a.takenAt - b.takenAt);
    if (!list.length) continue;
    html += `<div class="section-head"><span>${esc(city)} · ${list.length}</span>
      <button class="link" data-share-city="${esc(city)}">Share</button></div><div class="grid">`;
    for (const p of list) html += `<img src="${urlFor(p)}" alt="${esc(p.caption || city)}" data-open-photo="${esc(p.id)}" loading="lazy">`;
    html += '</div>';
  }
  if (!photos.length) html += '<p class="empty">No photos yet. Tap + to take or pick photos. They are filed under the current city.</p>';
  html += '<p class="hint">Photos stay on this phone and are not synced. Use Share to send a city\'s photos to the family group.</p>';
  return html;
}

function photoView(p) {
  const dlg = $('#sheet');
  dlg.innerHTML = `<form method="dialog" class="sheet-form photo-view">
    <img src="${urlFor(p, 'blob')}" alt="">
    ${field({ name: 'city', label: 'City', type: 'city', value: p.city })}
    ${field({ name: 'caption', label: 'Caption', value: p.caption })}
    <div class="sheet-actions">
      <button type="button" class="btn danger" data-act="delete">Delete</button>
      <button type="button" class="btn ghost" data-act="share">Share</button>
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-act="cancel">Close</button>
      <button type="submit" class="btn primary">Save</button>
    </div></form>`;
  const form = $('form', dlg);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    await db.save('photos', { ...p, city: cityOf(d), caption: d.caption.trim() });
    dlg.close(); await refresh();
  };
  $('[data-act=cancel]', dlg).onclick = () => dlg.close();
  $('[data-act=share]', dlg).onclick = () => shareFiles([new File([p.blob], `${p.city}-${p.id.slice(0, 6)}.jpg`, { type: 'image/jpeg' })], p.caption || p.city);
  $('[data-act=delete]', dlg).onclick = async () => {
    if (!confirmInline(dlg)) return;
    await db.hardDelete('photos', p.id);
    dlg.close(); await refresh();
  };
  dlg.showModal();
}

async function shareFiles(files, title) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title }); } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
    return true;
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  toast('Saved to Downloads');
  return false;
}

// ---------- summary ----------
function table(head, rows) {
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function groupSum(list, key) {
  const m = new Map();
  for (const e of list) m.set(e[key] || 'Not set', (m.get(e[key] || 'Not set') || 0) + Number(e.amount || 0));
  return [...m].sort((a, b) => b[1] - a[1]);
}

function renderSummary() {
  const stops = sortedStops();
  const readings = stops.filter((s) => s.km != null);
  const totalKm = readings.length >= 2 ? readings[readings.length - 1].km - readings[0].km : 0;
  const planned = stops.reduce((a, s) => a + Number(s.plannedKm || 0), 0);
  const dayRows = tripDays().map((d) => {
    const list = stops.filter((s) => s.date === d);
    const r = list.filter((s) => s.km != null);
    const plan = list.reduce((a, s) => a + Number(s.plannedKm || 0), 0);
    return [esc(dayTitle(d)), r.length ? r[0].km : '', r.length ? r[r.length - 1].km : '',
      dayDriven(list) ?? '', plan || ''];
  });
  const exps = live(state.expenses);
  const total = exps.reduce((a, e) => a + Number(e.amount || 0), 0);
  const cityOrder = cities();
  const byCity = groupSum(exps, 'city').sort((a, b) => cityOrder.indexOf(a[0]) - cityOrder.indexOf(b[0]));
  return `
    <div class="stats">
      <div><small>Driven</small><b>${km(totalKm)}</b></div>
      <div><small>Planned</small><b>${km(planned)}</b></div>
      <div><small>Spent</small><b>${inr(total)}</b></div>
    </div>
    <h3>Kilometres by day</h3>
    ${table(['Day', 'Start', 'End', 'Driven', 'Plan'], dayRows)}
    <h3>Expenses by city</h3>
    ${table(['City', 'Amount'], byCity.map(([c, v]) => [esc(c), inr(v)]))}
    <h3>Bus</h3>
    ${table(['Bus expense', 'Amount'], [
      ...BUS_CATEGORIES.map((c) => [c, sum(exps.filter((e) => e.category === c))]).filter(([, v]) => v).map(([c, v]) => [esc(c), inr(v)]),
      ['<b>Bus total</b>', `<b>${inr(sum(exps.filter(isBus)))}</b>`],
    ])}
    <h3>Expenses by category</h3>
    ${table(['Category', 'Amount'], groupSum(exps, 'category').map(([c, v]) => [esc(c), inr(v)]))}
    <h3>Paid by</h3>
    ${table(['Person', 'Amount'], groupSum(exps, 'paidBy').map(([c, v]) => [esc(c), inr(v)]))}
    <div class="btn-row">
      <button class="btn" data-export="expenses">Export expenses (CSV)</button>
      <button class="btn" data-export="stops">Export km log (CSV)</button>
    </div>`;
}

function csv(rows) {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

function exportCsv(kind) {
  let rows;
  if (kind === 'expenses') {
    rows = [['Date', 'City', 'Category', 'Bus', 'Amount', 'Paid by', 'Note'],
      ...live(state.expenses).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
        .map((e) => [e.date, e.city, e.category, isBus(e) ? 'Yes' : '', e.amount, e.paidBy, e.note])];
  } else {
    rows = [['Date', 'Stop', 'City', 'Type', 'KM reading', 'Time', 'Planned km', 'Contact', 'Phone', 'Notes'],
      ...sortedStops().map((s) => [s.date, s.name, s.city, s.kind, s.km ?? '', s.time, s.plannedKm ?? '', s.contact || '', s.phone || '', s.notes])];
  }
  const file = new File(['﻿' + csv(rows)], `yatra-${kind}.csv`, { type: 'text/csv' });
  shareFiles([file], `Yatra ${kind}`);
}

// ---------- sync ----------
function renderSync() {
  const c = state.cloud || {};
  const configured = c.url && c.key && c.trip;
  return `
    <section class="panel">
      <h3>This phone</h3>
      <p>Entries from this phone are marked <b>${esc(state.device || 'not set')}</b>.</p>
      <button class="btn" data-act="rename">Change name</button>
    </section>
    <section class="panel">
      <h3>Cloud sync</h3>
      <p class="muted">Syncs by itself whenever there is internet: when the app opens, a few seconds after each change, and every 5 minutes. A yellow dot on the sync button means changes are waiting to go up.</p>
      <p class="muted">Last synced: ${esc(timeAgo(state.lastSync))}${navigator.onLine ? '' : ' · you are offline'}</p>
      <button class="btn primary big" data-act="cloud-sync" ${configured ? '' : 'disabled'}>Sync now</button>
      ${configured ? '' : '<p class="hint">Add the Supabase details below once, on each phone.</p>'}
      <details ${configured ? '' : 'open'}>
        <summary>Supabase settings</summary>
        <form id="cloud-form">
          ${field({ name: 'url', label: 'Project URL', value: c.url, placeholder: 'https://xxxx.supabase.co' })}
          ${field({ name: 'key', label: 'Anon key', value: c.key })}
          ${field({ name: 'trip', label: 'Trip code (same on all 4 phones)', value: c.trip || 'indore-2026' })}
          <button class="btn" type="submit">Save settings</button>
        </form>
      </details>
    </section>
    <section class="panel">
      <h3>Sync without internet setup</h3>
      <p class="muted">Share a sync file to WhatsApp, then open it on the other phone with Import. Both phones end up with the newest version of every entry.</p>
      <div class="btn-row">
        <button class="btn" data-act="share-sync">Share sync file</button>
        <label class="btn">Import sync file<input type="file" accept=".json,application/json" id="import-file" hidden></label>
      </div>
    </section>
    <p class="hint">Stops ${live(state.stops).length} · Expenses ${live(state.expenses).length} · Photos ${live(state.photos).length}</p>`;
}

// Manual sync (button) shows every result; automatic sync stays quiet unless updates arrive or it fails.
let syncing = null;
let autoTimer = null;

async function runCloudSync({ auto = false } = {}) {
  if (!state.cloud?.url) { if (!auto) { switchView('sync'); toast('Set up cloud sync first'); } return; }
  if (!navigator.onLine) { if (!auto) toast('No internet right now. Your entries are safe on this phone.'); return; }
  if (syncing) return syncing;
  const btn = $('#sync-btn');
  btn.classList.add('spin');
  syncing = (async () => {
    try {
      const r = await sync.cloudSync(state.cloud);
      state.lastSync = Date.now();
      state.pending = false;
      await db.setMeta('lastSync', state.lastSync);
      await db.setMeta('pending', false);
      const got = r.pulled.stops + r.pulled.expenses;
      if (!auto) toast(`Synced. ${got} update(s) received, ${r.pushed} sent.`);
      else if (got) toast(`${got} update(s) from other phones`);
      if (!document.querySelector('.dragging')) await refresh();
    } catch (e) {
      if (!auto || e.message.startsWith('Upload') || e.message.startsWith('Download')) toast(auto ? 'Auto sync failed, will retry. ' + e.message : e.message, 5000);
    } finally {
      btn.classList.remove('spin');
      markPending();
      syncing = null;
    }
  })();
  return syncing;
}

// Edits trigger a sync a few seconds later, so several quick edits go up together.
function scheduleAutoSync(delay = 4000) {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => runCloudSync({ auto: true }), delay);
}

function markPending() { $('#sync-btn').classList.toggle('pending', !!state.pending); }

async function onLocalEdit() {
  state.pending = true;
  markPending();
  await db.setMeta('pending', true);
  scheduleAutoSync();
}

function askName(force) {
  if (state.device && !force) return;
  openForm({
    title: 'Who uses this phone?',
    fields: [{ name: 'device', label: 'Your name', value: state.device, required: true, placeholder: 'e.g. Paras' }],
    onSave: async (d) => {
      state.device = d.device.trim();
      db.setDeviceName(state.device);
      await db.setMeta('device', state.device);
    },
  });
}

// ---------- shell ----------
const VIEWS = {
  stops: { title: 'Stops & KM', render: renderStops, fab: () => stopForm() },
  expenses: { title: 'Expenses', render: renderExpenses, fab: () => expenseForm() },
  photos: { title: 'Photos', render: renderPhotos, fab: () => $('#photo-input').click() },
  summary: { title: 'Summary', render: renderSummary },
  sync: { title: 'Sync', render: renderSync },
};

function switchView(v) {
  state.view = v;
  window.scrollTo(0, 0);
  render();
}

function render() {
  const v = VIEWS[state.view];
  $('#title').textContent = v.title;
  $('#main').innerHTML = v.render();
  $('#fab').hidden = !v.fab;
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.view === state.view);
  $('#net').classList.toggle('off', !navigator.onLine);
  const stopList = $('#stop-list');
  if (stopList) makeSortable(stopList, onStopsReordered);
  const expList = $('#exp-list');
  if (expList) makeSortable(expList, onExpensesReordered);
}

function bindEvents() {
  $('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) switchView(b.dataset.view);
  });
  $('#fab').onclick = () => VIEWS[state.view].fab?.();
  $('#sheet').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-picker-toggle]');
    const card = e.target.closest('.pick-card');
    if (!toggle && !card) return;
    const picker = (toggle || card).closest('.picker');
    const grid = $('.picker-cards', picker);
    if (toggle) {
      const opening = grid.hidden;
      for (const g of document.querySelectorAll('#sheet .picker-cards')) g.hidden = true;
      for (const t of document.querySelectorAll('#sheet [data-picker-toggle]')) t.classList.remove('open');
      grid.hidden = !opening;
      toggle.classList.toggle('open', opening);
      return;
    }
    $('input[type=hidden]', picker).value = card.dataset.value;
    $('[data-picker-toggle] span', picker).textContent = card.textContent;
    for (const c of grid.children) c.classList.toggle('on', c === card);
    grid.hidden = true;
    $('[data-picker-toggle]', picker).classList.remove('open');
    if ($('input[type=hidden]', picker).name === 'kind') {
      for (const el of document.querySelectorAll('#sheet .stay-only')) el.hidden = card.dataset.value !== 'Stay';
    }
    const box = $('.city-new', picker);
    if (box) {
      box.hidden = !['__new', '__other'].includes(card.dataset.value);
      if (!box.hidden) { box.focus(); if (box.type === 'date') try { box.showPicker(); } catch { /* not supported */ } }
    }
  });
  $('#sheet').addEventListener('input', (e) => {
    if (e.target.type !== 'tel') return;
    const btn = e.target.parentElement.querySelector('.call-btn');
    btn.href = telHref(e.target.value);
    btn.hidden = !e.target.value.trim();
  });
  $('#sync-btn').onclick = () => runCloudSync();
  $('#photo-input').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addPhotos(f); };

  $('#main').addEventListener('click', async (e) => {
    if (e.target.closest('a[href^="tel:"]')) return;
    const t = e.target.closest('[data-open-stop],[data-km],[data-open-exp],[data-exp-city],[data-photo-city],[data-open-photo],[data-share-city],[data-export],[data-act]');
    if (!t) return;
    const d = t.dataset;
    if (d.openStop) stopForm(state.stops.find((s) => s.id === d.openStop));
    else if (d.km) kmForm(state.stops.find((s) => s.id === d.km));
    else if (d.openExp) expenseForm(state.expenses.find((x) => x.id === d.openExp));
    else if (d.expCity) { state.expCity = d.expCity; render(); }
    else if (d.photoCity) { state.photoCity = d.photoCity; render(); }
    else if (d.openPhoto) photoView(state.photos.find((p) => p.id === d.openPhoto));
    else if (d.shareCity) {
      const files = live(state.photos).filter((p) => p.city === d.shareCity)
        .map((p, i) => new File([p.blob], `${d.shareCity}-${i + 1}.jpg`, { type: 'image/jpeg' }));
      shareFiles(files, `${d.shareCity} photos`);
    } else if (d.export) exportCsv(d.export);
    else if (d.act === 'rename') askName(true);
    else if (d.act === 'cloud-sync') runCloudSync();
    else if (d.act === 'share-sync') shareFiles([await sync.buildSyncFile(state.device)], 'Yatra sync file');
  });

  $('#main').addEventListener('change', async (e) => {
    if (e.target.id !== 'import-file' || !e.target.files[0]) return;
    try {
      const r = await sync.importSyncFile(e.target.files[0]);
      toast(`Imported from ${r.from || 'other phone'}: ${r.stops} stop and ${r.expenses} expense update(s).`, 4000);
      await refresh();
    } catch (err) { toast(err.message, 4000); }
    e.target.value = '';
  });

  $('#main').addEventListener('submit', async (e) => {
    if (e.target.id !== 'cloud-form') return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    state.cloud = { url: d.url.trim(), key: d.key.trim(), trip: d.trip.trim() };
    await db.setMeta('cloud', state.cloud);
    toast('Cloud settings saved');
    render();
  });

  addEventListener('online', () => { render(); scheduleAutoSync(1000); });
  addEventListener('offline', render);
}

async function init() {
  state.device = await db.getMeta('device', '');
  state.cloud = await db.getMeta('cloud', null);
  state.lastSync = await db.getMeta('lastSync', null);
  db.setDeviceName(state.device);
  const seeded = await db.getMeta('seeded', false);
  if (!seeded) await sync.merge('expenses', SEED_EXPENSES);
  if (seeded !== PLAN_VERSION) {
    // New plan: hide the old plan's stops that nobody edited. The tombstones carry the same fixed
    // time on every phone, so they agree with each other and win over the untouched originals.
    const old = await db.getAll('stops');
    const retire = old.filter((r) => OLD_PLAN_IDS.includes(r.id) && !r.deleted && r.updatedAt === 0)
      .map((r) => ({ ...r, deleted: true, updatedAt: 1 }));
    await db.putMany('stops', retire);
    await sync.merge('stops', SEED_STOPS);
    // An old stop someone already edited (e.g. a km reading) moves its reading onto the
    // matching new stop, so the plan doesn't show it twice.
    const fresh = new Map(SEED_STOPS.map((r) => [r.date + '|' + r.name, r.id]));
    for (const r of old.filter((x) => OLD_PLAN_IDS.includes(x.id) && !x.deleted && x.updatedAt > 0)) {
      const twin = fresh.get(r.date + '|' + r.name);
      if (!twin) continue;
      const target = await db.get('stops', twin);
      await db.save('stops', { ...target, km: r.km, time: r.time, notes: r.notes || target.notes });
      await db.softDelete('stops', { ...r });
    }
    await db.setMeta('seeded', PLAN_VERSION);
  }
  await load();
  bindEvents();
  render();
  askName(false);
  navigator.storage?.persist?.();
  // Automatic sync: on open, when the phone comes back online, after edits,
  // when the app comes back to the screen, and every 5 minutes while it is open.
  state.pending = await db.getMeta('pending', false);
  markPending();
  db.onLocalChange(onLocalEdit);
  scheduleAutoSync(1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleAutoSync(1000); });
  setInterval(() => runCloudSync({ auto: true }), 5 * 60 * 1000);
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('App updated. Close and reopen to use the new version.', 5000);
    });
  }
}

init();
