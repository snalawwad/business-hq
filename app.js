/* Business HQ · Ramadan drop
   Shared by both partners through Supabase. Prices, totals, the daily task feed
   and the activity log are all handled by the database (supabase/schema.sql).
   Demo mode (no Supabase details in config.js) runs everything in this browser. */
(function () {
  'use strict';
  const CFG = window.TRACKER_CONFIG || {};
  const DEMO = !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('YOUR-PROJECT') || !window.supabase;
  const RAMADAN = '2027-02-08';
  const CHANNELS = ['Exhibition', 'Instagram', 'WhatsApp', 'Referral', 'B2B'];
  const STATUSES = ['New', 'Deposit paid', 'In production', 'Embroidery', 'Quality check', 'Out for delivery', 'Delivered', 'Cancelled'];
  const EXPO_ST = ['Researching', 'Applied', 'Accepted', 'Paid', 'Done', 'Rejected'];
  const SUP_TYPES = ['Tailor', 'Fabric', 'Embroidery', 'Labels & packaging', 'Photographer', 'Exhibition organizer', 'Delivery', 'Other'];
  const POST_TYPES = { announce: ['Announcement', '#6E1F18'], product: ['Product', '#4B4A2B'], detail: ['Detail', '#4A2C24'], quote: ['Quote', '#16100E'], bts: ['Behind the scenes', '#A6814A'], offer: ['Offer', '#6E1F18'] };
  const NAV = [
    ['Your day', [['today', 'Today'], ['team', 'Team activity'], ['plan', 'Launch plan']]],
    ['Money', [['money', 'Overview'], ['expenses', 'Expenses'], ['orders', 'Orders'], ['pricing', 'Pricing']]],
    ['Product', [['drop', 'Ramadan drop'], ['brand', 'Brand'], ['instagram', 'Instagram']]],
    ['Selling', [['expos', 'Exhibitions'], ['suppliers', 'Suppliers'], ['settings', 'Settings']]]
  ];
  const PAGES = NAV.flatMap(g => g[1].map(p => p[0]));

  const $app = document.getElementById('app');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const kd = v => { const n = num(v); if (!n) return '—'; return 'KD ' + n.toLocaleString('en-US', { maximumFractionDigits: 3 }); };
  const pct = v => num(v) ? Math.round(num(v) * 100) + '%' : '—';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d => d ? `${MON[Number(String(d).slice(5, 7)) - 1]} ${Number(String(d).slice(8, 10))}` : '';
  const kwDate = (dt = new Date()) => dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
  const today = () => kwDate();
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const ago = iso => { if (!iso) return ''; const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = kwDate(new Date(iso)); return day(d); };
  const opt = (arr, sel) => arr.map(v => Array.isArray(v) ? `<option value="${esc(v[0])}"${String(v[0]) === String(sel == null ? '' : sel) ? ' selected' : ''}>${esc(v[1])}</option>` : `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
  function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2400); }

  const S = { page: PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today', me: null, live: false, d: null, busy: false, ef: {}, of: {}, ui: { drop: 0, ig: 'grid', post: 1, feed: 'all' }, lastOpen: null };

  /* ============================ Supabase ============================ */
  let sb = null;
  const Remote = {
    async load() {
      const pull = await sb.rpc('pull_tasks');
      if (pull.error && /not a member/i.test(pull.error.message || '')) throw { code: 'not_member' };
      const q = (t, ord, asc = true) => { let r = sb.from(t).select('*'); if (ord) r = r.order(ord, { ascending: asc }); return r; };
      const res = await Promise.all([
        sb.from('settings').select('*').eq('id', 1).maybeSingle(), q('styles', 'sort'), q('categories', 'sort'), q('members'), q('phases', 'sort'), q('tasks', 'sort'),
        q('expenses', 'spent_on', false), q('v_style_pricing'), q('v_orders', 'ordered_on', false), sb.from('v_summary').select('*').maybeSingle(), q('v_spend_by_category'),
        q('expos', 'apply_by'), q('checklist', 'sort'), q('suppliers', 'created_at'), q('ig_posts', 'position'), sb.from('activity').select('*').order('at', { ascending: false }).limit(300)
      ]);
      const bad = res.find(r => r.error); if (bad) throw bad.error;
      if (!res[0].data) throw { code: 'not_member' };
      const [settings, styles, categories, members, phases, tasks, expenses, pricing, orders, summary, spend, expos, checklist, suppliers, posts, activity] = res.map(r => r.data);
      return { settings, styles, categories, members, phases, tasks, expenses, pricing, orders, summary, spend, expos, checklist, suppliers, posts, activity, todayList: pull.data || [] };
    },
    ins: (t, row) => sb.from(t).insert(row),
    upd: (t, id, patch) => sb.from(t).update(patch).eq('id', id),
    del: (t, id) => sb.from(t).delete().eq('id', id),
    override: (style_id, price) => price > 0 ? sb.from('price_overrides').upsert({ style_id, price, updated_at: new Date().toISOString() }) : sb.from('price_overrides').delete().eq('style_id', style_id),
    settings: p => sb.from('settings').update(Object.assign({}, p, { updated_at: new Date().toISOString(), updated_by: S.me })).eq('id', 1)
  };

  /* ============================ Demo (browser only) ============================ */
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const SEED = {
    styles: [['Daily Stripe Shirt set', 14], ['Tie Top set', 16], ['Side-Button Tunic set', 16], ['Wrap Top set', 18], ['Kimono Hosting set', 20]].map((s, i) => ({ id: i + 1, name: s[0], target_price: s[1], sort: i + 1, active: true })),
    categories: [['Fabric', 'per_set'], ['Sewing', 'per_set'], ['Embroidery', 'per_set'], ['Trims & buttons', 'per_set'], ['Labels & packaging', 'per_set'], ['Delivery', 'per_set'], ['Samples', 'overhead'], ['Exhibition', 'overhead'], ['Booth display', 'overhead'], ['Photoshoot', 'overhead'], ['Licence & bank', 'overhead'], ['Marketing', 'overhead'], ['Other', 'overhead']].map((c, i) => ({ name: c[0], kind: c[1], sort: i })),
    phases: [['p1', 'Brand, licence & bank', '2026-10-26', '2026-11-22'], ['p2', 'Tailor quotes & samples', '2026-11-02', '2026-12-06'], ['p3', 'Exhibition applications', '2026-11-16', '2026-12-20'], ['p4', 'Photoshoot', '2026-12-07', '2026-12-13'], ['p5', 'Instagram launch', '2026-12-01', '2027-01-04'], ['p6', 'Production', '2026-12-21', '2027-01-24'], ['p7', 'Pre-orders', '2027-01-05', '2027-01-25'], ['p8', 'Exhibitions & sales', '2027-01-18', '2027-02-07'], ['p9', 'Ramadan', '2027-02-08', '2027-02-14']].map((p, i) => ({ id: p[0], name: p[1], starts: p[2], ends: p[3], sort: i + 1 })),
    tasks: { p1: ['Pick the final brand name', 'Reserve the Instagram and TikTok handles', 'Ask MOCI which licence fits clothing sales', 'Apply for the licence', 'Open a business bank account', 'Get bank approval for online payments', 'Set up a payment link provider'], p2: ['Shortlist 3 tailors and 1 embroidery shop', 'Send the Ramadan drop specs to each tailor', 'Get quotes at 20, 50 and 100 sets', 'Buy fabric swatches in cream, sand and taupe', 'Wash-test the swatches 5 times at 40°C', 'Order one sample of each set in size M', 'Fit the samples on a real household worker', 'Approve final changes with the tailor', 'Digitize the logo for embroidery'], p3: ['List Ramadan exhibitions and their deadlines', 'Write the bilingual brand blurb', 'Prepare 5–8 real product photos', 'Send the exhibition applications'], p4: ['Book a photographer and models', 'Shoot front, back and side of each set', 'Shoot in-use scenes: serving, carrying, iftar table', 'Shoot close-ups: piping, embroidery, fabric'], p5: ['Set up profile picture, bio and highlight covers', 'Post the first 3 teaser posts', 'Run a colour poll in stories', 'Post the full 9-post grid'], p6: ['Book tailor capacity in writing', 'Order the first stock', 'Order labels, hang tags and packaging', 'Quality-check every piece', 'Pack sets with tags and thank-you cards'], p7: ['Open pre-orders with the early-bird offer', 'Announce the last order date', 'Confirm every deposit in Orders'], p8: ['Pack the booth kit', 'Collect WhatsApp numbers at the booth', 'Follow up every booth contact within 48 hours'], p9: ['Deliver the last orders', 'Share customer photos from iftars', 'Send restock alerts for what sold out'] },
    checklist: [['booth', 'Clothing rail and hangers'], ['booth', 'Mannequin in the Tie Top set'], ['booth', 'Full size run and a mirror'], ['booth', 'Swatch and embroidery board'], ['booth', 'Price and pack-offer sign (AR/EN)'], ['booth', 'Order forms, tape measure, size chart'], ['booth', 'Card machine or payment QR'], ['booth', 'Instagram and WhatsApp QR'], ['booth', 'Lantern and tray props'], ['ig_weeks', 'Week 1 · Tease', 'Profile, bio, highlights · 3 teaser posts · colour poll'], ['ig_weeks', 'Week 2 · Reveal', 'Lookbook carousel · 2 reels of the sets in use · size guide highlight'], ['ig_weeks', 'Week 3 · Pre-orders', 'Early-bird post · countdown sticker · first customer story'], ['ig_weeks', 'Week 4 · Exhibition', 'Booth location post · daily booth stories · try-on reel'], ['ig_weeks', 'Ramadan · Proof', 'Customer photos · thank-you posts · restock alerts']],
    posts: [['announce', 'Coming this Ramadan: uniforms your household team will love wearing.'], ['product', 'The Tie Top set: mandarin collar, gold piping, straight pants.'], ['detail', 'Gold piping on every collar and cuff.'], ['bts', 'At the tailor: first samples, first fittings.'], ['quote', 'Hospitality is the first gift you give a guest.'], ['product', 'The Kimono Hosting set, for iftar and ghabga nights.'], ['detail', 'Your family initials, embroidered.'], ['offer', 'Household packs of 3, embroidery included.'], ['announce', 'Pre-orders open. Last order date in stories.']]
  };
  function demoFresh() {
    const t = []; Object.entries(SEED.tasks).forEach(([ph, list]) => list.forEach((title, i) => t.push({ id: uid(), phase_id: ph, title, details: '', sort: i + 1, owner: null, assigned_to: null, scheduled_for: null, snoozed_until: null, rolled_over: 0, done: false, done_by: null, done_at: null, created_at: new Date().toISOString() })));
    return {
      settings: { id: 1, budget: 1500, multiplier: 2.5, round_to: 1, pack_size: 3, pack_discount: 0.1, planned_sets: 100, include_overheads: true, target_min: 14, target_max: 20, tasks_per_day: 3, brand_name: 'Diyafa', brand_ar: 'ضيافة', ig_bio: 'Ramadan uniforms for your household team · Kuwait\nFamily embroidery · Household packs\nOrder on WhatsApp ↓', shortlist: {} },
      members: [{ email: 'you@demo', name: 'You' }, { email: 'partner@demo', name: 'Partner' }],
      tasks: t, expenses: [], orders: [], overrides: {}, expos: [], suppliers: [], activity: [],
      checklist: SEED.checklist.map((c, i) => ({ id: uid(), list: c[0], title: c[1], details: c[2] || '', sort: i, done: false })),
      posts: SEED.posts.map((p, i) => ({ id: uid(), position: i + 1, type: p[0], caption: p[1], post_date: null, status: 'Idea' }))
    };
  }
  const store = { get() { try { return JSON.parse(localStorage.getItem('rd-hq') || 'null'); } catch (_) { return null; } }, set(v) { try { localStorage.setItem('rd-hq', JSON.stringify(v)); } catch (_) { } } };
  const db0 = () => store.get() || demoFresh();
  function demoPull(db) {
    const me = S.me, d = today(), quota = db.settings.tasks_per_day || 3;
    db.tasks.forEach(t => { if (t.assigned_to === me && !t.done && t.scheduled_for && t.scheduled_for < d) { t.scheduled_for = d; t.rolled_over = (t.rolled_over || 0) + 1; } });
    if (!db.tasks.some(t => t.assigned_to === me && !t.done && t.scheduled_for === d)) {
      const ps = id => (SEED.phases.find(p => p.id === id) || { sort: 99 }).sort;
      db.tasks.filter(t => !t.done && !t.assigned_to && (!t.owner || t.owner === me) && (!t.snoozed_until || t.snoozed_until <= d))
        .sort((a, b) => ps(a.phase_id) - ps(b.phase_id) || a.sort - b.sort).slice(0, quota).forEach(t => { t.assigned_to = me; t.scheduled_for = d; });
    }
    return db.tasks.filter(t => t.assigned_to === me && t.scheduled_for === d && (!t.done || kwDate(new Date(t.done_at)) === d));
  }
  function logLocal(db, kind, action, title, detail) { db.activity.unshift({ id: uid(), at: new Date().toISOString(), actor: S.me, kind, action, title: title || '', detail: detail || '' }); }
  function compute(db) {
    const st = db.settings, cats = SEED.categories, ex = db.expenses, kind = n => (cats.find(c => c.name === n) || {}).kind;
    const avg = a => { const t = a.reduce((x, e) => x + num(e.amount), 0), s = a.reduce((x, e) => x + num(e.sets_covered), 0); return s ? t / s : 0; };
    const oh = ex.filter(e => kind(e.category) === 'overhead').reduce((a, e) => a + num(e.amount), 0);
    const ohPer = st.include_overheads && st.planned_sets > 0 ? oh / st.planned_sets : 0, r = num(st.round_to) || 1;
    const pricing = SEED.styles.map(s => {
      const breakdown = {}; let direct = 0;
      cats.filter(c => c.kind === 'per_set').forEach(c => { const v = avg(ex.filter(e => e.category === c.name && e.scope === 'style' && Number(e.style_id) === s.id && num(e.sets_covered) > 0)) + avg(ex.filter(e => e.category === c.name && e.scope === 'all_styles' && num(e.sets_covered) > 0)); breakdown[c.name] = v; direct += v; });
      const has = ex.some(e => kind(e.category) === 'per_set' && e.scope === 'style' && Number(e.style_id) === s.id && num(e.sets_covered) > 0);
      const full = direct + ohPer, sug = has && full > 0 ? Math.ceil(full * st.multiplier / r) * r : 0, ov = num(db.overrides[s.id]) || null, fp = ov || sug;
      return { style_id: s.id, name: s.name, sort: s.sort, target_price: s.target_price, breakdown, direct_cost: direct, overhead_per_set: ohPer, full_cost: full, suggested_price: sug, price_override: ov, final_price: fp, profit_per_set: fp ? fp - full : 0, margin: fp ? (fp - full) / fp : 0, pack_price: fp ? Math.ceil(fp * st.pack_size * (1 - st.pack_discount) / r) * r : 0, max_cost_for_target: s.target_price / (st.multiplier || 1), range_status: !fp ? 'no costs yet' : fp < st.target_min ? 'below range' : fp > st.target_max ? 'above range' : 'in range', has_costs: has };
    });
    const orders = db.orders.map(o => { const p = pricing.find(x => x.style_id === Number(o.style_id)) || { final_price: 0, full_cost: 0 }; const per = num(o.price_charged) || p.final_price, tot = per * o.qty * (1 - num(o.discount_pct) / 100); return Object.assign({}, o, { style_name: (SEED.styles.find(s => s.id === Number(o.style_id)) || {}).name, price_per_set: per, order_total: tot, balance_due: tot - num(o.deposit), cost_of_goods: p.full_cost * o.qty, profit: tot - p.full_cost * o.qty }); }).sort((a, b) => b.ordered_on.localeCompare(a.ordered_on));
    const live = orders.filter(o => o.status !== 'Cancelled'), sum = f => live.reduce((a, o) => a + num(o[f]), 0), spent = ex.reduce((a, e) => a + num(e.amount), 0), sets = sum('qty'), profit = sum('profit'), rev = sum('order_total');
    const summary = { budget: st.budget, spent, budget_left: st.budget - spent, budget_used: st.budget ? spent / st.budget : 0, revenue: rev, collected: sum('deposit'), owed: sum('balance_due'), profit, sets_sold: sets, orders: live.length, net_position: rev - spent, avg_profit_per_set: sets ? profit / sets : 0, sets_to_break_even: sets && profit > 0 ? Math.max(0, Math.ceil((spent - rev) / (profit / sets))) : null };
    const spend = cats.map(c => ({ category: c.name, kind: c.kind, spent: ex.filter(e => e.category === c.name).reduce((a, e) => a + num(e.amount), 0) })).sort((a, b) => b.spent - a.spent);
    return { pricing, orders, summary, spend };
  }
  const Local = {
    async load() {
      const db = db0(), todayList = demoPull(db); store.set(db);
      return Object.assign({ settings: db.settings, styles: SEED.styles, categories: SEED.categories, members: db.members, phases: SEED.phases, tasks: db.tasks, expenses: db.expenses.slice().sort((a, b) => b.spent_on.localeCompare(a.spent_on)), expos: db.expos, checklist: db.checklist, suppliers: db.suppliers, posts: db.posts.slice().sort((a, b) => a.position - b.position), activity: db.activity.slice(0, 300), todayList }, compute(db));
    },
    async ins(t, row) {
      const db = db0(), key = { ig_posts: 'posts' }[t] || t; const r = Object.assign({ id: uid(), created_by: S.me, created_at: new Date().toISOString() }, row);
      if (t === 'tasks') Object.assign(r, { done: false, rolled_over: 0, sort: r.sort || 100 });
      db[key].push(r);
      if (t === 'tasks') logLocal(db, 'task', 'added', r.title);
      if (t === 'expenses') logLocal(db, 'expense', 'added', r.item || r.category, 'KD ' + r.amount + ' · ' + r.category);
      if (t === 'orders') logLocal(db, 'order', 'added', r.customer, r.qty + ' set(s)');
      if (t === 'expos') logLocal(db, 'expo', 'added', r.name);
      if (t === 'suppliers') logLocal(db, 'supplier', 'added', r.name, r.type);
      store.set(db); return {};
    },
    async upd(t, id, p) {
      const db = db0(), key = { ig_posts: 'posts' }[t] || t; const r = db[key].find(x => x.id === id); if (!r) return {};
      const old = Object.assign({}, r); Object.assign(r, p);
      if (t === 'tasks') { if (r.done && !old.done) logLocal(db, 'task', 'completed', r.title); else if (!r.done && old.done) logLocal(db, 'task', 'reopened', r.title); else if (p.snoozed_until) logLocal(db, 'task', 'postponed', r.title); }
      if (t === 'orders' && p.status && p.status !== old.status) logLocal(db, 'order', 'moved', r.customer, old.status + ' → ' + p.status);
      if (t === 'checklist' && r.done && !old.done) logLocal(db, 'checklist', 'ticked', r.title);
      if (t === 'expos' && p.status && p.status !== old.status) logLocal(db, 'expo', 'moved', r.name, old.status + ' → ' + p.status);
      if (t === 'suppliers' && r.chosen && !old.chosen) logLocal(db, 'supplier', 'chose', r.name);
      store.set(db); return {};
    },
    async del(t, id) { const db = db0(), key = { ig_posts: 'posts' }[t] || t; const r = db[key].find(x => x.id === id); db[key] = db[key].filter(x => x.id !== id); if (r && t === 'tasks') logLocal(db, 'task', 'deleted', r.title); if (r && t === 'expenses') logLocal(db, 'expense', 'deleted', r.item || r.category, 'KD ' + r.amount); if (r && t === 'orders') logLocal(db, 'order', 'deleted', r.customer); store.set(db); return {}; },
    async override(sid, price) { const db = db0(); if (price > 0) db.overrides[sid] = price; else delete db.overrides[sid]; store.set(db); return {}; },
    async settings(p) { const db = db0(); Object.assign(db.settings, p); logLocal(db, 'setting', 'changed', 'Settings'); store.set(db); return {}; }
  };
  const API = DEMO ? Local : Remote;

  async function refresh(opts = {}) {
    try {
      const before = S.d ? S.d.todayList.filter(t => !t.done).length : null;
      const d = await API.load();
      S.d = d;
      const open = d.todayList.filter(t => !t.done).length;
      if (opts.afterTask && before === 0 && open > 0) toast('All done! ' + open + ' new tasks added for you.');
      const a = document.activeElement;
      if (a && a.closest && a.closest('.form') && !opts.force) S.dirty = true; else render();
    } catch (e) {
      if (e && e.code === 'not_member') { renderNotMember(); return; }
      console.error(e); toast('Could not load. Check your connection.');
    }
  }
  async function run(p, ok, opts) {
    if (S.busy) return; S.busy = true;
    try { const r = await p; if (r && r.error) throw r.error; if (ok) toast(ok); await refresh(Object.assign({ force: true }, opts)); }
    catch (e) { console.error(e); toast(e && e.message ? 'Not saved: ' + e.message : 'Not saved. Try again.'); }
    finally { S.busy = false; }
  }

  /* ============================ people ============================ */
  const nameOf = email => { if (!email) return 'Someone'; const m = (S.d.members || []).find(x => (x.email || '').toLowerCase() === String(email).toLowerCase()); return (m && m.name) || String(email).split('@')[0]; };
  const isMe = email => email && S.me && String(email).toLowerCase() === S.me.toLowerCase();
  const others = () => (S.d.members || []).filter(m => !isMe(m.email));
  const av = email => `<span class="av" aria-hidden="true">${esc(nameOf(email).slice(0, 1).toUpperCase())}</span>`;

  /* ============================ project manager ============================ */
  function pmNotes() {
    const d = S.d, t = today(), notes = [];
    const tasks = d.tasks, ph = d.phases;
    ph.forEach(p => {
      const list = tasks.filter(x => x.phase_id === p.id); if (!list.length) return;
      const done = list.filter(x => x.done).length, total = list.length, actual = done / total;
      if (t < p.starts) return;
      const span = Math.max(1, daysBetween(p.starts, p.ends)), exp = Math.min(1, daysBetween(p.starts, t) / span);
      if (t > p.ends && done < total) notes.push(['r', `<b>${esc(p.name)}</b> was due ${day(p.ends)} and still has ${total - done} open task${total - done === 1 ? '' : 's'}.`]);
      else if (actual + 0.2 < exp) notes.push(['a', `<b>${esc(p.name)}</b> is behind: ${done}/${total} done, ${Math.round(exp * 100)}% of its time used. Ends ${day(p.ends)}.`]);
      else if (done === total) notes.push(['g', `<b>${esc(p.name)}</b> is complete.`]);
    });
    tasks.filter(x => !x.done && x.assigned_to && (x.rolled_over || 0) >= 2).forEach(x => notes.push(['a', `“${esc(x.title)}” has been on ${isMe(x.assigned_to) ? 'your' : esc(nameOf(x.assigned_to)) + '’s'} list for ${x.rolled_over + 1} days. Do it, split it, or tap “Not today”.`]));
    const s = d.summary || {};
    if (num(s.budget_used) >= 0.8) notes.push([num(s.budget_used) >= 1 ? 'r' : 'a', `Budget ${pct(s.budget_used)} used: ${kd(s.budget_left)} left.`]);
    d.pricing.filter(p => p.range_status === 'above range').forEach(p => notes.push(['a', `<b>${esc(p.name)}</b> prices at ${kd(p.final_price)}, above your ${num(d.settings.target_min)}–${num(d.settings.target_max)} KD range. Its cost per set needs to drop to ${kd(p.max_cost_for_target)}.`]));
    d.expos.filter(x => x.apply_by && x.status === 'Researching' && daysBetween(t, x.apply_by) <= 10 && daysBetween(t, x.apply_by) >= 0).forEach(x => notes.push(['r', `Apply to <b>${esc(x.name)}</b> by ${day(x.apply_by)} (${daysBetween(t, x.apply_by)} days).`]));
    d.orders.filter(o => o.status === 'New' && daysBetween(o.ordered_on, t) >= 3).forEach(o => notes.push(['a', `${esc(o.customer)}’s order has been “New” for ${daysBetween(o.ordered_on, t)} days. Confirm the deposit.`]));
    d.orders.filter(o => o.status === 'Delivered' && num(o.balance_due) > 0).forEach(o => notes.push(['r', `Collect ${kd(o.balance_due)} from ${esc(o.customer)}: delivered but not fully paid.`]));
    others().forEach(m => { const ws = weekStats(m.email); if (!ws.lastSeen) notes.push(['i', `${esc(nameOf(m.email))} hasn’t opened the HQ yet. Send them the link.`]); else if (daysBetween(kwDate(new Date(ws.lastSeen)), t) >= 2) notes.push(['a', `${esc(nameOf(m.email))} hasn’t been active for ${daysBetween(kwDate(new Date(ws.lastSeen)), t)} days. A quick check-in?`]); });
    const meW = weekStats(S.me).doneWeek, oth = others().map(m => `${esc(nameOf(m.email))} ${weekStats(m.email).doneWeek}`).join(', ');
    if (meW || oth) notes.push(['i', `This week: you finished ${meW} task${meW === 1 ? '' : 's'}${oth ? `; ${oth}` : ''}.`]);
    const cur = ph.filter(p => p.starts <= t && p.ends >= t); if (cur.length) notes.push(['i', `Focus now: ${cur.map(p => '<b>' + esc(p.name) + '</b>').join(', ')}.`]);
    const next = ph.find(p => p.starts > t); if (next) notes.push(['i', `Next up: <b>${esc(next.name)}</b> starts ${day(next.starts)}.`]);
    const rank = { r: 0, a: 1, g: 2, i: 3 };
    return notes.sort((a, b) => rank[a[0]] - rank[b[0]]);
  }
  function weekStats(email) {
    const t = today(), wk = new Date(Date.parse(t) - 6 * 864e5).toISOString().slice(0, 10);
    const acts = S.d.activity.filter(a => (a.actor || '').toLowerCase() === String(email).toLowerCase());
    const doneToday = acts.filter(a => a.kind === 'task' && a.action === 'completed' && kwDate(new Date(a.at)) === t).length;
    const doneWeek = acts.filter(a => a.kind === 'task' && a.action === 'completed' && kwDate(new Date(a.at)) >= wk).length;
    const lastSeen = acts[0] && acts[0].at;
    return { doneToday, doneWeek, lastSeen };
  }
  const ACTION = { completed: 'completed', reopened: 'reopened', postponed: 'postponed', added: 'added', deleted: 'deleted', moved: 'moved', deposit: 'logged a deposit for', ticked: 'ticked off', chose: 'chose', changed: 'changed' };
  const KIND = { task: 'task', expense: 'expense', order: 'order from', checklist: '', expo: 'exhibition', supplier: 'supplier', setting: '' };
  function feedRow(a) {
    const w = isMe(a.actor) ? 'You' : esc(nameOf(a.actor));
    return `<div>${av(a.actor)}<span style="flex:1"><b>${w}</b> ${ACTION[a.action] || esc(a.action)} ${KIND[a.kind] ? KIND[a.kind] + ' ' : ''}<b>${esc(a.title)}</b>${a.detail ? ` <span class="muted">· ${esc(a.detail)}</span>` : ''}</span><time datetime="${esc(a.at)}">${ago(a.at)}</time></div>`;
  }

  /* ============================ views ============================ */
  const ph = (t, s) => `<div class="ph"><h1>${esc(t)}</h1>${s ? `<p>${s}</p>` : ''}</div>`;
  const greet = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kuwait' })); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  function taskCard(t, mine) {
    const phase = (S.d.phases.find(p => p.id === t.phase_id) || {}).name || '';
    return `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-act="taskDone" data-id="${esc(t.id)}" ${t.done ? 'checked' : ''} ${mine ? '' : 'disabled'} aria-label="Done: ${esc(t.title)}">
      <span style="flex:1;min-width:0"><span class="tt">${esc(t.title)}</span>${t.details ? `<span class="small muted" style="display:block;margin-top:2px">${esc(t.details)}</span>` : ''}<span class="small muted" style="display:block;margin-top:4px">${esc(phase)}${(t.rolled_over || 0) > 0 && !t.done ? ` · carried over ${t.rolled_over} day${t.rolled_over === 1 ? '' : 's'}` : ''}${t.done && t.done_at ? ' · done ' + ago(t.done_at) : ''}</span></span>
      ${mine && !t.done ? `<button class="btn sm" data-act="snooze" data-id="${esc(t.id)}">Not today</button>` : ''}</label>`;
  }
  function vToday() {
    const d = S.d, mine = d.todayList, open = mine.filter(t => !t.done), done = mine.filter(t => t.done);
    const all = d.tasks.length, allDone = d.tasks.filter(t => t.done).length, toR = daysBetween(today(), RAMADAN);
    const notes = pmNotes();
    return ph(`${greet()}, ${nameOf(S.me)}.`, `${toR > 0 ? `${toR} days to Ramadan (around ${day(RAMADAN)})` : 'Ramadan Kareem'} · launch plan ${Math.round(allDone / Math.max(1, all) * 100)}% done`) +
      `<div class="grid g2" style="align-items:start">
        <div><h2>Your tasks today</h2><div class="list" style="display:flex;flex-direction:column;gap:8px">
          ${open.length ? open.map(t => taskCard(t, true)).join('') : `<div class="empty">${allDone === all ? 'Every launch task is done.' : 'Nothing left for today. New tasks load when you finish your batch.'}</div>`}
          ${done.map(t => taskCard(t, true)).join('')}
          </div><p class="small muted" style="margin-top:10px">You get ${num(d.settings.tasks_per_day) || 3} tasks a day. Unfinished ones carry over. Finish them all and the next batch loads straight away.</p></div>
        <div><h2>Project manager’s notes</h2><div class="card" style="padding:6px 18px">${notes.length ? notes.map(n => `<div class="note"><b class="flag ${n[0]}" aria-hidden="true"></b><span>${n[1]}</span></div>`).join('') : '<div class="note"><b class="flag g"></b><span>Everything is on track.</span></div>'}</div></div>
      </div>
      <div class="sec"><h2>Your partner today</h2><div class="grid g2">${others().length ? others().map(m => { const ws = weekStats(m.email); const theirs = d.tasks.filter(t => (t.assigned_to || '').toLowerCase() === m.email.toLowerCase() && t.scheduled_for === today());
        return `<div class="card"><div class="row" style="justify-content:space-between"><div class="row">${av(m.email)}<b>${esc(nameOf(m.email))}</b></div><span class="small muted">${ws.lastSeen ? 'Active ' + ago(ws.lastSeen) : 'No activity yet'}</span></div>
          <p class="small" style="margin:10px 0">${ws.doneToday} done today · ${ws.doneWeek} this week</p>
          <div style="display:flex;flex-direction:column;gap:6px">${theirs.length ? theirs.map(t => `<div class="small row" style="flex-wrap:nowrap;align-items:flex-start"><span style="color:${t.done ? 'var(--good)' : 'var(--faint)'}">${t.done ? '✓' : '○'}</span><span style="${t.done ? 'color:var(--faint);text-decoration:line-through' : ''}">${esc(t.title)}</span></div>`).join('') : '<span class="small muted">Their tasks appear once they open the app today.</span>'}</div></div>`; }).join('') : '<div class="empty">Add your partner to the members list to see their progress here.</div>'}</div></div>
      <div class="sec"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Latest activity</h2><button class="btn sm" data-go="team">See all</button></div><div class="card feed" style="padding:4px 18px;margin-top:12px">${d.activity.slice(0, 8).map(feedRow).join('') || '<p class="muted small">Nothing yet.</p>'}</div></div>`;
  }

  function vTeam() {
    const d = S.d, f = S.ui.feed, t = today();
    const people = d.members.length ? d.members : [{ email: S.me, name: 'You' }];
    let list = d.activity; if (f !== 'all') list = list.filter(a => (a.actor || '').toLowerCase() === f.toLowerCase());
    const groups = {}; list.forEach(a => { const k = kwDate(new Date(a.at)); (groups[k] = groups[k] || []).push(a); });
    return ph('Team activity', 'Everything either of you did, recorded automatically.') +
      `<div class="grid g${Math.min(4, Math.max(2, people.length))}">${people.map(m => { const ws = weekStats(m.email); const open = d.tasks.filter(x => (x.assigned_to || '').toLowerCase() === (m.email || '').toLowerCase() && !x.done).length;
        return `<div class="card"><div class="row">${av(m.email)}<b>${isMe(m.email) ? 'You' : esc(nameOf(m.email))}</b></div><div class="grid g3" style="margin-top:12px;gap:8px"><div class="kpi"><div class="n" style="font-size:26px">${ws.doneToday}</div><div class="l">Today</div></div><div class="kpi"><div class="n" style="font-size:26px">${ws.doneWeek}</div><div class="l">This week</div></div><div class="kpi"><div class="n" style="font-size:26px">${open}</div><div class="l">Open</div></div></div><p class="small muted" style="margin:8px 0 0">${ws.lastSeen ? 'Last active ' + ago(ws.lastSeen) : 'No activity yet'}</p></div>`; }).join('')}</div>
      <div class="sec"><div class="tabs" role="group" aria-label="Filter">${[['all', 'Everyone']].concat(people.map(m => [m.email, isMe(m.email) ? 'You' : nameOf(m.email)])).map(o => `<button class="tab" data-act="feed" data-v="${esc(o[0])}" aria-pressed="${o[0] === f}">${esc(o[1])}</button>`).join('')}</div>
      ${Object.keys(groups).length ? Object.entries(groups).map(([k, arr]) => `<h3 style="margin:18px 0 6px">${k === t ? 'Today' : day(k)}</h3><div class="card feed" style="padding:4px 18px">${arr.map(feedRow).join('')}</div>`).join('') : '<div class="empty">No activity yet.</div>'}</div>`;
  }

  function vPlan() {
    const d = S.d, t = today();
    const owners = [['', 'Either of us']].concat(d.members.map(m => [m.email, isMe(m.email) ? 'Me' : nameOf(m.email)]));
    return ph('Launch plan', 'Every task, by phase. The daily feed hands these out in order; set “Who” to keep a task for one person.') +
      d.phases.map(p => { const list = d.tasks.filter(x => x.phase_id === p.id).sort((a, b) => a.sort - b.sort), done = list.filter(x => x.done).length; const state = t < p.starts ? 'Upcoming' : t > p.ends ? (done === list.length ? 'Complete' : 'Overdue') : 'In progress';
        return `<div class="card sec" style="margin-top:14px"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">${esc(p.name)}</h2><p class="small muted" style="margin:2px 0 0">${day(p.starts)} – ${day(p.ends)} · ${done}/${list.length} done</p></div><span class="pill ${state === 'Complete' ? 'ok' : state === 'Overdue' ? 'bad' : state === 'In progress' ? 'gold' : ''}">${state}</span></div>
          <div class="meter" style="margin:12px 0 6px"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>
          <div class="tw" style="border:none"><table style="min-width:560px"><tbody>${list.map(x => `<tr><td style="width:36px"><input type="checkbox" data-act="planDone" data-id="${esc(x.id)}" ${x.done ? 'checked' : ''} aria-label="Done: ${esc(x.title)}" style="width:18px;height:18px;accent-color:#1C1917"></td>
            <td style="${x.done ? 'color:var(--faint);text-decoration:line-through' : ''}">${esc(x.title)}</td>
            <td class="small muted" style="white-space:nowrap">${x.done ? `${isMe(x.done_by) ? 'You' : esc(nameOf(x.done_by))} · ${ago(x.done_at)}` : x.assigned_to ? `${isMe(x.assigned_to) ? 'Your' : esc(nameOf(x.assigned_to)) + '’s'} list` : ''}</td>
            <td style="width:150px"><select aria-label="Who" data-act="owner" data-id="${esc(x.id)}">${opt(owners, x.owner || '')}</select></td>
            <td style="width:44px"><button class="x" data-act="delTask" data-id="${esc(x.id)}" aria-label="Delete task">✕</button></td></tr>`).join('')}</tbody></table></div>
          <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" id="nt-${p.id}" placeholder="Add a task to ${esc(p.name)}" aria-label="New task"><button class="btn sm" data-act="addTask" data-ph="${p.id}">Add</button></div></div>`; }).join('');
  }

  /* ---------- money ---------- */
  function band(p) { const st = S.d.settings, t = `${num(st.target_min)}–${num(st.target_max)} KD`; return { 'in range': `<span class="pill ok">In ${t}</span>`, 'above range': `<span class="pill bad">Above ${t}</span>`, 'below range': `<span class="pill gold">Below ${t}</span>` }[p.range_status] || '<span class="pill">No costs yet</span>'; }
  const styleName = id => (S.d.styles.find(s => s.id === Number(id)) || {}).name || '';
  function vMoney() {
    const s = S.d.summary || {}, used = Math.min(100, num(s.budget_used) * 100), max = Math.max(1, ...S.d.spend.map(c => num(c.spent))), spend = S.d.spend.filter(c => num(c.spent) > 0);
    return ph('Money', 'Calculated by the database whenever either of you adds an expense or order.') +
      `<div class="grid g4"><div class="card kpi"><div class="n">${kd(s.spent)}</div><div class="l">Spent of ${kd(s.budget)}</div></div><div class="card kpi"><div class="n">${kd(s.revenue)}</div><div class="l">Revenue · ${num(s.orders)} order${num(s.orders) === 1 ? '' : 's'}</div></div><div class="card kpi"><div class="n">${kd(s.profit)}</div><div class="l">Profit on sales</div></div><div class="card kpi"><div class="n">${kd(s.owed)}</div><div class="l">Still owed by customers</div></div></div>
      <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Budget</h2><div class="meter"><i style="width:${used}%;background:${used > 90 ? 'var(--bad)' : 'var(--accent)'}"></i></div><p class="small muted" style="margin:10px 0 0">${kd(s.budget_left)} left · ${pct(s.budget_used)} used · ${kd(s.collected)} collected in deposits</p><p class="small" style="margin:8px 0 0">${s.sets_to_break_even != null ? (num(s.net_position) >= 0 ? 'You’ve earned back everything you’ve spent.' : `About <b>${s.sets_to_break_even}</b> more sets to earn back what you’ve spent.`) : 'Log a sale to see your break-even point.'}</p></div>
      <div class="card"><h2>Where the money went</h2>${spend.length ? spend.map(c => `<div class="hbar"><span class="small">${esc(c.category)}</span><div class="meter" style="height:10px"><i style="width:${num(c.spent) / max * 100}%;background:${c.kind === 'per_set' ? 'var(--accent)' : 'var(--gold)'}"></i></div><span class="small" style="text-align:right">${kd(c.spent)}</span></div>`).join('') + '<p class="small muted" style="margin:8px 0 0">Black = cost of the sets · gold = overheads</p>' : '<p class="muted small">Appears once you log expenses.</p>'}</div></div>
      <div class="sec"><h2>Prices right now</h2><div class="grid g5">${S.d.pricing.map(p => `<div class="card"><h3>${esc(p.name)}</h3><div style="font-family:var(--serif);font-size:30px;line-height:1.1">${num(p.final_price) ? kd(p.final_price) : '—'}</div><p class="small muted" style="margin:4px 0 8px">${num(p.final_price) ? `Cost ${kd(p.full_cost)} · margin ${pct(p.margin)}` : `Target ${num(p.target_price)} KD`}</p>${band(p)}</div>`).join('')}</div></div>`;
  }
  function vExpenses() {
    const f = S.ef, cats = S.d.categories, kindOf = n => (cats.find(c => c.name === n) || {}).kind, cat = f.category || cats[0].name, isOver = kindOf(cat) === 'overhead', scope = isOver ? 'general' : (f.scope || 'style');
    return ph('Expenses', 'Log every payment. For per-set costs, enter how many sets it covers so prices update.') +
      `<div class="form"><div class="field"><label for="e-date">Date</label><input type="date" id="e-date" value="${esc(f.spent_on || today())}"></div>
        <div class="field"><label for="e-cat">Category</label><select id="e-cat" data-keep="category"><optgroup label="Cost of the sets">${opt(cats.filter(c => c.kind === 'per_set').map(c => c.name), cat)}</optgroup><optgroup label="Overheads">${opt(cats.filter(c => c.kind === 'overhead').map(c => c.name), cat)}</optgroup></select></div>
        ${isOver ? '' : `<div class="field"><label for="e-scope">For</label><select id="e-scope" data-keep="scope">${opt([['style', 'One set'], ['all_styles', 'All sets (shared)']], scope)}</select></div>`}
        ${!isOver && scope === 'style' ? `<div class="field"><label for="e-style">Which set</label><select id="e-style">${opt(S.d.styles.map(s => [s.id, s.name]), f.style_id)}</select></div>` : ''}
        <div class="field wide"><label for="e-item">What was it</label><input type="text" id="e-item" placeholder="e.g. 40 m cream linen-look fabric" value="${esc(f.item || '')}"></div>
        <div class="field"><label for="e-sup">Supplier</label><input type="text" id="e-sup" value="${esc(f.supplier || '')}"></div>
        <div class="field"><label for="e-amt">Amount paid (KD)</label><input type="number" inputmode="decimal" min="0" step="0.001" id="e-amt" value="${esc(f.amount || '')}"></div>
        ${isOver ? '' : `<div class="field"><label for="e-sets">Sets it covers</label><input type="number" inputmode="numeric" min="1" step="1" id="e-sets" value="${esc(f.sets_covered || '')}"></div>`}
        <button class="btn solid" data-act="addExpense">Add expense</button>
        <p class="hint">${isOver ? 'Overheads are spread across your planned number of sets (Settings).' : 'Example: KD 120 of fabric that makes 30 tops = KD 4 per set.'}</p></div>
      <div class="sec">${S.d.expenses.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Category</th><th>For</th><th>Item</th><th>Supplier</th><th class="n">Paid</th><th class="n">Sets</th><th class="n">Per set</th><th>Added by</th><th></th></tr></thead><tbody>
        ${S.d.expenses.map(e => `<tr><td>${day(e.spent_on)}</td><td>${esc(e.category)}</td><td class="small">${e.scope === 'style' ? esc(styleName(e.style_id)) : e.scope === 'all_styles' ? 'All sets' : 'General'}</td><td>${esc(e.item)}</td><td class="small">${esc(e.supplier)}</td><td class="n">${kd(e.amount)}</td><td class="n">${num(e.sets_covered) || '—'}</td><td class="n">${num(e.sets_covered) ? kd(num(e.amount) / num(e.sets_covered)) : '—'}</td><td class="small muted">${isMe(e.created_by) ? 'You' : esc(nameOf(e.created_by))}</td><td><button class="x" data-act="delExpense" data-id="${esc(e.id)}" aria-label="Delete expense">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No expenses yet.</div>'}</div>`;
  }
  function vOrders() {
    const f = S.of;
    return ph('Orders', 'Pick a set and the current price fills in. Only type a price if you charged something different.') +
      `<div class="form"><div class="field"><label for="o-date">Date</label><input type="date" id="o-date" value="${esc(f.ordered_on || today())}"></div><div class="field wide"><label for="o-cust">Customer</label><input type="text" id="o-cust" value="${esc(f.customer || '')}"></div><div class="field"><label for="o-ch">Channel</label><select id="o-ch">${opt(CHANNELS, f.channel || 'Instagram')}</select></div><div class="field wide"><label for="o-style">Set</label><select id="o-style">${opt(S.d.styles.map(s => [s.id, s.name]), f.style_id)}</select></div><div class="field"><label for="o-qty">Sets</label><input type="number" inputmode="numeric" min="1" id="o-qty" value="${esc(f.qty || 1)}"></div><div class="field"><label for="o-price">Price per set (optional)</label><input type="number" inputmode="decimal" min="0" step="0.5" id="o-price" placeholder="automatic"></div><div class="field"><label for="o-disc">Discount %</label><input type="number" inputmode="numeric" min="0" max="100" id="o-disc" value="0"></div><div class="field"><label for="o-dep">Deposit (KD)</label><input type="number" inputmode="decimal" min="0" step="0.5" id="o-dep" value="0"></div><div class="field wide"><label for="o-emb">Embroidery</label><input type="text" id="o-emb" placeholder="e.g. family initials"></div><button class="btn solid" data-act="addOrder">Add order</button></div>
      <div class="sec">${S.d.orders.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Customer</th><th>Set</th><th class="n">Qty</th><th class="n">Per set</th><th class="n">Total</th><th class="n">Deposit</th><th class="n">Balance</th><th class="n">Profit</th><th>Status</th><th></th></tr></thead><tbody>
        ${S.d.orders.map(o => `<tr><td>${day(o.ordered_on)}</td><td>${esc(o.customer)}<div class="small muted">${esc(o.channel)}${o.embroidery ? ' · ' + esc(o.embroidery) : ''}</div></td><td class="small">${esc(o.style_name)}</td><td class="n">${o.qty}</td><td class="n">${kd(o.price_per_set)}</td><td class="n"><b>${kd(o.order_total)}</b></td><td class="n" style="min-width:100px"><input type="number" min="0" step="0.5" aria-label="Deposit" value="${esc(num(o.deposit))}" data-act="dep" data-id="${esc(o.id)}"></td><td class="n" style="color:${num(o.balance_due) > 0 ? 'var(--bad)' : 'var(--good)'}">${num(o.balance_due) > 0 ? kd(o.balance_due) : 'Paid'}</td><td class="n">${kd(o.profit)}</td><td><select aria-label="Status" data-act="status" data-id="${esc(o.id)}">${opt(STATUSES, o.status)}</select></td><td><button class="x" data-act="delOrder" data-id="${esc(o.id)}" aria-label="Delete order">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No orders yet.</div>'}</div>`;
  }
  function vPricing() {
    const st = S.d.settings, cats = S.d.categories.filter(c => c.kind === 'per_set');
    return ph('Pricing', `Average cost per set × ${num(st.multiplier)}, rounded up to the nearest ${num(st.round_to)} KD.`) +
      `<div class="tw"><table><thead><tr><th>Set</th>${cats.map(c => `<th class="n">${esc(c.name)}</th>`).join('')}<th class="n">Overheads</th><th class="n">Full cost</th><th class="n">Max cost</th><th class="n">Suggested</th><th>Your price</th><th class="n">Margin</th><th class="n">Pack of ${num(st.pack_size)}</th><th>Target</th></tr></thead><tbody>
      ${S.d.pricing.map(p => { const b = p.breakdown || {}; return `<tr><td><b>${esc(p.name)}</b></td>${cats.map(c => `<td class="n">${kd(b[c.name])}</td>`).join('')}<td class="n">${kd(p.overhead_per_set)}</td><td class="n"><b>${kd(p.full_cost)}</b></td><td class="n muted">${kd(p.max_cost_for_target)}</td><td class="n">${p.has_costs ? kd(p.suggested_price) : '—'}</td><td style="min-width:110px"><input type="number" min="0" step="0.5" placeholder="automatic" aria-label="Your price for ${esc(p.name)}" value="${p.price_override ? esc(num(p.price_override)) : ''}" data-act="override" data-id="${p.style_id}"></td><td class="n" style="color:${num(p.final_price) && num(p.margin) < 0.4 ? 'var(--bad)' : 'inherit'}">${pct(p.margin)}</td><td class="n">${kd(p.pack_price)}</td><td>${band(p)}</td></tr>`; }).join('')}
      </tbody></table></div><p class="small muted">“Max cost” is the most a set can cost you all-in to hit its target. Type “Your price” to override; clear it to go back to automatic.</p>`;
  }

  /* ---------- product ---------- */
function sketch(o){
  // simple front flat: top + straight pants. o: {len, close, panels, belt, kimono, stripe, sleeve}
  const ink='#3A332E', gold='#A6814A', base=o.base||'#EFE8DC', side=o.side||base, pant=o.pant||'#D9C8AE';
  const hem=o.len, sl=o.sleeve==='short'?118:190;
  const stripes=o.stripe?Array.from({length:10},(_,i)=>`<line x1="${75+i*10}" y1="${i<3||i>6?104:44}" x2="${75+i*10}" y2="${hem}" stroke="${ink}" stroke-opacity=".18" stroke-width="1.2"/>`).join(''):'';
  return `<svg viewBox="0 0 240 420" width="100%" style="max-width:220px" role="img" aria-label="Flat sketch of the ${esc(o.name)}">
  <path d="M74 ${hem-10} L70 400 L112 400 L120 ${hem+40} L128 400 L170 400 L166 ${hem-10} Z" fill="${pant}" stroke="${ink}" stroke-width="1.4"/>
  <path d="M73 ${hem+10} L70 398 M167 ${hem+10} L170 398" stroke="#F6F1E8" stroke-width="2"/>
  <path d="M96 40 L144 40 L190 62 L${o.sleeve==='short'?204:214} ${sl} L${o.sleeve==='short'?182:192} ${sl+6} L170 104 L170 ${hem} L70 ${hem} L70 104 L${o.sleeve==='short'?58:48} ${sl+6} L${o.sleeve==='short'?36:26} ${sl} L50 62 Z" fill="${base}" stroke="${ink}" stroke-width="1.4"/>
  ${o.panels?`<path d="M70 104 L88 104 L88 ${hem} L70 ${hem} Z M152 104 L170 104 L170 ${hem} L152 ${hem} Z" fill="${side}" stroke="${ink}" stroke-width="1"/>`:''}
  ${stripes}
  ${o.kimono?`<path d="M96 40 L112 ${hem} M144 40 L128 ${hem}" stroke="${side}" stroke-width="14"/><path d="M96 40 L112 ${hem} M144 40 L128 ${hem}" stroke="${ink}" stroke-width="1" fill="none"/>`:`<path d="M98 40 L98 26 L142 26 L142 40" fill="${base}" stroke="${gold}" stroke-width="2.5"/>`}
  ${o.close==='asym'?`<path d="M120 40 L104 ${hem}" stroke="${gold}" stroke-width="2.5"/>`:''}
  ${o.close==='side'?`<path d="M136 40 L136 ${hem}" stroke="${gold}" stroke-width="2"/>${[70,105,140,175].filter(y=>y<hem-8).map(y=>`<circle cx="136" cy="${y}" r="4" fill="${gold}"/>`).join('')}`:''}
  ${o.close==='center'?`<path d="M120 40 L120 ${hem}" stroke="${ink}" stroke-opacity=".5" stroke-width="1.5"/><circle cx="120" cy="58" r="4" fill="${gold}"/>`:''}
  ${o.close==='wrap'?`<path d="M100 40 Q150 110 166 ${hem-30}" stroke="${gold}" stroke-width="2.5" fill="none"/><path d="M160 ${hem-34} l14 22 M162 ${hem-30} l-8 26" stroke="${ink}" stroke-width="3"/>`:''}
  ${o.belt?`<rect x="70" y="${hem-44}" width="100" height="12" fill="${o.beltColor||base}" stroke="${ink}" stroke-width="1"/><path d="M128 ${hem-38} l-10 40 M130 ${hem-38} l10 38" stroke="${ink}" stroke-width="3"/>`:''}
  <path d="M${o.sleeve==='short'?36:26} ${sl} L${o.sleeve==='short'?58:48} ${sl+6} M${o.sleeve==='short'?204:214} ${sl} L${o.sleeve==='short'?182:192} ${sl+6}" stroke="${o.cuff||gold}" stroke-width="${o.cuff?7:2.5}"/>
  ${o.kimono||o.noLogo?'':`<path d="M142 72 a8 8 0 1 0 6 12 a6 6 0 1 1 -6 -12z" fill="${gold}"/>`}
  </svg>`;
}
const DROP=[
 {name:'Daily Stripe Shirt set',price:14,role:'Everyday wear: cleaning, school runs, kitchen',
  top:'Hip-length shirt in a fine cream-and-sand pinstripe, mandarin collar, half sleeves with a turn-up cuff, one brushed-gold button at the neck',
  pants:'Straight-leg pants in ivory, elastic back waist, side pockets',
  details:'No embroidery to keep it at the entry price. Small woven brand tab at the hem.',
  ref:'New Forms striped stand-collar shirts, made softer and in Ramadan neutrals',
  o:{len:250,close:'center',stripe:true,noLogo:true,sleeve:'short',base:'#EFE8DC',pant:'#F6F1E8'}},
 {name:'Tie Top set',price:16,role:'Nannies: the hero piece, easiest to move and lift children in',
  top:'Hip-length top, mandarin collar, asymmetric placket with gold piping and hidden snaps, long sleeves with piped turn-back cuff, self-fabric tie belt (or a taupe contrast belt)',
  pants:'Straight-leg pants in sand with a thin cream piping down the side seam',
  details:'Crescent chest embroidery, about 3.5 cm, one thread colour.',
  ref:'Your Style 1 board, with New Forms’ piped straight pants instead of sherwal',
  o:{len:250,close:'asym',belt:true,beltColor:'#A89A88',base:'#EFE8DC',pant:'#D9C8AE'}},
 {name:'Side-Button Tunic set',price:16,role:'Housekeepers: covers more, stays neat all day',
  top:'Mid-thigh tunic, cream front with sand side panels, offset placket with four brushed-gold buttons, short or long sleeves, side slits',
  pants:'Straight-leg pants in the side-panel colour with cream side piping',
  details:'Crescent chest embroidery. Two-tone panels make each colourway look intentional.',
  ref:'New Forms two-tone side-button tunic, with your mandarin collar and gold piping',
  o:{len:290,close:'side',panels:true,base:'#F6F1E8',side:'#D9C8AE',pant:'#D9C8AE'}},
 {name:'Wrap Top set',price:18,role:'Serving at iftar and ghabgas',
  top:'Hip-length wrap top that closes at the side with a tie bow, mandarin collar, gold piping on collar, hem and cuffs',
  pants:'Straight-leg pants in taupe',
  details:'Crescent chest embroidery, back box pleat with a small brass bar tab.',
  ref:'Your Style 3 wrap top, on straight pants',
  o:{len:250,close:'wrap',base:'#EFE8DC',pant:'#A89A88'}},
 {name:'Kimono Hosting set',price:20,role:'Hosting and photos: the premium piece',
  top:'Open kimono-style top over a simple cream shell, wide contrast band down the front in taupe, Ramadan geometric embroidery band on the cuffs',
  pants:'Straight-leg pants in taupe, matching the band',
  details:'Cuff embroidery band (5–6 cm) instead of the chest logo. Optional family monogram as a paid add-on.',
  ref:'New Forms kimono jacket with contrast trim, finished with your cuff embroidery and cape-style detail',
  o:{len:270,kimono:true,base:'#EFE8DC',side:'#A89A88',pant:'#A89A88',cuff:'#B08D57'}}
];

  function vDrop() {
    const st = S.d.settings, m = num(st.multiplier) || 1, d = DROP[Math.min(S.ui.drop, DROP.length - 1)];
    const sizes = [['S', '86–90', '68–72', '92–96'], ['M', '91–96', '73–78', '97–102'], ['L', '97–102', '79–84', '103–108'], ['XL', '103–110', '85–92', '109–116'], ['XXL', '111–118', '93–100', '117–124'], ['3XL', '119–126', '101–108', '125–132']];
    const p = S.d.pricing.find(x => x.name === d.name);
    return ph('Ramadan drop', 'Five top-and-pants sets, 14–20 KD. Hand this page to your tailor.') +
      `<div class="tabs" role="group" aria-label="Sets">${DROP.map((x, i) => `<button class="tab" data-act="drop" data-i="${i}" aria-pressed="${x === d}">${esc(x.name.replace(' set', ''))}</button>`).join('')}</div>
      <div class="grid g2"><div class="card" style="display:flex;align-items:center;justify-content:center;padding:28px">${sketch(Object.assign({ name: d.name }, d.o))}</div>
      <div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><div><h2 style="margin:0">${esc(d.name)}</h2><p class="muted" style="margin:2px 0 0">${esc(d.role)}</p></div><div style="text-align:right;flex:none"><div style="font-family:var(--serif);font-size:32px;line-height:1">${d.price} KD</div><div class="small muted">target</div></div></div>
        <div style="margin-top:16px"><h3>Top</h3><p style="margin:0 0 12px">${esc(d.top)}</p><h3>Pants</h3><p style="margin:0 0 12px">${esc(d.pants)}</p><h3>Details</h3><p style="margin:0 0 12px">${esc(d.details)}</p><h3>Reference</h3><p class="small muted" style="margin:0">${esc(d.ref)}</p></div>
        <div style="margin-top:14px;background:var(--hover);border-radius:8px;padding:12px" class="small">Must cost <b>${kd(d.price / m)}</b> or less all-in to sell at ${d.price} KD.${p && num(p.full_cost) && p.has_costs ? ` Current cost: <b>${kd(p.full_cost)}</b> ${band(p)}` : ''}</div></div></div>
      <div class="grid g2 sec"><div class="card"><h3>Shared across every set</h3><div class="small" style="display:grid;gap:6px"><span>One straight-leg pant pattern for all five sets, elastic back waist, side pockets.</span><span>Mandarin collar ~3 cm with gold or champagne piping (except the kimono).</span><span>Hidden snaps or flat buttons, nothing that catches on children.</span><span>Pre-washed fabric, overlocked seams, side slits.</span><span>Cream, sand and taupe, gold only as detail.</span></div></div>
      <div><h3>Size chart (body, cm)</h3><div class="tw"><table style="min-width:0"><thead><tr><th>Size</th><th class="n">Bust</th><th class="n">Waist</th><th class="n">Hip</th></tr></thead><tbody>${sizes.map(z => `<tr><td><b>${z[0]}</b></td><td class="n">${z[1]}</td><td class="n">${z[2]}</td><td class="n">${z[3]}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  }
  const NAMES = [['Diyafa', 'ضيافة', 'Hospitality'], ['Bait', 'بيت', 'Home'], ['Fanous', 'فانوس', 'Ramadan lantern'], ['Sakina', 'سكينة', 'Calm'], ['Hadaya', 'هدايا', 'Gifts'], ['Noor', 'نور', 'Light'], ['Ghabga', 'غبقة', 'Ramadan night gathering'], ['Qahwa & Co.', 'قهوة', 'Coffee']];
  function vBrand() {
    const st = S.d.settings, sl = st.shortlist || {};
    const pal = [['Cream', '#EFE8DC', 'Main garment colour'], ['Sand', '#D9C8AE', 'Second garment colour'], ['Taupe', '#A89A88', 'Pants, belts, bands'], ['Gold', '#A6814A', 'Piping and thread only'], ['Ink', '#1C1917', 'Type and labels'], ['White', '#FFFFFF', 'Pages and packaging']];
    return ph('Brand', 'Clean and luxurious: white space, fine detail, one touch of gold.') +
      `<div class="grid g2"><div class="card" style="background:#1C1917;color:#F6EDE2;border-color:#1C1917;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:240px;text-align:center"><div style="font-family:var(--script);font-size:64px;line-height:.9">${esc(st.brand_name)}</div><div style="letter-spacing:.3em;font-size:12px;color:#CDBBA7;margin-top:10px">RAMADAN · KUWAIT</div><div style="font-family:var(--arabic);font-size:28px;color:#D9C29C;margin-top:10px" dir="rtl" lang="ar">${esc(st.brand_ar)}</div></div>
      <div class="card" style="display:flex;align-items:center"><p style="font-size:17px;line-height:1.6;margin:0">${esc(st.brand_name)} dresses the women who make a Kuwaiti home run. Clean, modest sets with quiet luxury details, made to be worn all day and priced so every household can dress its whole team well.</p></div></div>
      <div class="sec"><h2>Choose the name</h2><p class="small muted" style="margin-top:-6px">Both of you can star names. “Use this name” updates it everywhere.</p><div class="grid g4">${NAMES.map(n => { const on = st.brand_name === n[0], stars = Object.entries(sl).filter(([, v]) => (v || []).includes(n[0])).map(([e]) => e);
        return `<div class="card" style="${on ? 'box-shadow:0 0 0 2px #1C1917 inset' : ''}"><div style="font-family:var(--script);font-size:32px;line-height:1">${esc(n[0])}</div><div style="font-family:var(--arabic);font-size:19px" dir="rtl" lang="ar">${esc(n[1])}</div><div class="small muted">${esc(n[2])}</div><div class="row" style="margin-top:10px"><button class="btn sm ${on ? 'solid' : ''}" data-act="useName" data-n="${esc(n[0])}" data-ar="${esc(n[1])}">${on ? 'In use' : 'Use this name'}</button><button class="btn sm" data-act="star" data-n="${esc(n[0])}" aria-pressed="${stars.some(isMe)}">${stars.some(isMe) ? '★' : '☆'}</button></div>${stars.length ? `<p class="small muted" style="margin:8px 0 0">Starred by ${stars.map(e => isMe(e) ? 'you' : esc(nameOf(e))).join(' and ')}</p>` : ''}</div>`; }).join('')}</div>
      <div class="form" style="margin-top:12px"><div class="field wide"><label for="cn">Your own name (English)</label><input type="text" id="cn"></div><div class="field"><label for="ca">Arabic</label><input type="text" id="ca" dir="rtl"></div><button class="btn" data-act="customName">Use my name</button></div></div>
      <div class="sec"><h2>Colours</h2><div class="grid g3">${pal.map(c => `<div class="card row" style="flex-wrap:nowrap"><span style="width:48px;height:48px;border-radius:10px;background:${c[1]};border:1px solid var(--line);flex:none"></span><span><b>${c[0]}</b><span class="small muted" style="display:block">${c[1]} · ${c[2]}</span></span></div>`).join('')}</div></div>
      <div class="sec"><h2>Type</h2><div class="grid g3"><div class="card"><div style="font-family:var(--script);font-size:40px;line-height:1">Signature</div><p class="small muted">Pinyon Script · the name only</p></div><div class="card"><div style="font-family:var(--serif);font-size:32px;line-height:1.1">Headlines</div><p class="small muted">Cormorant Garamond · titles, packaging</p></div><div class="card"><div style="font-size:18px">Easy to read body text.</div><p class="small muted">Figtree · captions, prices, care labels</p></div></div></div>`;
  }
  function vInstagram() {
    const st = S.d.settings, handle = '@' + String(st.brand_name).toLowerCase().replace(/[^a-z0-9]+/g, '') + '.kw', posts = S.d.posts, p = posts.find(x => x.position === S.ui.post) || posts[0], weeks = S.d.checklist.filter(c => c.list === 'ig_weeks');
    const caps = [['Launch', 'رمضان قرب، وبيتج يستاهل أحلى استقبال ✨\nيونيفورمات رمضانية أنيقة ومريحة لفريق بيتج، مع تطريز اسم العائلة.\n\nRamadan is close. Dress your household team for every iftar and ghabga.\nOrder on WhatsApp, link in bio'], ['Product', 'The Tie Top set\nMandarin collar, gold piping, straight pants with side piping.\nSizes S–3XL · family embroidery available\nاطلبي الحين عن طريق الواتساب'], ['Pre-order', 'Pre-orders are open\nLast order date: [DATE]\nHousehold packs of 3 · embroidery included\nالطلب المسبق مفتوح، آخر موعد [DATE]'], ['Exhibition', 'Find us at [EXHIBITION], booth [NO.]\nCome feel the fabric and pick your family’s embroidery.\nتعالوا زورونا في [المعرض]']];
    const tags = ['#رمضان_الكويت #غبقة #يونيفورم #الكويت #ضيافة', '#kuwait #q8 #ramadan2027 #kuwaitbusiness #uniforms', '#ramadanprep #ghabga #modestfashion #kuwaitmoms'];
    const T = S.ui.ig;
    return ph('Instagram', 'Plan the grid, write captions, and launch in four weeks.') +
      `<div class="tabs" role="group" aria-label="Instagram">${[['grid', 'Grid planner'], ['captions', 'Captions'], ['weeks', 'Launch weeks']].map(t => `<button class="tab" data-act="igTab" data-v="${t[0]}" aria-pressed="${T === t[0]}">${t[1]}</button>`).join('')}</div>` +
      (T === 'grid' && p ? `<div class="grid g2" style="align-items:start"><div class="phone"><div class="row" style="flex-wrap:nowrap;gap:14px"><span style="width:62px;height:62px;border-radius:50%;background:#1C1917;color:#D9BF8E;display:flex;align-items:center;justify-content:center;font-family:var(--arabic);font-size:24px;flex:none">${esc(String(st.brand_ar || 'ض').slice(0, 1))}</span><div class="small"><b>${esc(handle)}</b><div class="muted">${posts.filter(x => x.status === 'Posted').length} posts</div></div></div><div class="small" style="white-space:pre-line;margin:10px 0">${esc(st.ig_bio)}</div>
        <div class="ig">${posts.map(x => { const t = POST_TYPES[x.type] || POST_TYPES.product; return `<button style="background:${t[1]}" data-act="pickPost" data-v="${x.position}" aria-pressed="${x === p}" aria-label="Edit post ${x.position}"><span class="t">${esc(t[0].split(' ')[0])}</span>${esc(x.caption.slice(0, 40))}${x.caption.length > 40 ? '…' : ''}</button>`; }).join('')}</div></div>
        <div style="display:flex;flex-direction:column;gap:14px"><div class="card"><h3>Post ${p.position}</h3><div class="grid g3" style="gap:10px"><div class="field"><label for="ip-type">Type</label><select id="ip-type" data-act="post" data-k="type" data-id="${esc(p.id)}">${opt(Object.entries(POST_TYPES).map(([k, v]) => [k, v[0]]), p.type)}</select></div><div class="field"><label for="ip-st">Status</label><select id="ip-st" data-act="post" data-k="status" data-id="${esc(p.id)}">${opt(['Idea', 'Shot', 'Edited', 'Scheduled', 'Posted'], p.status)}</select></div><div class="field"><label for="ip-date">Date</label><input type="date" id="ip-date" data-act="post" data-k="post_date" data-id="${esc(p.id)}" value="${esc(p.post_date || '')}"></div></div><div class="field" style="margin-top:10px"><label for="ip-cap">Caption</label><textarea id="ip-cap" data-act="post" data-k="caption" data-id="${esc(p.id)}">${esc(p.caption)}</textarea></div></div>
        <div class="card"><h3>Bio</h3><textarea aria-label="Bio" data-act="bio">${esc(st.ig_bio)}</textarea><p class="small muted" style="margin:6px 0 0">Handle idea: ${esc(handle)}</p></div></div></div>` : '') +
      (T === 'captions' ? `<div class="grid g2">${caps.map(c => `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${c[0]}</h3><button class="btn sm" data-act="copy" data-txt="${esc(c[1])}">Copy</button></div><p style="white-space:pre-line;margin:10px 0 0" dir="auto">${esc(c[1])}</p></div>`).join('')}</div><h2 class="sec">Hashtags</h2><div class="grid g3">${tags.map(t => `<div class="card"><p style="margin:0 0 10px" dir="auto">${esc(t)}</p><button class="btn sm" data-act="copy" data-txt="${esc(t)}">Copy</button></div>`).join('')}</div>` : '') +
      (T === 'weeks' ? `<div style="display:flex;flex-direction:column;gap:8px">${weeks.map(w => `<label class="task ${w.done ? 'done' : ''}"><input type="checkbox" data-act="check" data-id="${esc(w.id)}" ${w.done ? 'checked' : ''}><span><span class="tt">${esc(w.title)}</span><span class="small muted" style="display:block">${esc(w.details)}</span></span></label>`).join('')}</div>` : '');
  }
  function vExpos() {
    const booth = S.d.checklist.filter(c => c.list === 'booth'), bd = booth.filter(b => b.done).length;
    return ph('Exhibitions', 'Track each Ramadan exhibition from application to booth.') +
      `<div class="form"><div class="field wide"><label for="x-n">Exhibition</label><input type="text" id="x-n"></div><div class="field"><label for="x-d">Apply by</label><input type="date" id="x-d"></div><div class="field"><label for="x-s">Starts</label><input type="date" id="x-s"></div><div class="field"><label for="x-f">Booth fee (KD)</label><input type="number" min="0" id="x-f"></div><div class="field wide"><label for="x-l">Location</label><input type="text" id="x-l"></div><button class="btn solid" data-act="addExpo">Add exhibition</button></div>
      <div class="sec">${S.d.expos.length ? `<div class="tw"><table><thead><tr><th>Exhibition</th><th>Location</th><th>Apply by</th><th>Starts</th><th class="n">Fee</th><th>Status</th><th></th></tr></thead><tbody>${S.d.expos.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.location)}</td><td>${day(x.apply_by)}</td><td>${day(x.starts)}</td><td class="n">${kd(x.fee)}</td><td><select aria-label="Status" data-act="expoSt" data-id="${esc(x.id)}">${opt(EXPO_ST, x.status)}</select></td><td><button class="x" data-act="delExpo" data-id="${esc(x.id)}" aria-label="Delete">✕</button></td></tr>`).join('')}</tbody></table></div><p class="small muted">Log booth fees in Expenses as “Exhibition” so they count in prices.</p>` : '<div class="empty">Add the exhibitions you’re considering.</div>'}</div>
      <div class="sec card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Booth kit</h2><span class="pill">${bd}/${booth.length}</span></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">${booth.map(b => `<label class="row" style="min-height:40px;flex-wrap:nowrap"><input type="checkbox" data-act="check" data-id="${esc(b.id)}" ${b.done ? 'checked' : ''} style="width:18px;height:18px;accent-color:#1C1917"><span style="${b.done ? 'color:var(--faint);text-decoration:line-through' : ''}">${esc(b.title)}</span></label>`).join('')}</div></div>`;
  }
  function vSuppliers() {
    return ph('Suppliers', 'Tailors, fabric shops, embroiderers and photographers, with quotes side by side.') +
      `<div class="form"><div class="field wide"><label for="c-n">Name</label><input type="text" id="c-n"></div><div class="field"><label for="c-t">Type</label><select id="c-t">${opt(SUP_TYPES)}</select></div><div class="field"><label for="c-p">Phone / WhatsApp</label><input type="text" id="c-p"></div><div class="field"><label for="c-q">Quote per set (KD)</label><input type="number" min="0" step="0.5" id="c-q"></div><div class="field wide"><label for="c-x">Notes</label><input type="text" id="c-x" placeholder="lead time, minimums…"></div><button class="btn solid" data-act="addSup">Add supplier</button></div>
      <div class="sec">${S.d.suppliers.length ? `<div class="grid g3">${S.d.suppliers.map(c => `<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><b>${esc(c.name)}</b><div class="small muted">${esc(c.type)} · added by ${isMe(c.created_by) ? 'you' : esc(nameOf(c.created_by))}</div></div><button class="x" data-act="delSup" data-id="${esc(c.id)}" aria-label="Delete">✕</button></div>${c.phone ? `<p class="small" style="margin:8px 0 0">${esc(c.phone)}</p>` : ''}${num(c.quote) ? `<p style="font-family:var(--serif);font-size:24px;margin:4px 0 0">${kd(c.quote)}<span class="small muted"> / set</span></p>` : ''}${c.notes ? `<p class="small muted" style="margin:4px 0 0">${esc(c.notes)}</p>` : ''}<label class="row" style="margin-top:8px"><input type="checkbox" data-act="chosen" data-id="${esc(c.id)}" ${c.chosen ? 'checked' : ''} style="accent-color:#1C1917"><span class="small">Chosen</span></label></div>`).join('')}</div>` : '<div class="empty">Add the tailors you’re getting quotes from.</div>'}</div>`;
  }
  function vSettings() {
    const st = S.d.settings;
    const f = (k, label, step, hint, isPct) => `<div class="field"><label for="s-${k}">${label}</label><input type="number" id="s-${k}" step="${step}" data-act="setting" data-k="${k}" ${isPct ? 'data-pct="1"' : ''} value="${esc(isPct ? Math.round(num(st[k]) * 100) : num(st[k]))}">${hint ? `<span class="small muted">${hint}</span>` : ''}</div>`;
    return ph('Settings', 'Shared by both of you. Changes recalculate straight away.') +
      `<div class="form" style="align-items:start">${f('tasks_per_day', 'Tasks per person per day', '1', 'The daily feed size')}${f('budget', 'Startup budget (KD)', '1')}${f('multiplier', 'Price multiplier', '0.1', 'Price = full cost × this')}${f('round_to', 'Round prices up to (KD)', '0.5')}${f('target_min', 'Target price from (KD)', '1')}${f('target_max', 'Target price to (KD)', '1')}${f('planned_sets', 'Planned sets this drop', '1', 'Overheads are spread over these')}${f('pack_size', 'Household pack size', '1')}${f('pack_discount', 'Pack discount (%)', '1', '', true)}
      <label class="row" style="min-height:40px;align-self:center"><input type="checkbox" data-act="incl" ${st.include_overheads ? 'checked' : ''} style="width:18px;height:18px;accent-color:#1C1917"><span>Include overheads in prices</span></label></div>
      <div class="sec card"><h3>Members</h3><p class="small muted" style="margin:0 0 8px">Add or remove people in Supabase → Table Editor → members.</p>${S.d.members.map(m => `<div class="row small" style="min-height:32px">${av(m.email)}${esc(m.name || '')} <span class="muted">${esc(m.email)}</span></div>`).join('')}</div>
      ${DEMO ? '<div class="sec"><button class="btn" data-act="reset">Reset demo data</button></div>' : '<div class="sec"><button class="btn" data-act="signout">Sign out</button></div>'}`;
  }
  const VIEWS = { today: vToday, team: vTeam, plan: vPlan, money: vMoney, expenses: vExpenses, orders: vOrders, pricing: vPricing, drop: vDrop, brand: vBrand, instagram: vInstagram, expos: vExpos, suppliers: vSuppliers, settings: vSettings };

  /* ============================ shell ============================ */
  function navHtml(open) {
    return NAV.map(g => `<div class="grp">${g[0]}</div>` + g[1].map(p => `<button data-tab="${p[0]}" ${p[0] === S.page ? 'aria-current="page"' : ''}>${p[1]}${p[0] === 'today' && open ? `<span class="badge">${open}</span>` : ''}</button>`).join('')).join('');
  }
  function render() {
    if (!S.d) return;
    const st = S.d.settings, open = S.d.todayList.filter(t => !t.done).length;
    const logo = `<div class="logo"><i aria-hidden="true">${esc(String(st.brand_name || 'D').slice(0, 1))}</i><div><b>${esc(st.brand_name || CFG.BRAND_NAME || 'Business HQ')}</b><small>Business HQ</small></div></div>`;
    const who = DEMO ? '<span class="pill gold">Demo mode</span>' : `<span class="dot ${S.live ? 'live' : ''}" aria-hidden="true"></span>${esc(S.me || '')}`;
    const y = window.scrollY;
    $app.innerHTML = `<div class="app"><aside>${logo}<nav aria-label="Sections">${navHtml(open)}</nav><div class="who">${who}</div></aside>
      <div class="wrap"><div class="mob"><div class="top">${logo}<span style="margin-left:auto" class="small muted">${DEMO ? 'Demo' : ''}</span></div><nav aria-label="Sections">${navHtml(open)}</nav></div>
      <main>${DEMO ? '<div class="banner">Demo mode: saved in this browser only, and you play both roles. Add your Supabase details to <b>config.js</b> to share it with your partner (see README).</div>' : ''}${VIEWS[S.page]()}</main></div></div>`;
    window.scrollTo(0, y);
  }
  function renderLogin(msg) {
    $app.innerHTML = `<div class="auth"><h1>${esc(CFG.BRAND_NAME || 'Business HQ')}</h1><p class="muted">Sign in with your email and we’ll send you a link.</p><div class="form" style="grid-template-columns:1fr;text-align:left;margin-top:22px"><div class="field"><label for="l-email">Email</label><input type="email" id="l-email" autocomplete="email"></div><button class="btn solid" data-act="login">Email me a sign-in link</button></div>${msg ? `<p class="small" style="margin-top:14px">${msg}</p>` : ''}</div>`;
  }
  function renderNotMember() { $app.innerHTML = `<div class="auth"><h1>Almost there</h1><p class="muted">${esc(S.me)} isn’t on the members list yet. Add it to the <b>members</b> table in Supabase (see README), then reload.</p><button class="btn" data-act="signout" style="margin-top:16px">Sign out</button></div>`; }

  /* ============================ events ============================ */
  const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const go = p => { S.page = p; try { history.replaceState(null, '', '#' + p); } catch (_) { } render(); window.scrollTo(0, 0); };
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'); if (tab) { go(tab.dataset.tab); return; }
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id, st = S.d && S.d.settings;
    switch (act) {
      case 'login': { const email = v('l-email').trim(); if (!email) return; b.disabled = true; sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }).then(r => renderLogin(r.error ? 'Couldn’t send the link: ' + esc(r.error.message) : `Check <b>${esc(email)}</b> for your sign-in link.`)); return; }
      case 'signout': sb.auth.signOut().then(() => location.reload()); return;
      case 'reset': if (confirm('Clear all demo data?')) { localStorage.removeItem('rd-hq'); refresh({ force: true }); } return;
      case 'snooze': { const tm = new Date(Date.parse(today()) + 864e5).toISOString().slice(0, 10); run(API.upd('tasks', id, { assigned_to: null, scheduled_for: null, snoozed_until: tm }), 'Moved off today’s list', { afterTask: true }); return; }
      case 'addTask': { const t = v('nt-' + b.dataset.ph).trim(); if (!t) return; const n = S.d.tasks.filter(x => x.phase_id === b.dataset.ph).length + 1; run(API.ins('tasks', { phase_id: b.dataset.ph, title: t, sort: n }), 'Task added'); return; }
      case 'delTask': if (confirm('Delete this task?')) run(API.del('tasks', id), 'Task deleted'); return;
      case 'feed': S.ui.feed = b.dataset.v; render(); return;
      case 'addExpense': { const cat = v('e-cat'), kind = (S.d.categories.find(c => c.name === cat) || {}).kind, scope = kind === 'overhead' ? 'general' : (v('e-scope') || 'style');
        const r = { spent_on: v('e-date') || today(), category: cat, scope, style_id: scope === 'style' ? Number(v('e-style')) : null, item: v('e-item').trim(), supplier: v('e-sup').trim(), amount: num(v('e-amt')), sets_covered: kind === 'per_set' && num(v('e-sets')) ? Math.round(num(v('e-sets'))) : null };
        if (!r.amount) { toast('Enter the amount paid.'); return; }
        if (kind === 'per_set' && !r.sets_covered && !confirm('No “sets it covers” entered, so this won’t change prices. Add it anyway?')) return;
        S.ef = { category: r.category, scope: r.scope, style_id: r.style_id, spent_on: r.spent_on }; run(API.ins('expenses', r), 'Expense added'); return; }
      case 'delExpense': if (confirm('Delete this expense?')) run(API.del('expenses', id), 'Expense deleted'); return;
      case 'addOrder': { const r = { ordered_on: v('o-date') || today(), customer: v('o-cust').trim(), channel: v('o-ch'), style_id: Number(v('o-style')), qty: Math.max(1, Math.round(num(v('o-qty')) || 1)), price_charged: num(v('o-price')) || null, discount_pct: num(v('o-disc')), deposit: num(v('o-dep')), embroidery: v('o-emb').trim() };
        if (!r.customer) { toast('Add the customer’s name.'); return; } r.status = r.deposit > 0 ? 'Deposit paid' : 'New'; S.of = { channel: r.channel, ordered_on: r.ordered_on }; run(API.ins('orders', r), 'Order added'); return; }
      case 'delOrder': if (confirm('Delete this order?')) run(API.del('orders', id), 'Order deleted'); return;
      case 'drop': S.ui.drop = Number(b.dataset.i); render(); return;
      case 'useName': run(API.settings({ brand_name: b.dataset.n, brand_ar: b.dataset.ar }), 'Name updated'); return;
      case 'customName': { const n = v('cn').trim(); if (!n) return; run(API.settings({ brand_name: n, brand_ar: v('ca').trim() || st.brand_ar }), 'Name updated'); return; }
      case 'star': { const sl = JSON.parse(JSON.stringify(st.shortlist || {})), mine = sl[S.me] || []; sl[S.me] = mine.includes(b.dataset.n) ? mine.filter(x => x !== b.dataset.n) : mine.concat(b.dataset.n); run(API.settings({ shortlist: sl })); return; }
      case 'igTab': S.ui.ig = b.dataset.v; render(); return;
      case 'pickPost': S.ui.post = Number(b.dataset.v); render(); return;
      case 'copy': { const t = b.dataset.txt, done = () => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); }; try { navigator.clipboard.writeText(t).then(done, done); } catch (_) { done(); } return; }
      case 'addExpo': { const n = v('x-n').trim(); if (!n) return; run(API.ins('expos', { name: n, apply_by: v('x-d') || null, starts: v('x-s') || null, fee: num(v('x-f')), location: v('x-l').trim(), status: 'Researching' }), 'Exhibition added'); return; }
      case 'delExpo': if (confirm('Delete this exhibition?')) run(API.del('expos', id), 'Deleted'); return;
      case 'addSup': { const n = v('c-n').trim(); if (!n) return; run(API.ins('suppliers', { name: n, type: v('c-t'), phone: v('c-p').trim(), quote: num(v('c-q')) || null, notes: v('c-x').trim() }), 'Supplier added'); return; }
      case 'delSup': if (confirm('Delete this supplier?')) run(API.del('suppliers', id), 'Deleted'); return;
    }
  });
  document.addEventListener('change', e => {
    const el = e.target, act = el.dataset && el.dataset.act;
    if (el.dataset && el.dataset.keep) { S.ef = Object.assign(S.ef, { [el.dataset.keep]: el.value, item: v('e-item'), supplier: v('e-sup'), amount: v('e-amt'), sets_covered: v('e-sets'), spent_on: v('e-date') }); render(); return; }
    if (!act) return; const id = el.dataset.id;
    const doneP = c => c ? { done: true, done_by: S.me, done_at: new Date().toISOString() } : { done: false, done_by: null, done_at: null };
    switch (act) {
      case 'taskDone': run(API.upd('tasks', id, doneP(el.checked)), el.checked ? 'Done' : 'Reopened', { afterTask: true }); break;
      case 'planDone': run(API.upd('tasks', id, doneP(el.checked)), el.checked ? 'Done' : 'Reopened', { afterTask: true }); break;
      case 'owner': run(API.upd('tasks', id, { owner: el.value || null }), 'Saved'); break;
      case 'dep': { const dep = num(el.value), o = S.d.orders.find(x => String(x.id) === id), p = { deposit: dep }; if (o && dep > 0 && o.status === 'New') p.status = 'Deposit paid'; run(API.upd('orders', id, p), 'Deposit saved'); break; }
      case 'status': run(API.upd('orders', id, { status: el.value }), 'Status updated'); break;
      case 'override': run(API.override(Number(id), num(el.value)), num(el.value) ? 'Price set' : 'Back to automatic price'); break;
      case 'setting': { let val = num(el.value); if (el.dataset.pct) val = val / 100; run(API.settings({ [el.dataset.k]: val }), 'Settings saved'); break; }
      case 'incl': run(API.settings({ include_overheads: el.checked }), 'Settings saved'); break;
      case 'post': run(API.upd('ig_posts', id, { [el.dataset.k]: el.value || (el.dataset.k === 'post_date' ? null : '') }), 'Saved'); break;
      case 'bio': run(API.settings({ ig_bio: el.value }), 'Bio saved'); break;
      case 'check': run(API.upd('checklist', id, el.checked ? { done: true, done_by: S.me, done_at: new Date().toISOString() } : { done: false, done_by: null, done_at: null })); break;
      case 'expoSt': run(API.upd('expos', id, { status: el.value }), 'Status updated'); break;
      case 'chosen': run(API.upd('suppliers', id, { chosen: el.checked }), 'Saved'); break;
    }
  });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (S.dirty && !(a && a.closest && a.closest('.form'))) { S.dirty = false; render(); } }, 0));
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'l-email') document.querySelector('[data-act="login"]').click(); if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('nt-')) { const btn = e.target.parentNode.querySelector('[data-act="addTask"]'); if (btn) btn.click(); } });

  /* ============================ start ============================ */
  async function start() {
    if (DEMO) { S.me = 'you@demo'; await refresh({ force: true }); return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    const user = data.session && data.session.user; S.me = user && user.email;
    sb.auth.onAuthStateChange((_e, session) => { const em = session && session.user && session.user.email; if (em !== S.me) location.reload(); });
    if (!S.me) { renderLogin(); return; }
    await refresh({ force: true });
    let t = null; const bump = () => { clearTimeout(t); t = setTimeout(() => refresh(), 400); };
    const ch = sb.channel('hq');
    ['expenses', 'orders', 'settings', 'price_overrides', 'tasks', 'expos', 'checklist', 'suppliers', 'ig_posts', 'activity'].forEach(tb => ch.on('postgres_changes', { event: '*', schema: 'public', table: tb }, bump));
    ch.subscribe(status => { S.live = status === 'SUBSCRIBED'; render(); });
    // a new day: refresh at Kuwait midnight-ish so the feed hands out the new batch
    let lastDay = today(); setInterval(() => { if (today() !== lastDay) { lastDay = today(); refresh(); } }, 60000);
  }
  start();
})();
