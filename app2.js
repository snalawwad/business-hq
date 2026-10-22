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
    ['Your day', [['today', 'Today'], ['plan', 'Launch plan']]],
    ['Money', [['money', 'Overview'], ['expenses', 'Expenses'], ['orders', 'Orders']]],
    ['Product', [['drop', 'Ramadan drop'], ['stock', 'Inventory'], ['kit', 'Brand kit'], ['instagram', 'Instagram']]],
    ['Selling', [['expos', 'Exhibitions'], ['suppliers', 'Suppliers'], ['settings', 'Settings']]]
  ];
  const PAGES = NAV.flatMap(g => g[1].map(p => p[0])).concat(['team', 'pricing']);
  const ALIAS = { team: 'today', pricing: 'money' };

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

  const S = { page: PAGES.includes(location.hash.slice(1)) ? ({ team: 'today', pricing: 'money' }[location.hash.slice(1)] || location.hash.slice(1)) : 'today', me: null, live: false, d: null, busy: false, ef: {}, of: {}, ui: { drop: 0, ig: 'grid', post: 1, feed: 'all' }, lastOpen: null };

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
      let reviews = [], stock = []; try { const r1 = await sb.from('weekly_reviews').select('*').order('week_start', { ascending: false }); if (!r1.error) reviews = r1.data || []; const r2 = await sb.from('stock').select('*'); if (!r2.error) stock = r2.data || []; } catch (_) { }
      let assets = []; try { const a = await sb.from('assets').select('*').order('created_at', { ascending: false }); if (!a.error) assets = a.data || []; else S.noKit = true; } catch (_) { S.noKit = true; }
      return { settings, styles, categories, members, phases, tasks, expenses, pricing, orders, summary, spend, expos, checklist, suppliers, posts, activity, assets, reviews, stock, todayList: pull.data || [] };
    },
    async upload(slot, file) {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80), path = `${slot}/${Date.now()}-${safe}`;
      const up = await sb.storage.from('brand').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (up.error) return up;
      return sb.from('assets').insert({ slot, name: file.name, path, mime: file.type || '', size: file.size });
    },
    setStock: (style_id, size, color, qty) => sb.from('stock').upsert({ style_id, size, color, qty, updated_at: new Date().toISOString() }, { onConflict: 'style_id,size,color' }),
    async removeAsset(a) { await sb.storage.from('brand').remove([a.path]); return sb.from('assets').delete().eq('id', a.id); },
    async urls(paths) { if (!paths.length) return {}; const r = await sb.storage.from('brand').createSignedUrls(paths, 3600); const o = {}; (r.data || []).forEach(x => { if (x.signedUrl) o[x.path] = x.signedUrl; }); return o; },
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
    categories: [['Fabric', 'per_set'], ['Sewing', 'per_set'], ['Embroidery', 'per_set'], ['Trims & buttons', 'per_set'], ['Labels & packaging', 'per_set'], ['Delivery', 'per_set'], ['Samples', 'overhead'], ['Exhibition', 'overhead'], ['Booth display', 'overhead'], ['Photoshoot', 'overhead'], ['License & bank', 'overhead'], ['Marketing', 'overhead'], ['Other', 'overhead']].map((c, i) => ({ name: c[0], kind: c[1], sort: i })),
    phases: [['p1', 'Brand, license & bank', '2026-10-26', '2026-11-22'], ['p2', 'Tailor quotes & samples', '2026-11-02', '2026-12-06'], ['p3', 'Exhibition applications', '2026-11-16', '2026-12-20'], ['p4', 'Photoshoot', '2026-12-07', '2026-12-13'], ['p5', 'Instagram launch', '2026-12-01', '2027-01-04'], ['p6', 'Production', '2026-12-21', '2027-01-24'], ['p7', 'Pre-orders', '2027-01-05', '2027-01-25'], ['p8', 'Exhibitions & sales', '2027-01-18', '2027-02-07'], ['p9', 'Ramadan', '2027-02-08', '2027-02-14']].map((p, i) => ({ id: p[0], name: p[1], starts: p[2], ends: p[3], sort: i + 1 })),
    tasks: { p1: ['Pick the final brand name', 'Reserve the Instagram and TikTok handles', 'Ask MOCI which license fits clothing sales', 'Apply for the license', 'Open a business bank account', 'Get bank approval for online payments', 'Set up a payment link provider'], p2: ['Shortlist 3 tailors and 1 embroidery shop', 'Send the Ramadan drop specs to each tailor', 'Get quotes at 20, 50 and 100 sets', 'Buy fabric swatches in cream, sand and taupe', 'Wash-test the swatches 5 times at 40°C', 'Order one sample of each set in size M', 'Fit the samples on a real household worker', 'Approve final changes with the tailor', 'Digitize the logo for embroidery'], p3: ['List Ramadan exhibitions and their deadlines', 'Write the bilingual brand blurb', 'Prepare 5–8 real product photos', 'Send the exhibition applications'], p4: ['Book a photographer and models', 'Shoot front, back and side of each set', 'Shoot in-use scenes: serving, carrying, iftar table', 'Shoot close-ups: piping, embroidery, fabric'], p5: ['Set up profile picture, bio and highlight covers', 'Post the first 3 teaser posts', 'Run a color poll in stories', 'Post the full 9-post grid'], p6: ['Book tailor capacity in writing', 'Order the first stock', 'Order labels, hang tags and packaging', 'Quality-check every piece', 'Pack sets with tags and thank-you cards'], p7: ['Open pre-orders with the early-bird offer', 'Announce the last order date', 'Confirm every deposit in Orders'], p8: ['Pack the booth kit', 'Collect WhatsApp numbers at the booth', 'Follow up every booth contact within 48 hours'], p9: ['Deliver the last orders', 'Share customer photos from iftars', 'Send restock alerts for what sold out'] },
    checklist: [['booth', 'Clothing rail and hangers'], ['booth', 'Mannequin in the Tie Top set'], ['booth', 'Full size run and a mirror'], ['booth', 'Swatch and embroidery board'], ['booth', 'Price and pack-offer sign (AR/EN)'], ['booth', 'Order forms, tape measure, size chart'], ['booth', 'Card machine or payment QR'], ['booth', 'Instagram and WhatsApp QR'], ['booth', 'Lantern and tray props'], ['ig_weeks', 'Week 1 · Tease', 'Profile, bio, highlights · 3 teaser posts · color poll'], ['ig_weeks', 'Week 2 · Reveal', 'Lookbook carousel · 2 reels of the sets in use · size guide highlight'], ['ig_weeks', 'Week 3 · Pre-orders', 'Early-bird post · countdown sticker · first customer story'], ['ig_weeks', 'Week 4 · Exhibition', 'Booth location post · daily booth stories · try-on reel'], ['ig_weeks', 'Ramadan · Proof', 'Customer photos · thank-you posts · restock alerts']],
    posts: [['announce', 'Coming this Ramadan: uniforms your household team will love wearing.'], ['product', 'The Tie Top set: mandarin collar, gold piping, straight pants.'], ['detail', 'Gold piping on every collar and cuff.'], ['bts', 'At the tailor: first samples, first fittings.'], ['quote', 'Hospitality is the first gift you give a guest.'], ['product', 'The Kimono Hosting set, for iftar and ghabga nights.'], ['detail', 'Your family initials, embroidered.'], ['offer', 'Household packs of 3, embroidery included.'], ['announce', 'Pre-orders open. Last order date in stories.']]
  };
  const DETAILS = {"Pick the final brand name": "Shortlist 3 names together, check each is free on Instagram and as a MOCI trade name, then pick one. Done when: one name agreed by both of you.", "Reserve the Instagram and TikTok handles": "Create both accounts with the same handle (e.g. name.kw), set to Business. Done when: both handles are yours.", "Ask MOCI which license fits clothing sales": "Call 135 or visit the Kuwait Business Center. Ask: home business vs freelance license, and whether a private-sector job affects it. Done when: you know which license to apply for.", "Apply for the license": "Apply through Sahel Business with civil ID and the activity MOCI confirmed. Done when: the application is submitted.", "Open a business bank account": "Book an appointment with your bank; bring civil ID and the license. Done when: account number received.", "Get bank approval for online payments": "Ask the bank for a written OK to receive payment-link payouts. Done when: approval letter or email received.", "Set up a payment link provider": "Compare 2 providers (fees, payout days), sign up with the business account. Done when: a test KD 1 payment reaches your account.", "Shortlist 3 tailors and 1 embroidery shop": "Ask 5 friends for tailors, visit 3 in Mubarakiya/Hawally/Salmiya. Add each to Suppliers. Done when: 3 tailors + 1 embroidery shop saved with phone numbers.", "Send the Ramadan drop specs to each tailor": "Share the Ramadan drop page (screenshots) on WhatsApp. Done when: all 3 tailors have the specs.", "Get quotes at 20, 50 and 100 sets": "Ask each tailor for price per set at each quantity and lead time. Done when: every quote is logged in Suppliers.", "Buy fabric swatches in cream, sand and taupe": "Buy 0.5 m of 2–3 fabrics per color. Log the cost as a Samples expense. Done when: swatches in hand.", "Wash-test the swatches 5 times at 40°C": "Wash, dry, iron 5 times; check shrinking, fading, creasing. Done when: you pick the winning fabric.", "Order one sample of each set in size M": "Give the chosen tailor the winning fabric. Done when: 5 samples ordered with a pickup date.", "Fit the samples on a real household worker": "Ask her to wear each for an hour of normal work; note what is tight, hot or awkward. Done when: a list of changes per set.", "Approve final changes with the tailor": "Go through the change list; agree price, deadline and defect policy in writing. Done when: tailor confirms on WhatsApp.", "Digitize the logo for embroidery": "Send the logo file (Brand kit) to the embroidery shop. Done when: you have the DST/PES file and a stitched test.", "List Ramadan exhibitions and their deadlines": "Search Instagram for Ramadan bazaars (معارض رمضان), ask friends. Add each on Exhibitions with fee and deadline. Done when: at least 5 listed.", "Write the bilingual brand blurb": "2–3 sentences in Arabic and English: who it is for, what is special, price range. Done when: both of you approve it.", "Prepare 5–8 real product photos": "Photograph the samples on a person in daylight against a plain wall. Done when: 5–8 photos uploaded to Brand kit → Product photos.", "Send the exhibition applications": "Apply to your top 2–3. Mark each \"Applied\" on Exhibitions. Done when: all applications sent.", "Book a photographer and models": "Get 2 quotes, book a half-day. Get written consent from models. Done when: date and price confirmed.", "Shoot front, back and side of each set": "Plain background, natural light, same angle for every set. Done when: 3 shots per set uploaded.", "Shoot in-use scenes: serving, carrying, iftar table": "Real home, real tasks: tray, dallah, holding a child's hand. Done when: 6+ lifestyle shots uploaded.", "Shoot close-ups: piping, embroidery, fabric": "Macro shots of each detail. Done when: 5+ close-ups uploaded.", "Set up profile picture, bio and highlight covers": "Use the logo from Brand kit as the profile picture; write the bio; make 5 highlight covers. Done when: profile looks finished.", "Post the first 3 teaser posts": "Behind the scenes, fabric swatches, a sketch. Done when: 3 posts live.", "Run a color poll in stories": "Ask followers which color they want first. Done when: poll ran 24 h and you noted the winner.", "Post the full 9-post grid": "Use the Instagram planner. Done when: 9 posts live.", "Book tailor capacity in writing": "Confirm how many sets per week they can do in January and the final delivery date. Done when: written confirmation.", "Order the first stock": "Deepest in the Tie Top set, sizes M and L. Pay the deposit and log it in Expenses. Done when: order placed.", "Order labels, hang tags and packaging": "Neck labels, care labels, hang tags, bags, thank-you cards. Log in Expenses. Done when: ordered with a delivery date.", "Quality-check every piece": "Check seams, piping, embroidery spelling, measurements. Done when: every piece passed or sent back.", "Pack sets with tags and thank-you cards": "One set per bag with tag and card. Done when: all stock packed and counted.", "Open pre-orders with the early-bird offer": "Post the offer and how to order on WhatsApp. Done when: post live and first enquiry answered.", "Announce the last order date": "Post and pin a story with the date. Done when: announced.", "Confirm every deposit in Orders": "Match each payment to an order. Done when: every order shows the right deposit.", "Pack the booth kit": "Tick everything on Exhibitions → Booth kit. Done when: all items ticked.", "Collect WhatsApp numbers at the booth": "Ask every visitor who likes a set. Done when: numbers saved in one list.", "Follow up every booth contact within 48 hours": "Send photos, prices and the order link. Done when: every contact messaged.", "Deliver the last orders": "Done when: every order is marked Delivered.", "Share customer photos from iftars": "Ask happy customers for photos (with permission). Done when: 3+ shared.", "Send restock alerts for what sold out": "Done when: alert posted and waitlist messaged."};
  function demoFresh() {
    const t = []; Object.entries(SEED.tasks).forEach(([ph, list]) => list.forEach((title, i) => t.push({ id: uid(), phase_id: ph, title, details: DETAILS[title] || '', sort: i + 1, owner: null, assigned_to: null, scheduled_for: null, snoozed_until: null, rolled_over: 0, done: false, done_by: null, done_at: null, created_at: new Date().toISOString() })));
    return {
      settings: { id: 1, budget: 1500, multiplier: 2.5, round_to: 1, pack_size: 3, pack_discount: 0.1, planned_sets: 100, include_overheads: true, target_min: 14, target_max: 20, tasks_per_day: 3, brand_name: 'myuniform.kw', brand_ar: '', ig_bio: 'Ramadan uniforms for your household team · Kuwait\nFamily embroidery · Household packs\nOrder on WhatsApp ↓', shortlist: {} },
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
    const pricing = (db.styles || SEED.styles).filter(s => s.active !== false).map(s => {
      const breakdown = {}; let direct = 0;
      cats.filter(c => c.kind === 'per_set').forEach(c => { const v = avg(ex.filter(e => e.category === c.name && e.scope === 'style' && Number(e.style_id) === s.id && num(e.sets_covered) > 0)) + avg(ex.filter(e => e.category === c.name && e.scope === 'all_styles' && num(e.sets_covered) > 0)); breakdown[c.name] = v; direct += v; });
      const has = ex.some(e => kind(e.category) === 'per_set' && e.scope === 'style' && Number(e.style_id) === s.id && num(e.sets_covered) > 0);
      const full = direct + ohPer, sug = has && full > 0 ? Math.ceil(full * st.multiplier / r) * r : 0, ov = num(db.overrides[s.id]) || null, fp = ov || sug;
      return { style_id: s.id, name: s.name, sort: s.sort, target_price: s.target_price, breakdown, direct_cost: direct, overhead_per_set: ohPer, full_cost: full, suggested_price: sug, price_override: ov, final_price: fp, profit_per_set: fp ? fp - full : 0, margin: fp ? (fp - full) / fp : 0, pack_price: fp ? Math.ceil(fp * st.pack_size * (1 - st.pack_discount) / r) * r : 0, max_cost_for_target: s.target_price / (st.multiplier || 1), range_status: !fp ? 'no costs yet' : fp < st.target_min ? 'below range' : fp > st.target_max ? 'above range' : 'in range', has_costs: has };
    });
    const orders = db.orders.map(o => { const p = pricing.find(x => x.style_id === Number(o.style_id)) || { final_price: 0, full_cost: 0 }; const per = num(o.price_charged) || p.final_price, tot = per * o.qty * (1 - num(o.discount_pct) / 100); return Object.assign({}, o, { style_name: ((db.styles || SEED.styles).find(s => s.id === Number(o.style_id)) || {}).name, price_per_set: per, order_total: tot, balance_due: tot - num(o.deposit), cost_of_goods: p.full_cost * o.qty, profit: tot - p.full_cost * o.qty }); }).sort((a, b) => b.ordered_on.localeCompare(a.ordered_on));
    const live = orders.filter(o => o.status !== 'Cancelled'), sum = f => live.reduce((a, o) => a + num(o[f]), 0), spent = ex.reduce((a, e) => a + num(e.amount), 0), sets = sum('qty'), profit = sum('profit'), rev = sum('order_total');
    const summary = { budget: st.budget, spent, budget_left: st.budget - spent, budget_used: st.budget ? spent / st.budget : 0, revenue: rev, collected: sum('deposit'), owed: sum('balance_due'), profit, sets_sold: sets, orders: live.length, net_position: rev - spent, avg_profit_per_set: sets ? profit / sets : 0, sets_to_break_even: sets && profit > 0 ? Math.max(0, Math.ceil((spent - rev) / (profit / sets))) : null };
    const spend = cats.map(c => ({ category: c.name, kind: c.kind, spent: ex.filter(e => e.category === c.name).reduce((a, e) => a + num(e.amount), 0) })).sort((a, b) => b.spent - a.spent);
    return { pricing, orders, summary, spend };
  }
  const Local = {
    async load() {
      const db = db0(); db.assets = db.assets || []; db.settings.palette = db.settings.palette || []; const todayList = demoPull(db); store.set(db);
      if (!db.styles) db.styles = JSON.parse(JSON.stringify(SEED.styles));
      return Object.assign({ settings: db.settings, styles: db.styles, categories: SEED.categories, members: db.members, phases: SEED.phases, tasks: db.tasks, expenses: db.expenses.slice().sort((a, b) => b.spent_on.localeCompare(a.spent_on)), expos: db.expos, checklist: db.checklist, suppliers: db.suppliers, posts: db.posts.slice().sort((a, b) => a.position - b.position), activity: db.activity.slice(0, 300), assets: db.assets.slice().reverse(), reviews: (db.reviews || []).slice().sort((a, b) => b.week_start.localeCompare(a.week_start)), stock: db.stock || [], todayList }, compute(db));
    },
    async ins(t, row) {
      const db = db0(), key = { ig_posts: 'posts', weekly_reviews: 'reviews' }[t] || t; const r = Object.assign({ id: uid(), created_by: S.me, created_at: new Date().toISOString() }, row);
      if (t === 'tasks') Object.assign(r, { done: false, rolled_over: 0, sort: r.sort == null ? 100 : r.sort });
      if (!db[key]) db[key] = [];
      if (t === 'weekly_reviews') logLocal(db, 'review', 'planned', 'Week of ' + day(r.week_start));
      if (t === 'styles') { db.styles = db.styles || JSON.parse(JSON.stringify(SEED.styles)); r.id = Math.max(0, ...db.styles.map(x => x.id)) + 1; }
      db[key].push(r);
      if (t === 'tasks') logLocal(db, 'task', 'added', r.title);
      if (t === 'expenses') logLocal(db, 'expense', 'added', r.item || r.category, 'KD ' + r.amount + ' · ' + r.category);
      if (t === 'orders') logLocal(db, 'order', 'added', r.customer, r.qty + ' set(s)');
      if (t === 'expos') logLocal(db, 'expo', 'added', r.name);
      if (t === 'suppliers') logLocal(db, 'supplier', 'added', r.name, r.type);
      store.set(db); return {};
    },
    async upd(t, id, p) {
      const db = db0(), key = { ig_posts: 'posts', weekly_reviews: 'reviews' }[t] || t; if (t === 'styles') db.styles = db.styles || JSON.parse(JSON.stringify(SEED.styles)); const r = (db[key] || []).find(x => String(x.id) === String(id)); if (!r) return {};
      const old = Object.assign({}, r); Object.assign(r, p);
      if (t === 'tasks') { if (p.assigned_to && old.assigned_to && p.assigned_to !== old.assigned_to) logLocal(db, 'task', 'handed over', r.title, 'to ' + p.assigned_to); if (r.done && !old.done) logLocal(db, 'task', 'completed', r.title); else if (!r.done && old.done) logLocal(db, 'task', 'reopened', r.title); else if (p.snoozed_until) logLocal(db, 'task', 'postponed', r.title); }
      if (t === 'orders' && p.status && p.status !== old.status) { logLocal(db, 'order', 'moved', r.customer, old.status + ' → ' + p.status); const sk = (db.stock || []).find(x => x.style_id === Number(r.style_id) && x.size === r.size && x.color === r.color); if (sk && p.status === 'Delivered') sk.qty -= num(r.qty); if (sk && old.status === 'Delivered') sk.qty += num(r.qty); }
      if (t === 'checklist' && r.done && !old.done) logLocal(db, 'checklist', 'ticked', r.title);
      if (t === 'expos' && p.status && p.status !== old.status) logLocal(db, 'expo', 'moved', r.name, old.status + ' → ' + p.status);
      if (t === 'suppliers' && r.chosen && !old.chosen) logLocal(db, 'supplier', 'chose', r.name);
      store.set(db); return {};
    },
    async del(t, id) { const db = db0(), key = { ig_posts: 'posts', weekly_reviews: 'reviews' }[t] || t; const r = (db[key] || []).find(x => String(x.id) === String(id)); db[key] = (db[key] || []).filter(x => String(x.id) !== String(id)); if (r && t === 'tasks') logLocal(db, 'task', 'deleted', r.title); if (r && t === 'expenses') logLocal(db, 'expense', 'deleted', r.item || r.category, 'KD ' + r.amount); if (r && t === 'orders') logLocal(db, 'order', 'deleted', r.customer); store.set(db); return {}; },
    async upload(slot, file) {
      if (file.size > 1.5e6) return { error: { message: 'Demo mode keeps files under 1.5 MB. Connect Supabase for bigger files.' } };
      const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const db = db0(); db.assets = db.assets || []; db.assets.push({ id: uid(), slot, name: file.name, path: url, mime: file.type || '', size: file.size, created_by: S.me, created_at: new Date().toISOString() });
      logLocal(db, 'asset', 'uploaded', file.name, slot); store.set(db); return {};
    },
    async removeAsset(a) { const db = db0(); db.assets = (db.assets || []).filter(x => x.id !== a.id); logLocal(db, 'asset', 'removed', a.name, a.slot); store.set(db); return {}; },
    async urls(paths) { const o = {}; paths.forEach(p => o[p] = p); return o; },
    async setStock(style_id, size, color, qty) { const db = db0(); db.stock = db.stock || []; const r = db.stock.find(x => x.style_id === style_id && x.size === size && x.color === color); if (r) r.qty = qty; else db.stock.push({ id: uid(), style_id, size, color, qty, low_at: 3 }); store.set(db); return {}; },
    async override(sid, price) { const db = db0(); if (price > 0) db.overrides[sid] = price; else delete db.overrides[sid]; store.set(db); return {}; },
    async settings(p) { const db = db0(); Object.assign(db.settings, p); logLocal(db, 'setting', 'changed', 'Settings'); store.set(db); return {}; }
  };
  const API = DEMO ? Local : Remote;

  async function refresh(opts = {}) {
    try {
      const before = S.d ? S.d.todayList.filter(t => !t.done).length : null;
      const d = await API.load();
      S.d = d; S.urls = S.urls || {};
      const need = (d.assets || []).filter(a => /^image\//.test(a.mime) && !S.urls[a.path]).map(a => a.path);
      if (need.length) { try { Object.assign(S.urls, await API.urls(need)); } catch (_) { } }
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
  function partner() { return others()[0]; }
  const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
  function weekStart(d = today()) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10); }
  function currentPhase() { const t = today(), ph = S.d.phases; return ph.find(p => p.starts <= t && p.ends >= t) || ph.find(p => p.starts > t) || ph[ph.length - 1]; }
  function gates() {
    const d = S.d, find = title => d.tasks.find(x => x.title.toLowerCase() === title.toLowerCase());
    const T = title => { const x = find(title); return { ok: !!(x && x.done), label: title, task: x }; };
    const C = (ok, label, go) => ({ ok, label, go });
    const sets = d.pricing, stockTotal = (d.stock || []).reduce((a, x) => a + Math.max(0, num(x.qty)), 0);
    const list = [
      ['Brand & license ready', 'You can legally sell and take payments.', [T('Pick the final brand name'), T('Apply for the license'), T('Open a business bank account'), T('Set up a payment link provider')]],
      ['Samples approved', 'Never order stock before a real person has worn the sample for a day.', [C(d.suppliers.some(x => x.type === 'Tailor' && x.chosen), 'Choose your tailor in Suppliers', 'suppliers'), T('Wash-test the swatches 5 times at 40°C'), T('Fit the samples on a real household worker'), T('Approve final changes with the tailor')]],
      ['Prices inside your range', `Every set must sell between ${num(d.settings.target_min)} and ${num(d.settings.target_max)} KD and still make money.`, [C(sets.length && sets.every(p => p.has_costs), 'Log fabric and sewing costs for every set', 'expenses'), C(sets.length && sets.every(p => p.range_status === 'in range'), 'Get every set’s price inside your range', 'money')]],
      ['Exhibition booked', 'One booked exhibition gives you a launch date to work towards.', [C(d.expos.some(x => ['Accepted', 'Paid', 'Done'].includes(x.status)), 'Get accepted to at least one exhibition', 'expos')]],
      ['Instagram live', 'People need somewhere to see the sets and order.', [T('Set up profile picture, bio and highlight covers'), T('Post the full 9-post grid')]],
      ['Stock ready', 'Enough checked, packed stock to sell from day one.', [T('Order the first stock'), C(stockTotal > 0, 'Enter your stock in Inventory', 'stock'), T('Quality-check every piece')]],
      ['Open for orders', 'Money coming in.', [T('Open pre-orders with the early-bird offer'), C(d.orders.length > 0, 'Take your first order', 'orders')]]
    ];
    let cur = -1;
    return list.map(([name, why, checks], i) => { const done = checks.every(c => c.ok); let state = done ? 'done' : 'todo'; if (!done && cur < 0) { cur = i; state = 'current'; } else if (!done) state = 'locked'; return { name, why, checks, state, n: i + 1 }; });
  }
  function pmNotes() {
    const d = S.d, t = today(), notes = [], tasks = d.tasks, ph = d.phases, p2 = partner();
    const A = (label, attrs) => ({ label, attrs });
    const nameP = p2 ? nameOf(p2.email) : 'your partner';
    ph.forEach(p => {
      const list = tasks.filter(x => x.phase_id === p.id); if (!list.length || t < p.starts) return;
      const done = list.filter(x => x.done).length, total = list.length, left = total - done;
      const span = Math.max(1, daysBetween(p.starts, p.ends)), exp = Math.min(1, daysBetween(p.starts, t) / span), daysLeft = daysBetween(t, p.ends);
      if (t > p.ends && left) notes.push({ lvl: 'r', html: `<b>${esc(p.name)}</b> is overdue: ${left} task${left === 1 ? '' : 's'} left. Finish these before anything new.`, actions: [A('Show tasks', `data-go="plan"`)] });
      else if (left && done / total + 0.2 < exp) notes.push({ lvl: 'a', html: `<b>${esc(p.name)}</b> is behind: ${done}/${total} done with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left. Do about ${Math.ceil(left / Math.max(1, daysLeft / 2))} tasks every 2 days to catch up.`, actions: [A('Show tasks', `data-go="plan"`)] });
    });
    tasks.filter(x => !x.done && x.assigned_to && (x.rolled_over || 0) >= 2).forEach(x => {
      if (isMe(x.assigned_to)) notes.push({ lvl: 'a', html: `“${esc(x.title)}” has been on your list for ${x.rolled_over + 1} days. Do it first today, or hand it over.`, actions: p2 ? [A(`Give to ${esc(nameP)}`, `data-act="reassign" data-id="${esc(x.id)}" data-to="${esc(p2.email)}"`), A('Not today', `data-act="snooze" data-id="${esc(x.id)}"`)] : [A('Not today', `data-act="snooze" data-id="${esc(x.id)}"`)] });
      else notes.push({ lvl: 'a', html: `“${esc(x.title)}” has been on ${esc(nameOf(x.assigned_to))}’s list for ${x.rolled_over + 1} days.`, actions: [A('Take it over', `data-act="reassign" data-id="${esc(x.id)}" data-to="${esc(S.me)}"`)] });
    });
    const s = d.summary || {};
    if (num(s.budget_used) >= 0.8) notes.push({ lvl: num(s.budget_used) >= 1 ? 'r' : 'a', html: `Budget ${pct(s.budget_used)} used, ${kd(s.budget_left)} left. Check the biggest costs before buying more.`, actions: [A('Review expenses', `data-go="expenses"`)] });
    d.pricing.filter(p => p.range_status === 'above range').forEach(p => notes.push({ lvl: 'a', html: `<b>${esc(p.name)}</b> would sell at ${kd(p.final_price)}, above ${num(d.settings.target_min)}–${num(d.settings.target_max)} KD. Get its cost down to ${kd(p.max_cost_for_target)} a set or set a capped price.`, actions: [A('Open pricing', `data-go="pricing"`)] }));
    d.expos.filter(x => x.apply_by && x.status === 'Researching' && daysBetween(t, x.apply_by) <= 10 && daysBetween(t, x.apply_by) >= 0).forEach(x => notes.push({ lvl: 'r', html: `Apply to <b>${esc(x.name)}</b> by ${day(x.apply_by)}, ${daysBetween(t, x.apply_by)} days left.`, actions: [A('Mark as applied', `data-act="expoApplied" data-id="${esc(x.id)}"`)] }));
    d.orders.filter(o => o.status === 'New' && daysBetween(o.ordered_on, t) >= 3).forEach(o => notes.push({ lvl: 'a', html: `${esc(o.customer)}’s order has waited ${daysBetween(o.ordered_on, t)} days. Message her for the deposit.`, actions: [A('Deposit received', `data-act="orderStatus" data-id="${esc(o.id)}" data-v="Deposit paid"`)] }));
    d.orders.filter(o => o.status === 'Delivered' && num(o.balance_due) > 0).forEach(o => notes.push({ lvl: 'r', html: `Collect ${kd(o.balance_due)} from ${esc(o.customer)}. Delivered but not fully paid.`, actions: [A('Mark fully paid', `data-act="markPaid" data-id="${esc(o.id)}" data-v="${num(o.order_total)}"`)] }));
    const started = id => { const p = ph.find(x => x.id === id); return p && t >= p.starts; };
    if (started('p2') && !d.suppliers.some(x => x.type === 'Tailor')) notes.push({ lvl: 'a', html: 'No tailors saved yet. Add the first one you talk to, with their quote.', actions: [A('Add a tailor', `data-go="suppliers"`)] });
    if (started('p3') && !d.expos.length) notes.push({ lvl: 'a', html: 'No exhibitions listed yet. Add the ones you’re considering so deadlines don’t slip.', actions: [A('Add exhibition', `data-go="expos"`)] });
    if (!(d.assets || []).some(a => a.slot === 'logo')) notes.push({ lvl: 'i', html: 'Upload your logo to the Brand kit so you both use the same file with tailors and printers.', actions: [A('Open Brand kit', `data-go="kit"`)] });
    if (!d.expenses.length) notes.push({ lvl: 'i', html: 'Log your first expense, even small ones like swatches, so prices stay accurate.', actions: [A('Add expense', `data-go="expenses"`)] });
    if (p2) { const ws = weekStats(p2.email); const link = location.origin + location.pathname; const msg = `Hey ${nameP}! Your tasks for today are waiting in Business HQ: ${link}`;
      if (!ws.lastSeen) notes.push({ lvl: 'i', html: `${esc(nameP)} hasn’t opened the HQ yet.`, actions: [A('Copy invite message', `data-act="copy" data-txt="${esc(msg)}"`)] });
      else if (daysBetween(kwDate(new Date(ws.lastSeen)), t) >= 2) notes.push({ lvl: 'a', html: `${esc(nameP)} hasn’t been active for ${daysBetween(kwDate(new Date(ws.lastSeen)), t)} days.`, actions: [A('Copy reminder', `data-act="copy" data-txt="${esc(msg)}"`)] }); }
    if (!(d.reviews || []).some(r => r.week_start === weekStart() && isMe(r.author))) notes.push({ lvl: new Date().getDay() === 0 ? 'r' : 'a', html: 'You haven’t planned this week yet. It takes 2 minutes: wins, what’s stuck, and 3 goals.', actions: [A('Plan my week', `data-act="openReview"`)] });
    (d.stock || []).filter(x => num(x.qty) <= num(x.low_at || 3) && num(x.qty) >= 0 && activeStyles().some(st => st.id === x.style_id)).slice(0, 3).forEach(x => notes.push({ lvl: num(x.qty) <= 0 ? 'r' : 'a', html: `${num(x.qty) <= 0 ? 'Out of stock' : 'Only ' + num(x.qty) + ' left'}: ${esc(styleName(x.style_id).replace(' set', ''))}, ${esc(x.size)}, ${esc(x.color)}.`, actions: [A('Open inventory', `data-go="stock"`)] }));
    const rank = { r: 0, a: 1, i: 2 };
    return notes.sort((x, y) => rank[x.lvl] - rank[y.lvl]);
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


  /* ---------- visual helpers ---------- */
  const ICONS = {
    today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    plan: '<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18" cy="6" r="2"/><circle cx="15" cy="18" r="2"/>',
    money: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    expenses: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    orders: '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    pricing: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    drop: '<path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7z"/>',
    stock: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    kit: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    brand: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/>',
    expos: '<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/>',
    suppliers: '<path d="M3 7h13v10H3zM16 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };
  const ARR = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';
  // tiles: [{t, v, d}] — first tile dark
  const tiles = list => `<div class="tiles">${list.map((x, i) => `<div class="tile ${i === 0 ? 'dark' : ''}"><div class="t">${x.t}</div><div class="d">${x.dir ? `<span class="tri ${x.dir}">${x.dir === 'up' ? '▲' : '▼'}</span>` : ''}${x.d || '&nbsp;'}</div><div class="v">${x.v}</div>${ARR}</div>`).join('')}</div>`;
  function areaChart(series, labels, fmt) {
    // series: [{name, color, fill, values:[]}]
    const W = window.innerWidth < 600 ? 380 : 640, H = window.innerWidth < 600 ? 220 : 230, L = 44, R = 12, T = 16, B = 30, n = labels.length;
    const max = Math.max(1, ...series.flatMap(s => s.values)) * 1.15;
    const X = i => L + (n <= 1 ? 0 : i * (W - L - R) / (n - 1)), Y = v => T + (H - T - B) * (1 - v / max);
    const path = vals => vals.map((v, i) => { if (!i) return `M${X(0)} ${Y(v)}`; const x0 = X(i - 1), x1 = X(i), cx = (x0 + x1) / 2; return `C${cx} ${Y(vals[i - 1])} ${cx} ${Y(v)} ${x1} ${Y(v)}`; }).join(' ');
    const ticks = [0, .25, .5, .75, 1].map(f => max / 1.15 * f);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} over time">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#E2E2E7"/><text x="${L - 10}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#8A8A94">${esc(fmt(t))}</text>`).join('')}
      ${labels.map((l, i) => (n <= (W < 500 ? 4 : 8) || i % Math.ceil(n / (W < 500 ? 4 : 8)) === 0) ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#8A8A94">${esc(l)}</text>` : '').join('')}
      ${series.map(s => s.fill ? `<path d="${path(s.values)} L${X(n - 1)} ${Y(0)} L${X(0)} ${Y(0)}Z" fill="${s.fill}"/>` : '').join('')}
      ${series.map(s => `<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2"/>`).join('')}
      ${(() => { const s = series.find(x => x.fill) || series[0]; const m = Math.max(...s.values); if (!m) return ''; const i = s.values.indexOf(m), x = X(i), y = Y(m), lab = fmt(m), w = 12 + lab.length * 8; return `<rect x="${x - w / 2}" y="${y - 30}" width="${w}" height="22" rx="11" fill="#232326"/><text x="${x}" y="${y - 15}" text-anchor="middle" font-size="12" fill="#fff" font-family="Urbanist, sans-serif">${esc(lab)}</text>`; })()}
    </svg>`;
  }
  function donut(parts, center, sub) {
    const R = 70, C = 2 * Math.PI * R, tot = Math.max(1e-9, parts.reduce((a, p) => a + p.v, 0)); let off = 0;
    return `<svg viewBox="0 0 200 200" width="100%" style="max-width:220px" role="img" aria-label="${esc(sub)}">
      <circle cx="100" cy="100" r="${R}" fill="none" stroke="#E2E2E7" stroke-width="18"/>
      ${parts.map(p => { const len = C * p.v / tot, el = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"/>`; off += len; return el; }).join('')}
      <text x="100" y="102" text-anchor="middle" font-size="30" fill="#1E1E21" font-family="Urbanist, sans-serif">${esc(center)}</text>
      <text x="100" y="126" text-anchor="middle" font-size="13" fill="#6E6E78" font-family="Urbanist, sans-serif">${esc(sub)}</text></svg>`;
  }
  function barChart(labels, values, fmt, color) {
    const W = window.innerWidth < 600 ? 380 : 640, H = 220, L = 40, R = 10, T = 22, B = 30, n = labels.length, max = Math.max(1, ...values) * 1.15, bw = Math.min(46, (W - L - R) / n * 0.55);
    const X = i => L + (i + 0.5) * (W - L - R) / n, Y = v => T + (H - T - B) * (1 - v / max);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Bar chart">${[0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${Y(max / 1.15 * f)}" y2="${Y(max / 1.15 * f)}" stroke="#E2E2E7"/><text x="${L - 8}" y="${Y(max / 1.15 * f) + 4}" text-anchor="end" font-size="11" fill="#8A8A94">${esc(fmt(max / 1.15 * f))}</text>`).join('')}
      ${values.map((v, i) => `<rect x="${X(i) - bw / 2}" y="${Y(v)}" width="${bw}" height="${Math.max(0, Y(0) - Y(v))}" fill="${Array.isArray(color) ? color[i % color.length] : color}"/>${v ? `<text x="${X(i)}" y="${Y(v) - 6}" text-anchor="middle" font-size="11" fill="#1E1E21">${esc(fmt(v))}</text>` : ''}<text x="${X(i)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="#8A8A94">${esc(labels[i])}</text>`).join('')}</svg>`;
  }
  const short = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n));

  function addBox(key, label, form, emptyList) {
    const open = S.ui.add && S.ui.add[key] !== undefined ? S.ui.add[key] : !!emptyList;
    return `<div class="addbar"><button class="btn ${open ? '' : 'solid'}" data-act="toggleAdd" data-k="${key}" aria-expanded="${open}">${open ? 'Close' : '+ ' + label}</button></div>${open ? form : ''}`;
  }
  const waLink = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 8) d = '965' + d; return d ? 'https://wa.me/' + d : ''; };
  /* ============================ views ============================ */
  const ph = (t, s) => { const g = NAV.find(x => x[1].some(p => p[0] === S.page)); return `<div class="ph"><div class="phrow"><h1>${esc(t)}</h1><label class="search"><input type="search" id="q" placeholder="Search" aria-label="Search this page" value="${esc(S.q || '')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg></label></div>
    <div class="tabs ptabs" role="group" aria-label="${esc(g[0])}">${g[1].map(p => `<button class="tab" data-tab="${p[0]}" aria-pressed="${p[0] === S.page}">${esc(p[1])}</button>`).join('')}</div>${s ? `<p class="sub">${s}</p>` : ''}</div>`; };
  const greet = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kuwait' })); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  const PCOL = { p1: '#8B7CF0', p2: '#D08C3A', p3: '#3A8D74', p4: '#C0566E', p5: '#4F7BD9', p6: '#1E1E21', p7: '#8B7CF0', p8: '#D08C3A', p9: '#3A8D74' };
  function ring(done, total) {
    const R = 42, C = 2 * Math.PI * R, f = total ? done / total : 0;
    return `<svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label="${done} of ${total} done"><circle cx="50" cy="50" r="${R}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="9"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="#D6CDFA" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 50 50)"/><text x="50" y="56" text-anchor="middle" font-size="22" fill="#fff" font-family="Urbanist, sans-serif">${done}/${total}</text></svg>`;
  }
  function splitDetails(t) { const m = String(t.details || '').split(/Done when:\s*/i); return { how: (m[0] || '').trim(), done: (m[1] || '').trim() }; }
  function taskCard(t) {
    const goal = t.kind === 'goal', phase = goal ? { name: 'Weekly goal' } : (S.d.phases.find(p => p.id === t.phase_id) || {}), col = goal ? '#C0566E' : (PCOL[t.phase_id] || '#8B7CF0'), p2 = partner(), dd = splitDetails(t), left = phase.ends ? daysBetween(today(), phase.ends) : null, open = S.ui.open === t.id;
    return `<article class="tcard ${t.done ? 'done' : ''}" style="--pc:${col}">
      <button class="tcheck" data-act="taskToggle" data-id="${esc(t.id)}" data-done="${t.done ? 1 : 0}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}" aria-pressed="${t.done}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <div class="tbody"><div class="tmeta"><span class="chip" style="background:${col}1A;color:${col}">${esc(phase.name || 'Task')}</span>${!t.done && left != null ? `<span class="${left < 0 ? 'late' : ''}">${left < 0 ? Math.abs(left) + ' days overdue' : left === 0 ? 'phase ends today' : left + ' days left in phase'}</span>` : ''}${(t.rolled_over || 0) > 0 && !t.done ? `<span class="late">carried over ${t.rolled_over}×</span>` : ''}</div>
        <h3 class="ttitle">${esc(t.title)}</h3>
        ${dd.done && !t.done ? `<p class="tdone"><b>Done when</b> ${esc(dd.done)}</p>` : ''}
        ${open && dd.how ? `<p class="thow">${esc(dd.how)}</p>` : ''}
        ${t.done ? `<p class="small muted" style="margin:4px 0 0">Done ${ago(t.done_at)}</p>` : `<div class="tact">${dd.how ? `<button class="lnk" data-act="openTask" data-id="${esc(t.id)}">${open ? 'Hide steps' : 'How to do it'}</button>` : ''}${p2 ? `<button class="lnk" data-act="reassign" data-id="${esc(t.id)}" data-to="${esc(p2.email)}">Give to ${esc(nameOf(p2.email))}</button>` : ''}<button class="lnk" data-act="snooze" data-id="${esc(t.id)}">Not today</button></div>`}
      </div></article>`;
  }
  function roadmap(full) {
    const g = gates(), cur = g.find(x => x.state === 'current');
    const steps = `<ol class="road">${g.map(x => `<li class="${x.state}"><span class="rn">${x.state === 'done' ? '✓' : x.n}</span><span class="rl">${esc(x.name)}</span></li>`).join('')}</ol>`;
    if (!cur) return `<div class="card">${steps}<p style="margin:12px 0 0"><b>Every checkpoint passed.</b> You’re ready for Ramadan.</p></div>`;
    const left = cur.checks.filter(c => !c.ok);
    return `<div class="card road-card">${full ? steps : ''}<div class="cap" style="margin-top:${full ? 18 : 0}px">Checkpoint ${cur.n} of ${g.length}</div><h3 style="font-size:20px;font-weight:500;margin:4px 0 2px">${esc(cur.name)}</h3><p class="small muted" style="margin:0 0 12px">${esc(cur.why)}</p>
      ${cur.checks.map(c => `<div class="gchk ${c.ok ? 'ok' : ''}"><span aria-hidden="true">${c.ok ? '✓' : '○'}</span><span style="flex:1">${esc(c.label)}${!c.ok && c.task && c.task.assigned_to ? `<span class="small muted"> · on ${isMe(c.task.assigned_to) ? 'your' : esc(nameOf(c.task.assigned_to)) + '’s'} list</span>` : ''}</span>${c.ok ? '' : c.task ? (c.task.assigned_to && isMe(c.task.assigned_to) && c.task.scheduled_for === today() ? '' : `<button class="btn sm" data-act="reassign" data-id="${esc(c.task.id)}" data-to="${esc(S.me)}">Do it today</button>`) : c.go ? `<button class="btn sm" data-go="${c.go}">Open</button>` : ''}</div>`).join('')}
      <p class="small muted" style="margin:10px 0 0">${left.length} thing${left.length === 1 ? '' : 's'} left before the next checkpoint${g[cur.n] ? ': ' + esc(g[cur.n].name) : ''}.</p></div>`;
  }
  function weekBlock() {
    const d = S.d, ws = weekStart(), mine = (d.reviews || []).find(r => r.week_start === ws && isMe(r.author)), goals = d.tasks.filter(t => t.kind === 'goal' && t.week_start === ws), p2 = partner();
    if (S.ui.review) return `<div class="card" style="background:#fff;border:1px solid var(--line)"><div class="cap">Week of ${day(ws)}</div><h3 style="font-size:20px;font-weight:500;margin:4px 0 14px">Plan your week</h3>
      <div class="field"><label for="rv-w">What went well last week?</label><textarea id="rv-w" rows="2" placeholder="e.g. Found 2 tailors, finished the bank account"></textarea></div>
      <div class="field" style="margin-top:12px"><label for="rv-s">What’s stuck?</label><textarea id="rv-s" rows="2" placeholder="e.g. Waiting on MOCI reply"></textarea></div>
      <div class="cap" style="margin:16px 0 6px">3 goals for this week</div>${[0, 1, 2].map(i => `<div class="row" style="flex-wrap:nowrap;margin-bottom:8px"><input type="text" id="rv-g${i}" placeholder="Goal ${i + 1}" aria-label="Goal ${i + 1}"><select id="rv-o${i}" aria-label="Who" style="width:120px;flex:none">${opt([[S.me, 'Me']].concat(p2 ? [[p2.email, nameOf(p2.email)]] : []).concat([['', 'Either']]), S.me)}</select></div>`).join('')}
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-act="closeReview">Cancel</button><button class="btn solid" data-act="saveReview">Save my week</button></div><p class="small muted" style="margin:8px 0 0">Your goals become tasks at the top of the list for whoever owns them.</p></div>`;
    const gd = goals.filter(t => t.done).length;
    return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline"><div><div class="cap">This week · ${day(ws)}</div><h3 style="font-size:20px;font-weight:500;margin:4px 0 0">${goals.length ? `${gd} of ${goals.length} goals done` : 'No goals set yet'}</h3></div>${mine ? '' : '<button class="btn sm solid" data-act="openReview">Plan my week</button>'}</div>
      ${goals.length ? `<div class="meter" style="margin:12px 0"><i style="width:${gd / goals.length * 100}%;background:#8B7CF0"></i></div>${goals.map(t => `<div class="gchk ${t.done ? 'ok' : ''}"><span aria-hidden="true">${t.done ? '✓' : '○'}</span><span style="flex:1">${esc(t.title)}</span><span class="small muted">${t.done ? (isMe(t.done_by) ? 'you' : esc(nameOf(t.done_by))) : t.owner ? (isMe(t.owner) ? 'you' : esc(nameOf(t.owner))) : 'either'}</span></div>`).join('')}` : '<p class="small muted" style="margin:10px 0 0">Every Sunday, spend 2 minutes on wins, what’s stuck and 3 goals. Goals turn into tasks automatically.</p>'}
      ${mine && (mine.stuck || '').trim() ? `<p class="small" style="margin:12px 0 0"><b>Stuck:</b> ${esc(mine.stuck)}</p>` : ''}</div>`;
  }
  function actionsHtml(n) { return (n.actions || []).map(a => `<button class="btn sm ${n.lvl === 'r' ? 'solid' : ''}" ${a.attrs}>${a.label}</button>`).join(''); }
  function vToday() {
    const d = S.d, mine = d.todayList, open = mine.filter(t => !t.done), done = mine.filter(t => t.done);
    const all = d.tasks.length, allDone = d.tasks.filter(t => t.done).length, toR = daysBetween(today(), RAMADAN), p2 = partner();
    const notes = pmNotes(), focus = notes.slice(0, 5);
    const nextUp = d.tasks.filter(t => !t.done && !t.assigned_to && (!t.owner || isMe(t.owner))).sort((a, b) => ((d.phases.find(p => p.id === a.phase_id) || {}).sort || 99) - ((d.phases.find(p => p.id === b.phase_id) || {}).sort || 99) || a.sort - b.sort).slice(0, 3);
    const theirs = p2 ? d.tasks.filter(t => (t.assigned_to || '').toLowerCase() === p2.email.toLowerCase() && t.scheduled_for === today()) : [];
    return ph(`${greet()}, ${nameOf(S.me)}`) +
      `<section class="hero"><div class="hero-l">${ring(done.length, mine.length)}</div><div class="hero-r">
        <div class="cap" style="color:#B9B9C2">Today</div>
        <div class="hero-t">${mine.length === 0 ? 'Nothing assigned yet' : open.length ? `${open.length} task${open.length === 1 ? '' : 's'} to finish today` : 'Today’s tasks are done'}</div>
        <div class="hero-s">${toR > 0 ? toR + ' days to Ramadan' : 'Ramadan Kareem'} · launch ${Math.round(allDone / Math.max(1, all) * 100)}% done</div>
        <div class="bar2"><i style="width:${Math.round(allDone / Math.max(1, all) * 100)}%"></i></div></div></section>
      <div class="split sec" style="margin-top:22px"><div>
        <div class="row" style="justify-content:space-between;align-items:baseline"><h2>Your tasks</h2><span class="cap">${done.length} of ${mine.length} done</span></div>
        <div class="tlist">${open.map(taskCard).join('')}${done.map(taskCard).join('')}${!mine.length ? `<div class="empty">${allDone === all ? 'Every launch task is done.' : 'No tasks yet today.'}</div>` : ''}</div>
        ${!open.length && mine.length && allDone < all ? '<p class="small muted" style="margin:10px 2px 0">New tasks load automatically when you finish today’s batch.</p>' : ''}
        ${nextUp.length ? `<h3 class="cap" style="margin:22px 0 8px">Coming up next</h3><div class="next">${nextUp.map(t => `<div><span class="dotc" style="background:${PCOL[t.phase_id] || '#8B7CF0'}"></span>${esc(t.title)}</div>`).join('')}</div>` : ''}
      </div>
      <div>
        <h2>Next checkpoint</h2>${roadmap(false)}
        <h2 class="sec">This week</h2>${weekBlock()}
        <h2 class="sec">What needs you</h2>
        <div class="card" style="padding:4px 20px">${focus.length ? focus.map(n => `<div class="note"><b class="flag ${n.lvl}" aria-hidden="true"></b><div style="flex:1"><div>${n.html}</div>${n.actions && n.actions.length ? `<div class="row" style="margin-top:10px">${actionsHtml(n)}</div>` : ''}</div></div>`).join('') : '<div class="note"><b class="flag g"></b><div>You’re on track. Keep going with today’s tasks.</div></div>'}</div>
        ${notes.length > 5 ? `<p class="small muted">+${notes.length - 5} more once these are handled.</p>` : ''}
        ${p2 ? `<h2 class="sec">${esc(nameOf(p2.email))} today</h2><div class="card" style="padding:10px 20px">${theirs.length ? theirs.map(t => `<div class="pt ${t.done ? 'ok' : ''}"><span aria-hidden="true">${t.done ? '✓' : '○'}</span>${esc(t.title)}</div>`).join('') : '<p class="small muted">Her tasks show here once she opens the HQ today.</p>'}
          </div>` : ''}
      </div></div>
      ${(() => { const f = S.ui.feed || 'all', people = d.members.length ? d.members : [{ email: S.me }]; let list = d.activity; if (f !== 'all') list = list.filter(a => (a.actor || '').toLowerCase() === f.toLowerCase());
        const n = S.ui.feedN || 12, shown = list.slice(0, n);
        return `<div class="sec" id="activity"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Team activity</h2><div class="tabs" style="margin:0;border:none">${[['all', 'Everyone']].concat(people.map(m => [m.email, isMe(m.email) ? 'You' : nameOf(m.email)])).map(o => `<button class="tab" data-act="feed" data-v="${esc(o[0])}" aria-pressed="${o[0] === f}">${esc(o[1])}</button>`).join('')}</div></div>
          <div class="card feed" style="padding:4px 20px">${shown.map(feedRow).join('') || '<p class="muted small">Nothing yet. Everything either of you does shows up here.</p>'}</div>
          ${list.length > n ? `<button class="btn" data-act="feedMore" style="margin-top:10px">Show more</button>` : ''}</div>`; })()}`;
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
    const revs = S.d.reviews || [];
    return ph('Launch plan', 'Checkpoints first, then every task by phase.') + `<h2>Launch roadmap</h2>${roadmap(true)}<h2 class="sec">Tasks by phase</h2>` +
      d.phases.map(p => { const list = d.tasks.filter(x => x.phase_id === p.id).sort((a, b) => a.sort - b.sort), done = list.filter(x => x.done).length; const state = t < p.starts ? 'Upcoming' : t > p.ends ? (done === list.length ? 'Complete' : 'Overdue') : 'In progress';
        return `<div class="card sec" style="margin-top:14px"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">${esc(p.name)}</h2><p class="small muted" style="margin:2px 0 0">${day(p.starts)} – ${day(p.ends)} · ${done}/${list.length} done</p></div><span class="pill ${state === 'Complete' ? 'ok' : state === 'Overdue' ? 'bad' : state === 'In progress' ? 'gold' : ''}">${state}</span></div>
          <div class="meter" style="margin:12px 0 6px"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>
          <div class="tw" style="border:none"><table style="min-width:560px"><tbody>${list.map(x => `<tr><td style="width:36px"><input type="checkbox" data-act="planDone" data-id="${esc(x.id)}" ${x.done ? 'checked' : ''} aria-label="Done: ${esc(x.title)}" style="width:18px;height:18px;accent-color:#1C1917"></td>
            <td style="${x.done ? 'color:var(--faint);text-decoration:line-through' : ''}">${esc(x.title)}</td>
            <td class="small muted" style="white-space:nowrap">${x.done ? `${isMe(x.done_by) ? 'You' : esc(nameOf(x.done_by))} · ${ago(x.done_at)}` : x.assigned_to ? `${isMe(x.assigned_to) ? 'Your' : esc(nameOf(x.assigned_to)) + '’s'} list` : ''}</td>
            <td style="width:150px"><select aria-label="Who" data-act="owner" data-id="${esc(x.id)}">${opt(owners, x.owner || '')}</select></td>
            <td style="width:44px"><button class="x" data-act="delTask" data-id="${esc(x.id)}" aria-label="Delete task">✕</button></td></tr>`).join('')}</tbody></table></div>
          <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" id="nt-${p.id}" placeholder="Add a task to ${esc(p.name)}" aria-label="New task"><button class="btn sm" data-act="addTask" data-ph="${p.id}">Add</button></div></div>`; }).join('') + (revs.length ? `<h2 class="sec">Weekly reviews</h2><div class="clist">${revs.slice(0, 12).map(r => `<article class="crow" style="display:block"><div class="cap">Week of ${day(r.week_start)} · ${isMe(r.author) ? 'you' : esc(nameOf(r.author))}</div>${r.wins ? `<p style="margin:8px 0 0"><b>Went well:</b> ${esc(r.wins)}</p>` : ''}${r.stuck ? `<p style="margin:6px 0 0"><b>Stuck:</b> ${esc(r.stuck)}</p>` : ''}${(r.goals || []).length ? `<p style="margin:6px 0 0"><b>Goals:</b> ${(r.goals || []).map(esc).join(' · ')}</p>` : ''}</article>`).join('')}</div>` : '');
  }

  /* ---------- money ---------- */
  function band(p) { const st = S.d.settings, t = `${num(st.target_min)}–${num(st.target_max)} KD`; return { 'in range': `<span class="pill ok">In ${t}</span>`, 'above range': `<span class="pill bad">Above ${t}</span>`, 'below range': `<span class="pill gold">Below ${t}</span>` }[p.range_status] || '<span class="pill">No costs yet</span>'; }
  const activeStyles = () => S.d.styles.filter(x => x.active !== false).sort((a, b) => a.sort - b.sort);
  const styleName = id => (S.d.styles.find(s => s.id === Number(id)) || {}).name || '';
  function vMoney() {
    const s = S.d.summary || {}, spend = S.d.spend.filter(c => num(c.spent) > 0);
    const exs = S.d.expenses, ords = S.d.orders.filter(o => o.status !== 'Cancelled');
    const catCols = ['#1E1E21', '#8B7CF0', '#D6CDFA', '#6E6E78', '#B9B9C2', '#3A8D74'];
    const empty = t => `<p class="muted" style="padding:36px 0;text-align:center;margin:0">${t}</p>`;
    // cash flow: cumulative spent vs revenue
    const dates = exs.map(e => e.spent_on).concat(ords.map(o => o.ordered_on)).filter(Boolean).sort();
    let flow = '';
    if (dates.length) {
      const start = Date.parse(dates[0]) - 7 * 864e5, end = Math.max(Date.parse(today()), start + 14 * 864e5), weeks = Math.min(12, Math.max(3, Math.ceil((end - start) / (7 * 864e5)) + 1));
      const pts = Array.from({ length: weeks }, (_, i) => new Date(start + i * 7 * 864e5).toISOString().slice(0, 10));
      const cum = (arr, key, val) => pts.map(p => arr.filter(x => x[key] <= p).reduce((a, x) => a + num(x[val]), 0));
      flow = areaChart([{ name: 'Spent', color: '#1E1E21', values: cum(exs, 'spent_on', 'amount') }, { name: 'Revenue', color: '#8B7CF0', fill: 'rgba(214,205,250,.6)', values: cum(ords, 'ordered_on', 'order_total') }], pts.map(day), short);
    }
    const t0 = Date.parse(today()), wk = Array.from({ length: 8 }, (_, i) => new Date(t0 - (7 - i) * 7 * 864e5).toISOString().slice(0, 10));
    const wSpend = wk.map((w, i) => exs.filter(e => e.spent_on >= w && (i === 7 || e.spent_on < wk[i + 1])).reduce((a, e) => a + num(e.amount), 0));
    const cats = spend.slice(0, 6);
    const pr = S.d.pricing, maxC = Math.max(1, ...pr.map(p => Math.max(p.has_costs ? num(p.full_cost) : 0, num(p.max_cost_for_target)))) * 1.1;
    const bySet = activeStyles().map(st => ords.filter(o => Number(o.style_id) === st.id).reduce((a, o) => a + num(o.order_total), 0));
    const stCount = STATUSES.filter(x => x !== 'Cancelled').map(x => [x, S.d.orders.filter(o => o.status === x).length]), stMax = Math.max(1, ...stCount.map(x => x[1]));
    const ch = CHANNELS.map(c => [c, ords.filter(o => o.channel === c).length]).filter(x => x[1]);
    return ph('Money', 'Calculated by the database whenever either of you adds an expense or an order') +
      `<div class="split"><div>${tiles([
        { t: 'Spent so far', v: kd(s.spent), d: `${pct(s.budget_used) === '—' ? '0%' : pct(s.budget_used)} of ${kd(s.budget)} budget`, dir: num(s.budget_used) > .9 ? 'dn' : 'up' },
        { t: 'Revenue', v: kd(s.revenue), d: `${num(s.orders)} order${num(s.orders) === 1 ? '' : 's'} · ${num(s.sets_sold)} sets` },
        { t: 'Profit on sales', v: kd(s.profit), dir: num(s.profit) > 0 ? 'up' : 'dn', d: s.sets_to_break_even != null ? (num(s.net_position) >= 0 ? 'Spend earned back' : `${s.sets_to_break_even} sets to break even`) : 'No sales yet' },
        { t: 'Still owed', v: kd(s.owed), d: num(s.collected) ? `${kd(s.collected)} collected` : 'Nothing collected yet' }
      ])}</div>
      <div><h2 style="margin-top:-4px">Budget</h2><div class="card" style="text-align:center">${donut([{ v: Math.min(num(s.spent), num(s.budget) || num(s.spent)), c: '#1E1E21' }, { v: Math.max(0, num(s.budget_left)), c: '#D6CDFA' }], pct(s.budget_used) === '—' ? '0%' : pct(s.budget_used), 'used')}
        <div class="row" style="justify-content:space-around;margin-top:8px"><div><div style="font-size:20px">${kd(s.spent)}</div><div class="cap">Spent</div></div><div><div style="font-size:20px">${kd(s.budget_left)}</div><div class="cap">Left</div></div></div></div></div></div>

      <div class="split sec"><div><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Cash flow</h2><div class="legend"><span><i style="background:#1E1E21"></i>Spent</span><span><i style="background:#8B7CF0"></i>Revenue</span></div></div>
        <div class="chart">${flow || empty('Appears once you log expenses or orders.')}</div></div>
        <div><h2>Spend by category</h2><div class="card">${cats.length ? `<div style="max-width:200px;margin:0 auto 10px">${donut(cats.map((c, i) => ({ v: num(c.spent), c: catCols[i] })), short(num(s.spent)), 'KD spent')}</div><div style="display:grid;gap:8px">${cats.map((c, i) => `<div class="row small" style="justify-content:space-between;flex-wrap:nowrap"><span><i class="sw" style="background:${catCols[i]}"></i>${esc(c.category)}</span><span>${kd(c.spent)} · <b style="font-weight:600">${Math.round(num(c.spent) / Math.max(1, num(s.spent)) * 100)}%</b></span></div>`).join('')}</div>` : empty('Appears once you log expenses.')}</div></div></div>

      <div class="sec"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Cost per set vs. the most it can cost</h2><div class="legend"><span><i style="background:#1E1E21"></i>Your cost</span><span><i style="background:#8B7CF0;border-radius:2px"></i>Max to sell in range</span></div></div>
        <div class="card">${pr.map(p => { const c = p.has_costs ? num(p.full_cost) : 0, over = c > num(p.max_cost_for_target); return `<div class="cvt"><div class="cvt-l"><b>${esc(p.name.replace(' set', ''))}</b><span>${num(p.target_price)} KD target${num(p.final_price) ? ` · sells at ${kd(p.final_price)}` : ''}</span></div><div class="cvt-b"><i style="width:${c / maxC * 100}%;background:${over ? 'var(--bad)' : '#1E1E21'}"></i><em style="left:${num(p.max_cost_for_target) / maxC * 100}%"></em></div><div class="cvt-r">${p.has_costs ? `<b style="font-weight:500;color:${over ? 'var(--bad)' : 'inherit'}">${kd(c)}</b>` : '<span style="display:inline">no costs yet</span>'}<span>max ${kd(p.max_cost_for_target)}</span></div></div>`; }).join('')}
        <p class="small muted" style="margin:12px 0 0">A set turns red when it costs more than it can to sell inside your price range. Log fabric and sewing per set in Expenses to fill this in.</p></div></div>

      <div class="grid g2 sec"><div><h2>Spending per week</h2><div class="chart">${wSpend.some(Boolean) ? barChart(wk.map(day), wSpend, short, '#1E1E21') : empty('No spending in the last 8 weeks.')}</div></div>
        <div><h2>Revenue by set</h2><div class="chart">${bySet.some(Boolean) ? barChart(activeStyles().map(x => x.name.split(' ')[0]), bySet, short, '#8B7CF0') : empty('No sales yet.')}</div></div></div>

      <div class="grid g2 sec"><div><h2>Order pipeline</h2><div class="card">${stCount.map(([n, c]) => `<div class="hbar" style="grid-template-columns:130px 1fr 28px"><span class="small">${esc(n)}</span><div class="meter" style="height:8px"><i style="width:${c / stMax * 100}%;background:#8B7CF0"></i></div><b class="small" style="text-align:right;font-weight:600">${c}</b></div>`).join('')}</div></div>
        <div><h2>Where orders come from</h2><div class="card">${ch.length ? ch.map(([n, c], i) => `<div class="hbar" style="grid-template-columns:130px 1fr 28px"><span class="small">${esc(n)}</span><div class="meter" style="height:8px"><i style="width:${c / Math.max(1, ...ch.map(x => x[1])) * 100}%;background:${catCols[i]}"></i></div><b class="small" style="text-align:right;font-weight:600">${c}</b></div>`).join('') : empty('No orders yet.')}</div></div></div>
      <div class="sec" id="pricing">${vPricingBlock()}</div>`;
  }
  function vExpenses() {
    const f = S.ef, cats = S.d.categories, kindOf = n => (cats.find(c => c.name === n) || {}).kind, cat = f.category || cats[0].name, isOver = kindOf(cat) === 'overhead', scope = isOver ? 'general' : (f.scope || 'style');
    const total = S.d.expenses.reduce((a, e) => a + num(e.amount), 0);
    const form = `<div class="form"><div class="field"><label for="e-amt">Amount paid (KD)</label><input type="number" inputmode="decimal" min="0" step="0.001" id="e-amt" value="${esc(f.amount || '')}"></div>
        <div class="field"><label for="e-cat">Category</label><select id="e-cat" data-keep="category"><optgroup label="Cost of the sets">${opt(cats.filter(c => c.kind === 'per_set').map(c => c.name), cat)}</optgroup><optgroup label="Overheads">${opt(cats.filter(c => c.kind === 'overhead').map(c => c.name), cat)}</optgroup></select></div>
        ${isOver ? '' : `<div class="field"><label for="e-scope">For</label><select id="e-scope" data-keep="scope">${opt([['style', 'One set'], ['all_styles', 'All sets (shared)']], scope)}</select></div>`}
        ${!isOver && scope === 'style' ? `<div class="field"><label for="e-style">Which set</label><select id="e-style">${opt(activeStyles().map(s => [s.id, s.name]), f.style_id)}</select></div>` : ''}
        ${isOver ? '' : `<div class="field"><label for="e-sets">Sets it covers</label><input type="number" inputmode="numeric" min="1" step="1" id="e-sets" value="${esc(f.sets_covered || '')}"></div>`}
        <div class="field wide"><label for="e-item">What was it</label><input type="text" id="e-item" placeholder="e.g. 40 m cream fabric" value="${esc(f.item || '')}"></div>
        <div class="field"><label for="e-sup">Supplier</label><input type="text" id="e-sup" value="${esc(f.supplier || '')}"></div>
        <div class="field"><label for="e-date">Date</label><input type="date" id="e-date" value="${esc(f.spent_on || today())}"></div>
        <button class="btn solid" data-act="addExpense">Save expense</button>
        <p class="hint">${isOver ? 'Overheads are spread across your planned number of sets.' : 'Example: KD 120 of fabric that makes 30 tops = KD 4 per set.'}</p></div>`;
    const forOf = e => e.scope === 'style' ? styleName(e.style_id).replace(' set', '') : e.scope === 'all_styles' ? 'All sets' : 'General';
    return ph('Expenses', `${S.d.expenses.length} payment${S.d.expenses.length === 1 ? '' : 's'} · ${kd(total) === '—' ? 'KD 0' : kd(total)} total`) + addBox('exp', 'Add expense', form, !S.d.expenses.length) +
      `<div class="sec" style="margin-top:20px">${S.d.expenses.length ? `<div class="clist">${S.d.expenses.map(e => `<article class="crow"><div class="crow-m"><div class="crow-t">${esc(e.item || e.category)}</div><div class="crow-s"><span class="chip" style="background:${kindOf(e.category) === 'per_set' ? '#1E1E211A' : '#8B7CF01F'};color:${kindOf(e.category) === 'per_set' ? '#1E1E21' : '#4B3FA0'}">${esc(e.category)}</span>${esc(forOf(e))}${e.supplier ? ' · ' + esc(e.supplier) : ''}</div><div class="crow-s">${day(e.spent_on)} · ${isMe(e.created_by) ? 'you' : esc(nameOf(e.created_by))}</div></div>
        <div class="crow-r"><div class="crow-v">${kd(e.amount)}</div>${num(e.sets_covered) ? `<div class="crow-s">${kd(num(e.amount) / num(e.sets_covered))} / set</div>` : ''}<button class="x" data-act="delExpense" data-id="${esc(e.id)}" aria-label="Delete expense">✕</button></div></article>`).join('')}</div>` : ''}</div>`;
  }
  function vOrders() {
    const f = S.of, ords = S.d.orders;
    const owed = ords.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + Math.max(0, num(o.balance_due)), 0);
    const form = `<div class="form"><div class="field wide"><label for="o-cust">Customer</label><input type="text" id="o-cust" value="${esc(f.customer || '')}"></div><div class="field wide"><label for="o-style">Set</label><select id="o-style">${opt(activeStyles().map(s => [s.id, s.name]), f.style_id)}</select></div><div class="field"><label for="o-size">Size</label><select id="o-size">${opt([['', 'Choose']].concat(SIZES.map(z => [z, z])), f.size || '')}</select></div><div class="field"><label for="o-color">Color</label><input type="text" id="o-color" list="colors-dl" value="${esc(f.color || 'Cream')}"><datalist id="colors-dl">${[...new Set((S.d.stock || []).map(x => x.color).concat(['Cream', 'Sand', 'Taupe']))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label for="o-qty">Sets</label><input type="number" inputmode="numeric" min="1" id="o-qty" value="${esc(f.qty || 1)}"></div><div class="field"><label for="o-dep">Deposit (KD)</label><input type="number" inputmode="decimal" min="0" step="0.5" id="o-dep" value="0"></div><div class="field"><label for="o-ch">Channel</label><select id="o-ch">${opt(CHANNELS, f.channel || 'Instagram')}</select></div><div class="field"><label for="o-price">Price per set</label><input type="number" inputmode="decimal" min="0" step="0.5" id="o-price" placeholder="automatic"></div><div class="field"><label for="o-disc">Discount %</label><input type="number" inputmode="numeric" min="0" max="100" id="o-disc" value="0"></div><div class="field wide"><label for="o-emb">Embroidery</label><input type="text" id="o-emb" placeholder="e.g. family initials"></div><div class="field"><label for="o-date">Date</label><input type="date" id="o-date" value="${esc(f.ordered_on || today())}"></div><button class="btn solid" data-act="addOrder">Save order</button><p class="hint">Leave “Price per set” empty to use the current price automatically.</p></div>`;
    const stCol = st => ({ New: '#8B7CF0', 'Deposit paid': '#4F7BD9', Delivered: '#2F7A4F', Cancelled: '#A3A3AD' }[st] || '#D08C3A');
    return ph('Orders', `${ords.length} order${ords.length === 1 ? '' : 's'} · ${owed ? kd(owed) + ' still owed' : 'nothing owed'}`) + addBox('ord', 'Add order', form, !ords.length) +
      `<div class="sec" style="margin-top:20px">${ords.length ? `<div class="clist">${ords.map(o => `<article class="crow ord" style="--sc:${stCol(o.status)}"><div class="crow-m"><div class="crow-t">${esc(o.customer)}</div><div class="crow-s">${o.qty} × ${esc((o.style_name || '').replace(' set', ''))}${o.size ? ' · ' + esc(o.size) : ''}${o.color ? ' · ' + esc(o.color) : ''} · ${esc(o.channel)}${o.embroidery ? ' · ' + esc(o.embroidery) : ''}</div><div class="crow-s">${day(o.ordered_on)} · profit ${kd(o.profit)}</div>
        <div class="row" style="margin-top:10px;flex-wrap:nowrap"><select aria-label="Status" data-act="status" data-id="${esc(o.id)}" class="stsel">${opt(STATUSES, o.status)}</select><label class="dep"><span>Deposit</span><input type="number" min="0" step="0.5" aria-label="Deposit" value="${esc(num(o.deposit))}" data-act="dep" data-id="${esc(o.id)}"></label></div></div>
        <div class="crow-r"><div class="crow-v">${kd(o.order_total)}</div><div class="crow-s" style="color:${num(o.balance_due) > 0 ? 'var(--bad)' : 'var(--good)'}">${num(o.balance_due) > 0 ? kd(o.balance_due) + ' owed' : 'Paid'}</div><button class="x" data-act="delOrder" data-id="${esc(o.id)}" aria-label="Delete order">✕</button></div></article>`).join('')}</div>` : ''}</div>`;
  }
  function vPricingBlock() {
    const st = S.d.settings;
    return `<div class="row" style="justify-content:space-between;align-items:baseline"><h2>Prices</h2><span class="cap">cost × ${num(st.multiplier)}, rounded up</span></div>
      <div class="plist">${S.d.pricing.map(p => `<article class="pcard"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div><b>${esc(p.name)}</b><div class="small muted">${p.has_costs ? `Cost ${kd(p.full_cost)} · margin ${pct(p.margin)}` : 'Log its fabric and sewing to price it'}</div></div>${band(p)}</div>
        <div class="row" style="margin-top:12px;justify-content:space-between;flex-wrap:nowrap;align-items:flex-end"><div><div class="cap">Suggested</div><div class="pv">${p.has_costs ? kd(p.suggested_price) : '—'}</div></div><div><div class="cap">Pack of ${num(st.pack_size)}</div><div class="pv" style="font-size:20px">${kd(p.pack_price)}</div></div><label class="field" style="width:110px"><span class="cap">Your price</span><input type="number" min="0" step="0.5" placeholder="auto" aria-label="Your price for ${esc(p.name)}" value="${p.price_override ? esc(num(p.price_override)) : ''}" data-act="override" data-id="${p.style_id}"></label></div></article>`).join('')}</div>
      <p class="small muted">Type “Your price” to override the suggestion; clear it to go back to automatic.</p>`;
  }
  function vPricing() { return vMoney(); }
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
  details:'Crescent chest embroidery, about 3.5 cm, one thread color.',
  ref:'Your Style 1 board, with New Forms’ piped straight pants instead of sherwal',
  o:{len:250,close:'asym',belt:true,beltColor:'#A89A88',base:'#EFE8DC',pant:'#D9C8AE'}},
 {name:'Side-Button Tunic set',price:16,role:'Housekeepers: covers more, stays neat all day',
  top:'Mid-thigh tunic, cream front with sand side panels, offset placket with four brushed-gold buttons, short or long sleeves, side slits',
  pants:'Straight-leg pants in the side-panel color with cream side piping',
  details:'Crescent chest embroidery. Two-tone panels make each colorway look intentional.',
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
    const st = S.d.settings, m = num(st.multiplier) || 1, sets = activeStyles(), removed = S.d.styles.filter(x => x.active === false);
    const ideas = (S.d.assets || []).filter(a => a.slot === 'drop_idea').sort((a, b) => (b.likes || []).length - (a.likes || []).length);
    const sel = sets[Math.min(S.ui.drop || 0, Math.max(0, sets.length - 1))];
    const sizes = [['S', '86–90', '68–72', '92–96'], ['M', '91–96', '73–78', '97–102'], ['L', '97–102', '79–84', '103–108'], ['XL', '103–110', '85–92', '109–116'], ['XXL', '111–118', '93–100', '117–124'], ['3XL', '119–126', '101–108', '125–132']];
    let detail = '<div class="empty">No sets in the drop yet. Add one below or turn an idea into a set.</div>';
    if (sel) {
      const spec = DROP.find(x => x.name === sel.name), p = S.d.pricing.find(x => x.style_id === sel.id), img = sel.image_path && S.urls[sel.image_path];
      const priceBox = `<div style="margin-top:14px;background:var(--panel);padding:12px" class="small">Must cost <b>${kd(num(sel.target_price) / m)}</b> or less all-in to sell at ${num(sel.target_price)} KD.${p && p.has_costs ? ` Current cost: <b>${kd(p.full_cost)}</b> ${band(p)}` : ''}</div>`;
      detail = `<div class="grid g2"><div class="card" style="display:flex;align-items:center;justify-content:center;padding:24px;min-height:320px">${img ? `<img src="${esc(img)}" alt="${esc(sel.name)}" style="max-width:100%;max-height:420px;object-fit:contain">` : spec ? sketch(Object.assign({ name: spec.name }, spec.o)) : '<span class="muted">No picture yet</span>'}</div>
        <div class="card" style="background:#fff;border:1px solid var(--line)"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><div><h2 style="margin:0">${esc(sel.name)}</h2>${spec ? `<p class="muted" style="margin:2px 0 0">${esc(spec.role)}</p>` : ''}</div>
          <label class="field" style="width:96px;flex:none"><span class="cap">Price KD</span><input type="number" min="1" step="0.5" value="${esc(num(sel.target_price))}" data-act="setPrice" data-id="${sel.id}" aria-label="Target price"></label></div>
          ${spec ? `<div style="margin-top:14px"><h3>Top</h3><p style="margin:0 0 12px">${esc(spec.top)}</p><h3>Pants</h3><p style="margin:0 0 12px">${esc(spec.pants)}</p><h3>Details</h3><p style="margin:0 0 12px">${esc(spec.details)}</p></div>` : ''}
          <div class="field" style="margin-top:8px"><label for="set-notes">${spec ? 'Your notes for the tailor' : 'Description and notes for the tailor'}</label><textarea id="set-notes" data-act="setNotes" data-id="${sel.id}" placeholder="Fabric, color, changes you want…">${esc(sel.notes || '')}</textarea></div>
          ${priceBox}
          <div class="row" style="margin-top:14px"><button class="btn sm" data-act="removeSet" data-id="${sel.id}">Remove from drop</button></div></div></div>`;
    }
    return ph('Ramadan drop', `${sets.length} set${sets.length === 1 ? '' : 's'} in the drop · ${ideas.length} idea${ideas.length === 1 ? '' : 's'} on the board`) +
      `<div class="tabs" role="group" aria-label="Sets" style="overflow-x:auto;flex-wrap:nowrap">${sets.map((x, i) => `<button class="tab" data-act="drop" data-i="${i}" aria-pressed="${x === sel}" style="white-space:nowrap">${esc(x.name.replace(/ set$/, ''))}</button>`).join('')}<button class="tab" data-act="toggleAdd" data-k="set" aria-expanded="${!!(S.ui.add && S.ui.add.set)}" style="white-space:nowrap;color:var(--lavInk)">+ Add set</button></div>
      ${S.ui.add && S.ui.add.set ? `<div class="form" style="margin-bottom:18px"><div class="field wide"><label for="ns-n">Set name</label><input type="text" id="ns-n" placeholder="e.g. Abaya-style long top set"></div><div class="field"><label for="ns-p">Target price (KD)</label><input type="number" min="1" step="0.5" id="ns-p" value="${num(st.target_min) || 14}"></div><div class="field wide"><label for="ns-d">Description</label><input type="text" id="ns-d" placeholder="Top, pants, details…"></div><button class="btn solid" data-act="addSet">Add to drop</button></div>` : ''}
      ${detail}
      ${removed.length ? `<div class="sec"><h3 class="cap" style="margin-bottom:8px">Removed from the drop</h3><div class="row">${removed.map(x => `<span class="pill" style="padding:6px 6px 6px 12px;display:inline-flex;gap:8px;align-items:center">${esc(x.name)}<button class="btn sm" data-act="restoreSet" data-id="${x.id}" style="min-height:28px;padding:2px 10px">Bring back</button><button class="btn sm" data-act="deleteSet" data-id="${x.id}" style="min-height:28px;padding:2px 10px;color:var(--bad)">Delete</button></span>`).join('')}</div></div>` : ''}

      <section class="sec slot" data-slot="drop_idea" style="background:none;padding:0"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Idea board</h2><span class="cap">${ideas.length ? 'most liked first' : ''}</span></div>
        <p class="small muted" style="margin:-6px 0 14px">Drop pictures of cuts, colors or details you like. Both of you can like ideas, turn the best into a set, or remove what you don’t want.</p>
        <label class="drop" style="margin-bottom:16px"><input type="file" accept="image/*" multiple data-act="upload" data-slot="drop_idea" class="sr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg><span><b>Drop images</b> or tap to add ideas</span></label>
        <div class="ideas">${ideas.map(a => { const likes = a.likes || [], mine = likes.some(isMe), url = S.urls[a.path], used = S.d.styles.some(x => x.image_path === a.path);
          return `<article class="idea">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(a.name)}" loading="lazy"></a>` : '<div class="idea-ph">Image</div>'}
            <div class="idea-b"><input type="text" value="${esc(a.note || '')}" placeholder="What do you like about it?" aria-label="Note" data-act="ideaNote" data-id="${esc(a.id)}">
            <div class="row" style="justify-content:space-between;flex-wrap:nowrap;margin-top:8px"><button class="like ${mine ? 'on' : ''}" data-act="like" data-id="${esc(a.id)}" aria-pressed="${mine}" aria-label="Like">${mine ? '♥' : '♡'} ${likes.length || ''}</button>
              <span class="small muted">${likes.length ? likes.map(e => isMe(e) ? 'you' : esc(nameOf(e))).join(' & ') : 'by ' + (isMe(a.created_by) ? 'you' : esc(nameOf(a.created_by)))}</span></div>
            <div class="row" style="margin-top:8px">${used ? '<span class="pill ok">In the drop</span>' : `<button class="btn sm lav" data-act="ideaToSet" data-id="${esc(a.id)}">Make it a set</button>`}<button class="btn sm" data-act="delAsset" data-id="${esc(a.id)}">Remove</button></div></div></article>`; }).join('')}</div></section>

      <div class="grid g2 sec"><div class="card"><h3>Shared across every set</h3><div class="small" style="display:grid;gap:6px"><span>One straight-leg pant pattern for every set, elastic back waist, side pockets.</span><span>Mandarin collar ~3 cm with gold or champagne piping.</span><span>Hidden snaps or flat buttons, nothing that catches on children.</span><span>Pre-washed fabric, overlocked seams, side slits.</span></div></div>
      <div><h3>Size chart (body, cm)</h3><div class="tw"><table style="min-width:0"><thead><tr><th>Size</th><th class="n">Bust</th><th class="n">Waist</th><th class="n">Hip</th></tr></thead><tbody>${sizes.map(z => `<tr><td><b>${z[0]}</b></td><td class="n">${z[1]}</td><td class="n">${z[2]}</td><td class="n">${z[3]}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  }
  function vStock() {
    const sets = activeStyles(), stock = S.d.stock || [];
    const colorsOf = sid => { const c = [...new Set(stock.filter(x => x.style_id === sid).map(x => x.color))]; return c.length ? c : ['Cream']; };
    const extra = S.ui.colors || {};
    const total = stock.filter(x => sets.some(st => st.id === x.style_id)).reduce((a, x) => a + Math.max(0, num(x.qty)), 0);
    const low = stock.filter(x => sets.some(st => st.id === x.style_id) && num(x.qty) <= num(x.low_at || 3)).length;
    const pending = S.d.orders.filter(o => !['Delivered', 'Cancelled'].includes(o.status));
    return ph('Inventory', `${total} pieces in stock${low ? ` · ${low} running low` : ''} · ${pending.reduce((a, o) => a + num(o.qty), 0)} sets on open orders`) +
      `<p class="small muted" style="margin-top:-8px">Type how many you have. Stock goes down automatically when an order is marked <b>Delivered</b> (orders need a size and color).</p>` +
      sets.map(st => { const cols = [...new Set(colorsOf(st.id).concat(extra[st.id] || []))], sum = stock.filter(x => x.style_id === st.id).reduce((a, x) => a + num(x.qty), 0), want = pending.filter(o => o.style_id === st.id);
        return `<section class="card sec inv" style="margin-top:16px"><div class="row" style="justify-content:space-between;align-items:baseline"><h3 style="font-size:18px;font-weight:500;margin:0">${esc(st.name)}</h3><span class="cap">${sum} in stock${want.length ? ` · ${want.reduce((a, o) => a + num(o.qty), 0)} ordered` : ''}</span></div>
          <div class="tw" style="margin-top:12px;background:#fff"><table class="invt"><thead><tr><th>Color</th>${SIZES.map(z => `<th class="n">${z}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
          ${cols.map(c => `<tr><td><b style="font-weight:500">${esc(c)}</b></td>${SIZES.map(z => { const r = stock.find(x => x.style_id === st.id && x.size === z && x.color === c), q = r ? num(r.qty) : 0, lw = r && q <= num(r.low_at || 3); return `<td class="n"><input type="number" inputmode="numeric" min="0" value="${r ? q : ''}" placeholder="0" aria-label="${esc(st.name)} ${z} ${esc(c)}" data-act="stockQty" data-sid="${st.id}" data-size="${z}" data-color="${esc(c)}" class="${r && q <= 0 ? 'out' : lw ? 'low' : ''}"></td>`; }).join('')}<td class="n"><b style="font-weight:600">${stock.filter(x => x.style_id === st.id && x.color === c).reduce((a, x) => a + num(x.qty), 0)}</b></td></tr>`).join('')}
          </tbody></table></div>
          <div class="row" style="margin-top:10px;flex-wrap:nowrap"><input type="text" id="nc-${st.id}" placeholder="Add a color, e.g. Taupe" aria-label="New color for ${esc(st.name)}" style="max-width:240px"><button class="btn sm" data-act="addColor" data-sid="${st.id}">Add color</button></div></section>`; }).join('') +
      `<p class="small muted sec">Red = out of stock, lilac = 3 or fewer left.</p>`;
  }
  const SLOTS = [
    ['logo', 'Main logo', 'The logo you’ll send to tailors, printers and the embroidery shop. PNG or SVG with a transparent background is best.'],
    ['logo_icon', 'Profile picture / icon', 'The small round version for Instagram, WhatsApp and labels.'],
    ['palette', 'Color palette', 'Add your colors below, or drop a picture of the palette.'],
    ['fonts', 'Fonts', 'Font files, or screenshots of the fonts you want.'],
    ['products', 'Product photos', 'Photos of samples and finished sets.'],
    ['mood', 'Mood board', 'Inspiration: looks, colors and photos you like.'],
    ['packaging', 'Packaging & labels', 'Bags, boxes, hang tags, neck and care labels, thank-you cards.'],
    ['fabric', 'Fabric & trims', 'Fabric swatches, piping, buttons, thread colors.'],
    ['tailor', 'Sketches & tailor references', 'Sketches, tech packs and reference photos for the tailor.'],
    ['docs', 'Documents', 'License, quotes, invoices and contracts.']
  ];
  const isImg = a => /^image\//.test(a.mime || '');
  const fsize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
  function vKit() {
    const assets = S.d.assets || [], pal = Array.isArray(S.d.settings.palette) ? S.d.settings.palette : [];
    if (S.noKit && !DEMO) return ph('Brand kit') + '<div class="banner">Run <b>update-2.sql</b> once in Supabase → SQL Editor to switch on file uploads. It’s in the <b>supabase</b> folder.</div>';
    return ph('Brand kit', 'One shared place for every file you both need. Drop files into the right box. Images preview, other files download.') +
      `<div class="kit">${SLOTS.map(([id, label, help]) => { const list = assets.filter(a => a.slot === id);
        return `<section class="slot" data-slot="${id}"><div class="slot-h"><div><h3>${esc(label)}</h3><p class="small muted">${esc(help)}</p></div><span class="cap">${list.length || ''}</span></div>
          ${id === 'palette' ? `<div class="pal">${pal.map((c, i) => `<div class="pc"><label class="sr" for="pc-${i}">Color ${i + 1}</label><input type="color" id="pc-${i}" value="${esc(c.hex || '#000000')}" data-act="palColor" data-i="${i}"><input type="text" value="${esc(c.name || '')}" placeholder="Name" aria-label="Color name" data-act="palName" data-i="${i}"><button class="x" data-act="palDel" data-i="${i}" aria-label="Remove color">✕</button><span class="hex">${esc((c.hex || '').toUpperCase())}</span></div>`).join('')}<button class="pc add" data-act="palAdd" aria-label="Add a color">+ Add color</button></div>` : ''}
          <div class="thumbs">${list.map(a => `<figure class="th">${isImg(a) && S.urls[a.path] ? `<a href="${esc(S.urls[a.path])}" target="_blank" rel="noopener"><img src="${esc(S.urls[a.path])}" alt="${esc(a.name)}" loading="lazy"></a>` : `<button class="file" data-act="openFile" data-path="${esc(a.path)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg><span>${esc((a.name.split('.').pop() || 'file').toUpperCase())}</span></button>`}<figcaption><span title="${esc(a.name)}">${esc(a.name)}</span><small>${fsize(num(a.size))} · ${isMe(a.created_by) ? 'you' : esc(nameOf(a.created_by))}</small></figcaption><button class="x thx" data-act="delAsset" data-id="${esc(a.id)}" aria-label="Delete ${esc(a.name)}">✕</button></figure>`).join('')}</div>
          <label class="drop"><input type="file" multiple data-act="upload" data-slot="${id}" class="sr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg><span><b>Drop files</b> or tap to choose</span></label></section>`; }).join('')}</div>`;
  }
  function vInstagram() {
    const st = S.d.settings, hb = String(st.brand_name).toLowerCase().replace(/[^a-z0-9._]+/g, ''), handle = '@' + (/\.kw$/.test(hb) ? hb : hb + '.kw'), posts = S.d.posts, p = posts.find(x => x.position === S.ui.post) || posts[0], weeks = S.d.checklist.filter(c => c.list === 'ig_weeks');
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
    const booth = S.d.checklist.filter(c => c.list === 'booth'), bd = booth.filter(b => b.done).length, t = today();
    const form = `<div class="form"><div class="field wide"><label for="x-n">Exhibition</label><input type="text" id="x-n"></div><div class="field"><label for="x-d">Apply by</label><input type="date" id="x-d"></div><div class="field"><label for="x-s">Starts</label><input type="date" id="x-s"></div><div class="field"><label for="x-f">Booth fee (KD)</label><input type="number" inputmode="decimal" min="0" id="x-f"></div><div class="field wide"><label for="x-l">Location</label><input type="text" id="x-l"></div><button class="btn solid" data-act="addExpo">Save exhibition</button></div>`;
    const stCol = { Researching: '#A3A3AD', Applied: '#8B7CF0', Accepted: '#4F7BD9', Paid: '#2F7A4F', Done: '#1E1E21', Rejected: '#C2352B' };
    return ph('Exhibitions', `${S.d.expos.length} listed · booth kit ${bd}/${booth.length}`) + addBox('expo', 'Add exhibition', form, !S.d.expos.length) +
      `<div class="split sec" style="margin-top:20px"><div>${S.d.expos.length ? `<div class="clist">${S.d.expos.map(x => { const dl = x.apply_by ? daysBetween(t, x.apply_by) : null; return `<article class="crow ord" style="--sc:${stCol[x.status] || '#A3A3AD'}"><div class="crow-m"><div class="crow-t">${esc(x.name)}</div><div class="crow-s">${esc(x.location || 'Location TBC')}${x.starts ? ' · starts ' + day(x.starts) : ''}</div>${x.apply_by ? `<div class="crow-s" style="${x.status === 'Researching' && dl != null && dl <= 10 ? 'color:var(--bad)' : ''}">Apply by ${day(x.apply_by)}${dl != null && x.status === 'Researching' ? ` · ${dl < 0 ? 'passed' : dl + ' days left'}` : ''}</div>` : ''}<div style="margin-top:10px"><select aria-label="Status" data-act="expoSt" data-id="${esc(x.id)}" class="stsel">${opt(EXPO_ST, x.status)}</select></div></div>
        <div class="crow-r"><div class="crow-v">${kd(x.fee)}</div><div class="crow-s">booth fee</div><button class="x" data-act="delExpo" data-id="${esc(x.id)}" aria-label="Delete">✕</button></div></article>`; }).join('')}</div><p class="small muted">Log booth fees in Expenses as “Exhibition” so they count in your prices.</p>` : ''}</div>
      <div><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Booth kit</h2><span class="cap">${bd} of ${booth.length}</span></div><div class="meter" style="margin-bottom:12px"><i style="width:${booth.length ? bd / booth.length * 100 : 0}%;background:#8B7CF0"></i></div>
        <div class="tlist">${booth.map(b => `<article class="tcard ${b.done ? 'done' : ''}" style="--pc:#8B7CF0;padding:12px 14px;align-items:center"><button class="tcheck" data-act="checkBtn" data-id="${esc(b.id)}" data-done="${b.done ? 1 : 0}" aria-pressed="${!!b.done}" aria-label="${esc(b.title)}" style="width:28px;height:28px;margin:0"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button><div class="tbody"><div class="ttitle" style="margin:0;font-size:15.5px">${esc(b.title)}</div></div></article>`).join('')}</div></div></div>`;
  }
  function vSuppliers() {
    const form = `<div class="form"><div class="field wide"><label for="c-n">Name</label><input type="text" id="c-n"></div><div class="field"><label for="c-t">Type</label><select id="c-t">${opt(SUP_TYPES)}</select></div><div class="field"><label for="c-p">Phone / WhatsApp</label><input type="tel" id="c-p" placeholder="e.g. 9XXXXXXX"></div><div class="field"><label for="c-q">Quote per set (KD)</label><input type="number" inputmode="decimal" min="0" step="0.5" id="c-q"></div><div class="field wide"><label for="c-x">Notes</label><input type="text" id="c-x" placeholder="lead time, minimums…"></div><button class="btn solid" data-act="addSup">Save supplier</button></div>`;
    const types = SUP_TYPES.filter(tp => S.d.suppliers.some(c => c.type === tp));
    return ph('Suppliers', `${S.d.suppliers.length} saved${S.d.suppliers.some(c => c.chosen) ? ' · ' + S.d.suppliers.filter(c => c.chosen).length + ' chosen' : ''}`) + addBox('sup', 'Add supplier', form, !S.d.suppliers.length) +
      `<div class="sec" style="margin-top:20px">${types.map(tp => { const list = S.d.suppliers.filter(c => c.type === tp).sort((a, b) => (b.chosen - a.chosen) || (num(a.quote) || 1e9) - (num(b.quote) || 1e9)); return `<h3 class="cap" style="margin:18px 0 8px">${esc(tp)}${list.length > 1 && list.some(c => num(c.quote)) ? ' · cheapest first' : ''}</h3><div class="grid g3">${list.map(c => `<article class="card sup ${c.chosen ? 'chosen' : ''}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div><b>${esc(c.name)}</b>${c.chosen ? ' <span class="pill ok">Chosen</span>' : ''}<div class="small muted">added by ${isMe(c.created_by) ? 'you' : esc(nameOf(c.created_by))}</div></div><button class="x" data-act="delSup" data-id="${esc(c.id)}" aria-label="Delete">✕</button></div>
        ${num(c.quote) ? `<div class="pv" style="margin-top:10px">${kd(c.quote)}<span class="small muted"> / set</span></div>` : ''}${c.notes ? `<p class="small muted" style="margin:6px 0 0">${esc(c.notes)}</p>` : ''}
        <div class="row" style="margin-top:12px">${c.phone ? `<a class="btn sm" href="${esc(waLink(c.phone))}" target="_blank" rel="noopener">WhatsApp</a><a class="btn sm" href="tel:${esc(c.phone)}">Call</a>` : ''}<button class="btn sm ${c.chosen ? '' : 'lav'}" data-act="chooseSup" data-id="${esc(c.id)}" data-v="${c.chosen ? 0 : 1}">${c.chosen ? 'Unchoose' : 'Choose'}</button></div></article>`).join('')}</div>`; }).join('')}</div>`;
  }
  function vSettings() {
    const st = S.d.settings;
    const f = (k, label, step, hint, isPct) => `<div class="field"><label for="s-${k}">${label}</label><input type="number" id="s-${k}" step="${step}" data-act="setting" data-k="${k}" ${isPct ? 'data-pct="1"' : ''} value="${esc(isPct ? Math.round(num(st[k]) * 100) : num(st[k]))}">${hint ? `<span class="small muted">${hint}</span>` : ''}</div>`;
    return ph('Settings', 'Shared by both of you. Changes recalculate straight away.') +
      `<div class="form" style="align-items:start;margin-bottom:16px"><div class="field wide"><label for="s-name">Business name</label><input type="text" id="s-name" data-act="settingText" data-k="brand_name" value="${esc(st.brand_name || '')}"></div></div>
      <div class="form" style="align-items:start">${f('tasks_per_day', 'Tasks per person per day', '1', 'The daily feed size')}${f('budget', 'Startup budget (KD)', '1')}${f('multiplier', 'Price multiplier', '0.1', 'Price = full cost × this')}${f('round_to', 'Round prices up to (KD)', '0.5')}${f('target_min', 'Target price from (KD)', '1')}${f('target_max', 'Target price to (KD)', '1')}${f('planned_sets', 'Planned sets this drop', '1', 'Overheads are spread over these')}${f('pack_size', 'Household pack size', '1')}${f('pack_discount', 'Pack discount (%)', '1', '', true)}
      <label class="row" style="min-height:40px;align-self:center"><input type="checkbox" data-act="incl" ${st.include_overheads ? 'checked' : ''} style="width:18px;height:18px;accent-color:#1C1917"><span>Include overheads in prices</span></label></div>
      <div class="sec card"><h3>Members</h3><p class="small muted" style="margin:0 0 8px">Add or remove people in Supabase → Table Editor → members.</p>${S.d.members.map(m => `<div class="row small" style="min-height:32px">${av(m.email)}${esc(m.name || '')} <span class="muted">${esc(m.email)}</span></div>`).join('')}</div>
      ${DEMO ? '<div class="sec"><button class="btn" data-act="reset">Reset demo data</button></div>' : '<div class="sec"><button class="btn" data-act="signout">Sign out</button></div>'}`;
  }
  const VIEWS = { today: vToday, team: vTeam, plan: vPlan, money: vMoney, expenses: vExpenses, orders: vOrders, pricing: vPricing, drop: vDrop, kit: vKit, stock: vStock, instagram: vInstagram, expos: vExpos, suppliers: vSuppliers, settings: vSettings };

  /* ============================ shell ============================ */
  function navHtml(open) {
    return NAV.map(g => `<div class="grp">${g[0]}</div>` + g[1].map(p => `<button data-tab="${p[0]}" ${p[0] === S.page ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[p[0]] || ''}</svg>${p[1]}${p[0] === 'today' && open ? `<span class="badge">${open}</span>` : ''}</button>`).join('')).join('');
  }
  function render() {
    if (!S.d) return;
    const st = S.d.settings, open = S.d.todayList.filter(t => !t.done).length;
    const lg = (S.d.assets || []).find(a => (a.slot === 'logo_icon' || a.slot === 'logo') && /^image\//.test(a.mime) && S.urls && S.urls[a.path]);
    const logo = `<div class="logo">${lg ? `<img src="${esc(S.urls[lg.path])}" alt="" style="width:34px;height:34px;border-radius:10px;object-fit:cover">` : `<i aria-hidden="true">${esc(String(st.brand_name || 'B').slice(0, 1).toLowerCase())}</i>`}<div><b>${esc(st.brand_name || 'Business HQ')}</b><small>${st.brand_name && st.brand_name !== 'Business HQ' ? 'Business HQ' : 'Ramadan drop'}</small></div></div>`;
    const who = `<div class="big" aria-hidden="true">${esc(nameOf(S.me).slice(0, 1).toUpperCase())}</div><b>${esc(nameOf(S.me))}</b><span>${DEMO ? 'Demo mode' : esc(S.me || '')}</span>${DEMO ? '' : `<span style="text-transform:none;letter-spacing:0"><i class="dot ${S.live ? 'live' : ''}"></i> ${S.live ? 'Live' : 'Connecting'}</span>`}`;
    const y = window.scrollY;
    $app.innerHTML = `<div class="app"><aside>${logo}<nav aria-label="Sections">${navHtml(open)}</nav><div class="who">${who}</div></aside>
      <div class="wrap"><div class="mob"><div class="top">${logo}<span style="margin-left:auto" class="small muted">${DEMO ? 'Demo' : ''}</span></div></div>
      <main>${DEMO ? '<div class="banner">Demo mode: saved in this browser only, and you play both roles. Add your Supabase details to <b>config.js</b> to share it with your partner (see README).</div>' : ''}${VIEWS[S.page]()}</main></div></div>
      <nav class="tabbar" aria-label="Main">${[['today', 'Today', ['today']], ['plan', 'Plan', ['plan']], ['money', 'Money', ['money', 'expenses', 'orders']], ['kit', 'Brand kit', ['kit']]].map(([p, l, grp]) => `<button data-tab="${p}" ${grp.includes(S.page) ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[p]}</svg><span>${l}</span>${p === 'today' && open ? `<em>${open}</em>` : ''}</button>`).join('')}<button data-act="more" aria-expanded="${!!S.ui.more}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span>More</span></button></nav>
      ${S.ui.more ? `<div class="sheet" role="dialog" aria-label="All sections"><div class="sheet-in"><div class="row" style="justify-content:space-between"><h2 style="margin:0">All sections</h2><button class="x" data-act="more" aria-label="Close">✕</button></div>${NAV.map(g => `<div class="cap" style="margin:16px 0 6px">${g[0]}</div><div class="sgrid">${g[1].map(p => `<button data-tab="${p[0]}" ${p[0] === S.page ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[p[0]] || ''}</svg>${p[1]}</button>`).join('')}</div>`).join('')}</div></div>` : ''}`;
    window.scrollTo(0, y);
    applySearch();
  }
  function applySearch() { const q = (S.q || '').trim().toLowerCase(); document.querySelectorAll('main tbody tr, main .task, main .feed > div, main .note, main .grid > .card').forEach(el => { el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none'; }); }
  function renderLogin(msg) {
    $app.innerHTML = `<div class="auth"><h1>${esc(CFG.BRAND_NAME && CFG.BRAND_NAME !== 'Business HQ' ? CFG.BRAND_NAME : 'myuniform.kw')}</h1><p class="muted">Sign in with your email and we’ll send you a link.</p><div class="form" style="grid-template-columns:1fr;text-align:left;margin-top:22px"><div class="field"><label for="l-email">Email</label><input type="email" id="l-email" autocomplete="email"></div><button class="btn solid" data-act="login">Email me a sign-in link</button></div>${msg ? `<p class="small" style="margin-top:14px">${msg}</p>` : ''}</div>`;
  }
  function renderNotMember() { $app.innerHTML = `<div class="auth"><h1>Almost there</h1><p class="muted">${esc(S.me)} isn’t on the members list yet. Add it to the <b>members</b> table in Supabase (see README), then reload.</p><button class="btn" data-act="signout" style="margin-top:16px">Sign out</button></div>`; }


  /* in-app dialogs (browser pop-ups are blocked in some views) */
  function ask(title, fields, okLabel, danger) {
    return new Promise(resolve => {
      const prev = document.activeElement, wrap = document.createElement('div');
      wrap.className = 'modal'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', title);
      wrap.innerHTML = `<div class="modal-in"><p class="modal-t">${esc(title)}</p>${(fields || []).map((f, i) => `<label class="field" style="margin-top:12px"><span>${esc(f[0])}</span><input type="${f[2] || 'text'}" value="${esc(f[1] || '')}" data-i="${i}"></label>`).join('')}
        <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" data-m="no">Cancel</button><button class="btn solid" data-m="ok" style="${danger ? 'background:var(--bad);border-color:var(--bad)' : ''}">${esc(okLabel || 'OK')}</button></div></div>`;
      const done = v => { wrap.remove(); document.removeEventListener('keydown', key, true); if (prev && prev.focus) prev.focus(); resolve(v); };
      const vals = () => [...wrap.querySelectorAll('input')].map(x => x.value);
      const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); done(null); } if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); done(fields && fields.length ? vals() : true); } };
      wrap.addEventListener('click', ev => { const m = ev.target.closest('[data-m]'); if (ev.target === wrap) done(null); else if (m) done(m.dataset.m === 'ok' ? (fields && fields.length ? vals() : true) : null); ev.stopPropagation(); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(wrap);
      (wrap.querySelector('input') || wrap.querySelector('[data-m=ok]')).focus();
    });
  }
  const askOk = msg => ask(msg, null, /^Delete|^Clear/.test(msg) ? 'Delete' : /^Remove/.test(msg) ? 'Remove' : 'Yes', /^Delete|^Clear/.test(msg)).then(Boolean);

  /* ============================ events ============================ */
  const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const go = p => { S.ui.more = false; p = ALIAS[p] || p; S.page = p; try { history.replaceState(null, '', '#' + p); } catch (_) { } render(); window.scrollTo(0, 0); };
  document.addEventListener('click', async e => {
    const tab = e.target.closest('[data-tab]'); if (tab) { go(tab.dataset.tab); return; }
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id, st = S.d && S.d.settings;
    switch (act) {
      case 'login': { const email = v('l-email').trim(); if (!email) return; b.disabled = true; sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }).then(r => renderLogin(r.error ? 'Couldn’t send the link: ' + esc(r.error.message) : `Check <b>${esc(email)}</b> for your sign-in link.`)); return; }
      case 'signout': sb.auth.signOut().then(() => location.reload()); return;
      case 'reset': if (await askOk('Clear all demo data?')) { localStorage.removeItem('rd-hq'); refresh({ force: true }); } return;
      case 'taskToggle': { const was = b.dataset.done === '1'; b.closest('.tcard') && b.closest('.tcard').classList.add(was ? 'undo' : 'pop'); run(API.upd('tasks', id, was ? { done: false, done_by: null, done_at: null } : { done: true, done_by: S.me, done_at: new Date().toISOString() }), was ? 'Reopened' : 'Done ✓', { afterTask: true }); return; }
      case 'openTask': S.ui.open = S.ui.open === id ? null : id; render(); return;
      case 'reassign': { const to = b.dataset.to; run(API.upd('tasks', id, { assigned_to: to, scheduled_for: today(), owner: isMe(to) ? null : to }), isMe(to) ? 'Added to your list' : 'Handed to ' + nameOf(to), { afterTask: true }); return; }
      case 'expoApplied': run(API.upd('expos', id, { status: 'Applied' }), 'Marked as applied'); return;
      case 'orderStatus': run(API.upd('orders', id, { status: b.dataset.v }), 'Order updated'); return;
      case 'markPaid': run(API.upd('orders', id, { deposit: num(b.dataset.v) }), 'Marked as paid'); return;
      case 'palAdd': { const pal = (S.d.settings.palette || []).concat([{ hex: '#D6CDFA', name: '' }]); run(API.settings({ palette: pal })); return; }
      case 'palDel': { const pal = (S.d.settings.palette || []).filter((_, i) => i !== Number(b.dataset.i)); run(API.settings({ palette: pal })); return; }
      case 'delAsset': { const a = (S.d.assets || []).find(x => x.id === id); if (a && await askOk('Delete ' + a.name + '?')) run(API.removeAsset(a), 'Deleted'); return; }
      case 'openFile': { const p = b.dataset.path; API.urls([p]).then(o => { if (o[p]) window.open(o[p], '_blank', 'noopener'); }); return; }
      case 'more': S.ui.more = !S.ui.more; render(); return;
      case 'openReview': S.ui.review = true; if (S.page !== 'today') go('today'); else render(); setTimeout(() => { const el = document.getElementById('rv-w'); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }, 50); return;
      case 'closeReview': S.ui.review = false; render(); return;
      case 'saveReview': { const ws = weekStart(), goals = [0, 1, 2].map(i => [v('rv-g' + i).trim(), v('rv-o' + i)]).filter(g => g[0]); const ph0 = currentPhase();
        if (!goals.length && !v('rv-w').trim() && !v('rv-s').trim()) { toast('Add at least one goal.'); return; }
        S.ui.review = false;
        run((async () => { const r = await API.ins('weekly_reviews', { week_start: ws, author: S.me, wins: v('rv-w').trim(), stuck: v('rv-s').trim(), goals: goals.map(g => g[0]) }); if (r && r.error && !/duplicate|unique/i.test(r.error.message || '')) return r;
          for (const [title, owner] of goals) { const mine = owner && isMe(owner); const x = await API.ins('tasks', { phase_id: ph0 ? ph0.id : null, title, details: 'Weekly goal.', sort: 0, kind: 'goal', week_start: ws, owner: owner || null, assigned_to: mine ? S.me : null, scheduled_for: mine ? today() : null }); if (x && x.error) return x; }
          return {}; })(), 'Week planned'); return; }
      case 'addColor': { const sid = Number(b.dataset.sid), c = v('nc-' + sid).trim(); if (!c) return; S.ui.colors = S.ui.colors || {}; S.ui.colors[sid] = (S.ui.colors[sid] || []).concat(c); render(); return; }
      case 'like': { const a = (S.d.assets || []).find(x => x.id === id); if (!a) return; const l = a.likes || [], on = l.some(isMe); run(API.upd('assets', id, { likes: on ? l.filter(e => !isMe(e)) : l.concat(S.me) })); return; }
      case 'ideaToSet': { const a = (S.d.assets || []).find(x => x.id === id); if (!a) return; const r = await ask('Make it a set', [['Set name', a.note || 'New set', 'text'], ['Target price (KD)', String(num(S.d.settings.target_min) || 14), 'number']], 'Add to drop'); if (!r || !r[0].trim()) return; const name = r[0]; const price = num(r[1]) || num(S.d.settings.target_min) || 14; const sort = Math.max(0, ...S.d.styles.map(x => x.sort || 0)) + 1;
        S.ui.drop = activeStyles().length; run(API.ins('styles', { name: name.trim(), target_price: price, sort, active: true, image_path: a.path, notes: a.note || '' }), 'Added to the drop'); return; }
      case 'addSet': { const name = v('ns-n').trim(); if (!name) { toast('Give the set a name.'); return; } const sort = Math.max(0, ...S.d.styles.map(x => x.sort || 0)) + 1; S.ui.add.set = false; S.ui.drop = activeStyles().length;
        run(API.ins('styles', { name, target_price: num(v('ns-p')) || 14, sort, active: true, notes: v('ns-d').trim() }), 'Set added'); return; }
      case 'removeSet': if (await askOk('Remove this set from the drop? You can bring it back later.')) { S.ui.drop = 0; run(API.upd('styles', id, { active: false }), 'Removed from the drop'); } return;
      case 'restoreSet': run(API.upd('styles', id, { active: true }), 'Back in the drop'); return;
      case 'deleteSet': { const st = S.d.styles.find(x => String(x.id) === String(id)); if (!st) return; const n = S.d.orders.filter(o => String(o.style_id) === String(id)).length;
        if (n) { toast(`${st.name} has ${n} order${n === 1 ? '' : 's'}, so it can’t be deleted. Keep it removed instead.`); return; }
        if (!await askOk(`Delete “${st.name}” for good? Its price and notes will be gone. Expenses logged for it stay in your totals.`)) return;
        const exps = S.d.expenses.filter(e => String(e.style_id) === String(id));
        run((async () => { for (const e of exps) { const r = await API.upd('expenses', e.id, { scope: 'general', style_id: null }); if (r && r.error) return r; } return API.del('styles', id); })(), 'Set deleted'); return; }
      case 'toggleAdd': { S.ui.add = S.ui.add || {}; const k = b.dataset.k, cur = b.getAttribute('aria-expanded') === 'true'; S.ui.add[k] = !cur; render(); if (!cur) { const f = document.querySelector('.form input, .form select'); if (f) f.focus(); } return; }
      case 'feedMore': S.ui.feedN = (S.ui.feedN || 12) + 20; render(); return;
      case 'checkBtn': run(API.upd('checklist', id, b.dataset.done === '1' ? { done: false, done_by: null, done_at: null } : { done: true, done_by: S.me, done_at: new Date().toISOString() })); return;
      case 'chooseSup': run(API.upd('suppliers', id, { chosen: b.dataset.v === '1' }), b.dataset.v === '1' ? 'Chosen' : 'Updated'); return;
      case 'snooze': { const tm = new Date(Date.parse(today()) + 864e5).toISOString().slice(0, 10); run(API.upd('tasks', id, { assigned_to: null, scheduled_for: null, snoozed_until: tm }), 'Moved off today’s list', { afterTask: true }); return; }
      case 'addTask': { const t = v('nt-' + b.dataset.ph).trim(); if (!t) return; const n = S.d.tasks.filter(x => x.phase_id === b.dataset.ph).length + 1; run(API.ins('tasks', { phase_id: b.dataset.ph, title: t, sort: n }), 'Task added'); return; }
      case 'delTask': if (await askOk('Delete this task?')) run(API.del('tasks', id), 'Task deleted'); return;
      case 'feed': S.ui.feed = b.dataset.v; S.ui.feedN = 12; render(); return;
      case 'addExpense': { const cat = v('e-cat'), kind = (S.d.categories.find(c => c.name === cat) || {}).kind, scope = kind === 'overhead' ? 'general' : (v('e-scope') || 'style');
        const r = { spent_on: v('e-date') || today(), category: cat, scope, style_id: scope === 'style' ? Number(v('e-style')) : null, item: v('e-item').trim(), supplier: v('e-sup').trim(), amount: num(v('e-amt')), sets_covered: kind === 'per_set' && num(v('e-sets')) ? Math.round(num(v('e-sets'))) : null };
        if (!r.amount) { toast('Enter the amount paid.'); return; }
        if (kind === 'per_set' && !r.sets_covered && !await askOk('No “sets it covers” entered, so this won’t change prices. Add it anyway?')) return;
        S.ef = { category: r.category, scope: r.scope, style_id: r.style_id, spent_on: r.spent_on }; S.ui.add = Object.assign(S.ui.add || {}, { exp: false }); run(API.ins('expenses', r), 'Expense added'); return; }
      case 'delExpense': if (await askOk('Delete this expense?')) run(API.del('expenses', id), 'Expense deleted'); return;
      case 'addOrder': { const r = { ordered_on: v('o-date') || today(), customer: v('o-cust').trim(), channel: v('o-ch'), style_id: Number(v('o-style')), qty: Math.max(1, Math.round(num(v('o-qty')) || 1)), price_charged: num(v('o-price')) || null, discount_pct: num(v('o-disc')), deposit: num(v('o-dep')), embroidery: v('o-emb').trim(), size: v('o-size'), color: v('o-color').trim() };
        if (!r.size || !r.color) { r.size = r.size || ''; r.color = r.color || ''; }
        if (!r.customer) { toast('Add the customer’s name.'); return; } r.status = r.deposit > 0 ? 'Deposit paid' : 'New'; S.of = { channel: r.channel, ordered_on: r.ordered_on }; S.ui.add = Object.assign(S.ui.add || {}, { ord: false }); run(API.ins('orders', r), 'Order added'); return; }
      case 'delOrder': if (await askOk('Delete this order?')) run(API.del('orders', id), 'Order deleted'); return;
      case 'drop': S.ui.drop = Number(b.dataset.i); render(); return;
      case 'useName': run(API.settings({ brand_name: b.dataset.n, brand_ar: b.dataset.ar }), 'Name updated'); return;
      case 'customName': { const n = v('cn').trim(); if (!n) return; run(API.settings({ brand_name: n, brand_ar: v('ca').trim() || st.brand_ar }), 'Name updated'); return; }
      case 'star': { const sl = JSON.parse(JSON.stringify(st.shortlist || {})), mine = sl[S.me] || []; sl[S.me] = mine.includes(b.dataset.n) ? mine.filter(x => x !== b.dataset.n) : mine.concat(b.dataset.n); run(API.settings({ shortlist: sl })); return; }
      case 'igTab': S.ui.ig = b.dataset.v; render(); return;
      case 'pickPost': S.ui.post = Number(b.dataset.v); render(); return;
      case 'copy': { const t = b.dataset.txt, done = () => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); }; try { navigator.clipboard.writeText(t).then(done, done); } catch (_) { done(); } return; }
      case 'addExpo': { const n = v('x-n').trim(); if (!n) return; run(API.ins('expos', { name: n, apply_by: v('x-d') || null, starts: v('x-s') || null, fee: num(v('x-f')), location: v('x-l').trim(), status: 'Researching' }), 'Exhibition added'); S.ui.add = Object.assign(S.ui.add || {}, { expo: false }); return; }
      case 'delExpo': if (await askOk('Delete this exhibition?')) run(API.del('expos', id), 'Deleted'); return;
      case 'addSup': { const n = v('c-n').trim(); if (!n) return; run(API.ins('suppliers', { name: n, type: v('c-t'), phone: v('c-p').trim(), quote: num(v('c-q')) || null, notes: v('c-x').trim() }), 'Supplier added'); S.ui.add = Object.assign(S.ui.add || {}, { sup: false }); return; }
      case 'delSup': if (await askOk('Delete this supplier?')) run(API.del('suppliers', id), 'Deleted'); return;
    }
  });
  document.addEventListener('change', e => {
    const el = e.target, act = el.dataset && el.dataset.act;
    if (el.dataset && el.dataset.keep) { S.ef = Object.assign(S.ef, { [el.dataset.keep]: el.value, item: v('e-item'), supplier: v('e-sup'), amount: v('e-amt'), sets_covered: v('e-sets'), spent_on: v('e-date') }); render(); return; }
    if (!act) return; const id = el.dataset.id;
    const doneP = c => c ? { done: true, done_by: S.me, done_at: new Date().toISOString() } : { done: false, done_by: null, done_at: null };
    switch (act) {
      case 'upload': { const files = [...(el.files || [])]; if (files.length) uploadFiles(el.dataset.slot, files); break; }
      case 'palColor': { const pal = (S.d.settings.palette || []).map((c, i) => i === Number(el.dataset.i) ? Object.assign({}, c, { hex: el.value }) : c); run(API.settings({ palette: pal })); break; }
      case 'palName': { const pal = (S.d.settings.palette || []).map((c, i) => i === Number(el.dataset.i) ? Object.assign({}, c, { name: el.value }) : c); run(API.settings({ palette: pal })); break; }
      case 'taskDone': run(API.upd('tasks', id, doneP(el.checked)), el.checked ? 'Done' : 'Reopened', { afterTask: true }); break;
      case 'planDone': run(API.upd('tasks', id, doneP(el.checked)), el.checked ? 'Done' : 'Reopened', { afterTask: true }); break;
      case 'owner': run(API.upd('tasks', id, { owner: el.value || null }), 'Saved'); break;
      case 'dep': { const dep = num(el.value), o = S.d.orders.find(x => String(x.id) === id), p = { deposit: dep }; if (o && dep > 0 && o.status === 'New') p.status = 'Deposit paid'; run(API.upd('orders', id, p), 'Deposit saved'); break; }
      case 'status': run(API.upd('orders', id, { status: el.value }), 'Status updated'); break;
      case 'override': run(API.override(Number(id), num(el.value)), num(el.value) ? 'Price set' : 'Back to automatic price'); break;
      case 'setting': { let val = num(el.value); if (el.dataset.pct) val = val / 100; run(API.settings({ [el.dataset.k]: val }), 'Settings saved'); break; }
      case 'incl': run(API.settings({ include_overheads: el.checked }), 'Settings saved'); break;
      case 'ideaNote': run(API.upd('assets', id, { note: el.value.trim() })); break;
      case 'setNotes': run(API.upd('styles', id, { notes: el.value })); break;
      case 'setPrice': run(API.upd('styles', id, { target_price: num(el.value) || 1 }), 'Price saved'); break;
      case 'stockQty': run(API.setStock(Number(el.dataset.sid), el.dataset.size, el.dataset.color, Math.max(0, Math.round(num(el.value)))), 'Stock saved'); break;
      case 'settingText': run(API.settings({ [el.dataset.k]: el.value.trim() }), 'Saved'); break;
      case 'post': run(API.upd('ig_posts', id, { [el.dataset.k]: el.value || (el.dataset.k === 'post_date' ? null : '') }), 'Saved'); break;
      case 'bio': run(API.settings({ ig_bio: el.value }), 'Bio saved'); break;
      case 'check': run(API.upd('checklist', id, el.checked ? { done: true, done_by: S.me, done_at: new Date().toISOString() } : { done: false, done_by: null, done_at: null })); break;
      case 'expoSt': run(API.upd('expos', id, { status: el.value }), 'Status updated'); break;
      case 'chosen': run(API.upd('suppliers', id, { chosen: el.checked }), 'Saved'); break;
    }
  });
  document.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; applySearch(); } });
  async function uploadFiles(slot, files) {
    toast(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
    let ok = 0; for (const f of files) { try { const r = await API.upload(slot, f); if (r && r.error) toast('Not uploaded: ' + r.error.message); else ok++; } catch (e) { toast('Upload failed'); } }
    if (ok) toast(`${ok} file${ok === 1 ? '' : 's'} added`); await refresh({ force: true });
  }
  document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('.slot'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('.slot'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  document.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('.slot'); if (!z) return; e.preventDefault(); z.classList.remove('over'); const files = [...(e.dataTransfer.files || [])]; if (files.length) uploadFiles(z.dataset.slot, files); });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (S.dirty && !(a && a.closest && a.closest('.form'))) { S.dirty = false; render(); } }, 0));
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'l-email') document.querySelector('[data-act="login"]').click(); if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('nt-')) { const btn = e.target.parentNode.querySelector('[data-act="addTask"]'); if (btn) btn.click(); } });

  /* ============================ start ============================ */
  async function start() {
    if (DEMO) { S.me = 'you@demo'; await refresh({ force: true }); return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    const user = data.session && data.session.user; S.me = user && user.email;
    if (user && /access_token|refresh_token|type=magiclink/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + '#today'); } catch (_) { } }
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
