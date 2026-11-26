/* ===== prototype: every other screen and state of the app (docs/redesign/INVENTORY.md) =====
   Injected into direction E's script scope: function declarations here replace the direction's ones,
   the direction's originals stay reachable as *C1. Fake data only. */
const XD = {
  bank: 1243650,
  target: 400000,
  savings: [
    {id: 's1', name: 'Emergency fund', mark: 'savings', balance: 4200000, goal: 6000000, history: [{date: '2026-10-30', kind: 'add', amount: 400000}, {date: '2026-09-30', kind: 'add', amount: 400000}, {date: '2026-08-29', kind: 'set', amount: 3400000}]},
    {id: 's2', name: 'Summer trip', mark: 'plane', balance: 850000, goal: 1500000, history: [{date: '2026-11-02', kind: 'add', amount: 250000}, {date: '2026-10-01', kind: 'add', amount: 600000}]},
  ],
  loans: [
    {id: 'l1', name: 'Student loan', principal: 12000000, remaining: 7450000, history: [{date: '2026-11-02', kind: 'repaid', amount: 150000}, {date: '2026-10-02', kind: 'repaid', amount: 150000}, {date: '2023-08-15', kind: 'borrowed', amount: 12000000}]},
    {id: 'l2', name: 'New phone', principal: 600000, remaining: 0, history: [{date: '2026-06-01', kind: 'repaid', amount: 600000}, {date: '2025-12-01', kind: 'borrowed', amount: 600000}]},
  ],
  owed: [
    {id: 'o1', name: 'Jonas', principal: 120000, remaining: 60000, history: [{date: '2026-11-14', kind: 'repaid', amount: 60000}, {date: '2026-11-03', kind: 'lent', amount: 120000}]},
    {id: 'o2', name: 'Mikkel', principal: 30000, remaining: 0, history: [{date: '2026-10-12', kind: 'repaid', amount: 30000}, {date: '2026-10-05', kind: 'lent', amount: 30000}]},
  ],
  rules: [
    {id: 'r1', pattern: 'rema 1000', match: 'prefix', kind: 'expense', cat: 'groceries'},
    {id: 'r2', pattern: 'rejsekort', match: 'contains', kind: 'expense', cat: 'transport'},
    {id: 'r3', pattern: 'top-up from anna', match: 'exact', kind: 'expense', topup: true, note: 'Anna’s part for the pot'},
    {id: 'r4', pattern: 'netflix', match: 'exact', kind: 'expense', cat: 'fun'},
    {id: 'r5', pattern: 'mobilepay', match: 'contains', kind: 'income', block: true},
  ],
  people: [{id: 'p1', name: 'Anna'}],
  subs: {groceries: [['Supermarket', 'basket'], ['Bakery', 'store']], eating_out: [['Coffee', 'cup'], ['Restaurants', 'utensils']], transport: [['Train', 'train'], ['Taxi', 'taxi']], home: [['Rent', 'house'], ['Repairs', 'wrench']], fun: [['Films', 'film'], ['Music', 'music']], shopping: [['Clothes', 'shirt'], ['Tech', 'laptop']]},
  imports: [
    {id: 'i1', name: 'NETTO 4021', amount: 8450, date: '2026-11-24', kind: 'expense', cat: 'groceries'},
    {id: 'i2', name: '7-ELEVEN KBH H', amount: 3200, date: '2026-11-24', kind: 'expense', cat: null},
    {id: 'i3', name: 'DSB APP', amount: 9600, date: '2026-11-23', kind: 'expense', cat: 'transport'},
    {id: 'i4', name: 'MobilePay Jonas', amount: 15000, date: '2026-11-22', kind: 'income', cat: 'other_income'},
  ],
  name: 'Seva', reminder: true,
};
const AUTH = ['signin', 'signup', 'consent', 'callback'];
const FORMS = {
  'f-budget': {on: 'budget'}, 'f-target': {on: 'plan'}, 'f-category': {on: 'categories'}, 'f-person': {on: 'categories'}, 'f-rule': {on: 'rules'},
  'f-savings': {on: 'bank'}, 'f-loan': {on: 'bank'}, 'f-owed': {on: 'bank'}, 'f-import': {on: 'home'},
  'f-bulkcat': {on: 'transactions'}, 'f-bulkdate': {on: 'transactions'}, 'f-bulkdel': {on: 'transactions'},
};
let formId = null, formArg = null, FS = {}, selMode = false, selSet = new Set(), delAsk = false, olderOpen = 0, flowPer = 'cycle', sharedPer = 'cycle', planOff = 0, editId = null, sugOff = false;
const pctOf = (a, b) => b ? Math.round(100 * a / b) : 0;
const allCats = () => D.categories.concat(XD.extraCats || []);
const parseMinor = v => { const m = String(v || '').replace(/\s|kr\.?/g, '').match(/^(\d{1,7})(?:[.,](\d{0,2}))?$/); return m ? parseInt(m[1], 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10) : null; };
const minorIn = m => m ? (m / 100).toFixed(2).replace('.', ',').replace(',00', '') : '';
const offBar = () => `<div class="offline" role="status">${ic('offline')}<span>Offline. Showing what was loaded at 14:02. New transactions save on this phone and sync later.</span></div>`;
const avatarBtn = () => `<button class="iconbtn" data-go="profile" data-push="1" aria-label="Profile and settings"><span class="avatar" style="width:32px;height:32px;font-size:13px">S</span></button>`;
const navRow = (go, mark, name, sub, end) => `<button class="linkrow" data-go="${go}" data-push="1"><span class="who">${ic(mark)}</span><span>${name}${sub ? `<span class="sub">${sub}</span>` : ''}</span><span class="end">${end || ''}${ic('chev')}</span></button>`;
const sw = (key, on, label, sub) => `<button class="sw" role="switch" aria-checked="${!!on}" data-p="toggle" data-arg="${key}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
const segOf = (key, val, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-p="seg" data-arg="${key}:${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</div>`;
const stateTop = what => state === 'error' ? errBar(what) : '';

/* where the owner goes from Cycle on a phone: Where it went sits under the card */
function whereLink(m){
  if (!m.spent) return '';
  return `<div class="panel" style="margin-top:8px">${navRow('analytics', 'where', 'Where it went', `${kr(m.spent, true)} spent, ${kr(Math.abs(m.spent - lastTotal), true)} ${m.spent >= lastTotal ? 'more' : 'less'} than ${D.last_cycle.label}`)}</div>`;
}

/* Cycle: a brand-new account has no salary yet, so no cycle */
function home(){
  if (state !== 'new') return homeC1();
  return `${header('Cashflow', {right: avatarBtn(), big: 'Welcome'})}
  <div class="cols"><div><section class="newcard"><h2>Your first cycle starts on payday</h2><p>Cashflow counts from one salary to the next. Log your last salary and the cycle starts.</p><button class="btn" data-p="salary">${ic('in')}Log your salary</button></section>
  <div class="panel steps3"><div><b>1</b><span>Log your salary</span></div><div><b>2</b><span>Set a budget per category</span></div><div><b>3</b><span>Add what you spend, in three taps</span></div></div></div>
  <div><h2 class="sec">With Anna</h2><div class="panel"><div class="empty"><b>Nothing shared yet</b>Money you both move into the pot, and what you spend from it, shows here.</div></div></div></div>`;
}

/* Transactions: older cycles below this one, and a select mode for changes to many */
function transactions(){
  let h = transactionsC1();
  if (selMode) h = h.replace(/<div class="filters">[\s\S]*?<\/div>\s*<\/div>/, `<div class="filters"><b style="padding:0 4px">${selSet.size ? `${selSet.size} selected` : 'Select transactions'}</b><span class="spacer"></span><button class="btn link" data-p="selall">All</button><button class="btn ghost" data-p="selcancel" style="min-height:38px">Cancel</button></div>`);
  if (state !== 'content' && state !== 'offline' && state !== 'error') return h;
  if (query || !curT().length) return h;
  const old = txList(D.last_cycle_transactions);
  const days = [...new Set(old.map(t => t.date))].slice(0, olderOpen ? 40 : 4);
  const older = `<h2 class="sec" style="margin-top:28px">${D.last_cycle.label} cycle <span class="num" style="font-weight:500">${fTime(D.last_cycle.start)} <span class="dash">–</span> ${fTime(addDays(D.last_cycle.end_exclusive, -1))}</span></h2>
    ${days.map(d => { const items = old.filter(t => t.date === d); const tot = items.filter(t => t.kind === 'expense').reduce((a, t) => a + t.amount_minor, 0);
      return `<div class="dayh"><span>${fDay.format(dUTC(d))}</span>${tot ? `<span class="num">${kr(tot)}</span>` : ''}</div><div class="panel">${items.map(t => txRow(t)).join('')}</div>`; }).join('')}
    <div style="text-align:center;padding:18px 0 8px">${olderOpen > 1 ? '<p class="note" style="text-align:center">Nothing older. Your first salary was logged on 30 Sep.</p>' : `<button class="btn ghost" data-p="older">Load older</button>`}</div>`;
  return h.replace(/(\s*<\/div>\s*<div class="deskdetail">)/, older + '$1');
}
function decorateSelect(){
  if (!selMode || screen !== 'transactions') { document.getElementById('selbar')?.remove(); return; }
  document.querySelectorAll('#view .row[data-tx]').forEach(r => { const on = selSet.has(r.dataset.tx); r.setAttribute('aria-pressed', on); r.querySelector('.who').innerHTML = `<span class="check ${on ? 'on' : ''}">${on ? ic('check') : ''}</span>`; });
  let bar = document.getElementById('selbar'); if (!bar) { bar = document.createElement('div'); bar.id = 'selbar'; bar.className = 'selbar'; document.body.append(bar); }
  const picked = txs.filter(t => selSet.has(t.id)), anyTop = picked.some(t => t.kind === 'topup'), allShared = picked.length && picked.every(t => t.shared);
  const dis = selSet.size ? '' : 'disabled';
  bar.innerHTML = `<button data-p="bulkmove" ${dis || (anyTop ? 'disabled title="Top-ups to the pot cannot be moved"' : '')}>${ic(allShared ? 'profile' : 'shared')}${allShared ? 'To personal' : 'To shared'}</button>
    <button data-go="f-bulkcat" ${dis}>${ic('tag')}Category</button><button data-go="f-bulkdate" ${dis}>${ic('cal')}Date</button><button class="del" data-go="f-bulkdel" ${dis}>${ic('trash')}Delete</button>`;
}

/* detail: the actions a row has */
function detailBody(t){
  const acts = t.kind === 'topup' ? '' : `<button class="linkrow" data-p="edit" data-arg="${t.id}"><span class="who">${ic('edit')}</span><span>Edit</span><span></span></button>
    <button class="linkrow" data-p="dup" data-arg="${t.id}"><span class="who">${ic('add')}</span><span>Duplicate</span><span></span></button>
    ${t.kind === 'expense' ? `<button class="linkrow" data-p="move" data-arg="${t.id}"><span class="who">${ic(t.shared ? 'profile' : 'shared')}</span><span>${t.shared ? 'Make it yours only' : 'Share with Anna'}</span><span></span></button>` : ''}
    <button class="linkrow" data-p="ruleFrom" data-arg="${t.id}"><span class="who">${ic('rule')}</span><span>Always put ${esc(t.name)} here</span><span></span></button>`;
  const del = delAsk ? `<div class="linkrow" style="grid-template-columns:1fr auto auto"><span>Delete for good?</span><button class="btn ghost" data-p="delno" style="min-height:38px">Cancel</button><button class="btn danger" data-p="delyes" data-arg="${t.id}" style="min-height:38px">Delete</button></div>`
    : `<button class="linkrow" data-p="del" style="color:var(--over-text)"><span class="who" style="color:inherit">${ic('trash')}</span><span>Delete…</span><span></span></button>`;
  return detailBodyC1(t) + `<div class="panel" style="margin-top:12px">${acts}${t.kind === 'topup' ? '<p class="note" style="padding:12px 16px">Top-ups change who paid what into the pot, so they stay where they are.</p>' : ''}${del}</div>`;
}

/* Budgets: the cycle plan one tap away, and a budget you can set */
function budget(){
  if (state === 'new') return `${header('Budgets', {big: 'Budgets'})}<div class="panel"><div class="empty"><b>No salary yet</b>Budgets run from payday to payday. Log your salary to start the first cycle.<br><button class="btn" data-p="salary">${ic('in')}Log your salary</button></div></div>`;
  const m = model(curT());
  return budgetC1()
    .replace('<div class="cols even">', `<div class="panel" style="margin-bottom:12px">${navRow('plan', 'sack', 'Cycle plan', `Salary ${kr(salaryOf(curT()), true)}, ${kr(Math.max(0, salaryOf(curT()) - m.budget), true)} to save if every budget is spent`)}</div><div class="cols even">`)
    .replace('<h2 class="sec">Pace through the cycle</h2>', `<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn ghost" data-go="f-budget" data-arg="${selCat}">${ic('edit')}Set budget</button></div><h2 class="sec">Pace through the cycle</h2>`);
}
const salaryOf = T => T.filter(t => t.kind === 'income' && t.category === 'salary').reduce((a, t) => a + t.amount_minor, 0);
function plan(){
  const T = planOff ? D.last_cycle_transactions : curT(), m = model(T), lbl = planOff ? D.last_cycle.label : D.cycle.label;
  const inc = T.filter(t => t.kind === 'income').reduce((a, t) => a + t.amount_minor, 0), sal = salaryOf(T);
  const leftInBudgets = budgets.reduce((a, c) => a + Math.max(0, c.budget_minor - (m.by[c.id] || 0)), 0);
  const unbudgeted = [...new Set(T.filter(t => t.kind === 'expense' && !cats[t.category]?.budget_minor).map(t => t.category))];
  if (state === 'loading') return `${header('Cycle plan')}<div class="panel">${skRows(5)}</div>`;
  return `${header('Cycle plan', {big: 'Cycle plan', right: '<span></span>'})}${stateTop('Couldn’t refresh the plan.')}
  <div class="hrow" style="margin:0 0 12px"><div class="cyclepick"><button class="iconbtn" data-p="planprev" aria-label="Previous cycle" ${planOff ? 'disabled' : ''}>${ic('back')}</button><b>${lbl} cycle</b><button class="iconbtn" data-p="plannext" aria-label="Next cycle" ${planOff ? '' : 'disabled'}>${ic('chev')}</button></div></div>
  <div class="cols even"><div>
    <div class="stats"><div class="stat"><div class="big2 num">${kr(sal, true)}</div><p>Salary this cycle</p></div><div class="stat"><button data-go="f-target" style="text-align:left;width:100%"><div class="big2 num">${kr(XD.target, true)}</div><p>Cycle target to save ${ic('edit')}</p></button></div></div>
    <h2 class="sec">Cycle budget check</h2>
    <div class="panel"><div class="flowrow"><span>Money in</span><b>${plus(inc, true)}</b></div><div class="flowrow"><span>All budgets</span><b>${kr(m.budget, true)}</b></div>
      <div class="flowrow"><span>If every budget is fully spent</span><b>${kr(inc - m.budget, true)} to save</b></div>
      <div class="flowrow"><span>Real available to save, with what is left in budgets kept back</span><b style="color:${inc - m.spent - leftInBudgets >= XD.target ? 'var(--in)' : 'var(--over-text)'}">${kr(inc - m.spent - leftInBudgets, true)}</b></div></div>
    <p class="note">${inc - m.spent - leftInBudgets >= XD.target ? 'On track for the target.' : `${kr(XD.target - (inc - m.spent - leftInBudgets), true)} short of the target.`}</p>
  </div><div>
    <h2 class="sec">Used categories with no budget</h2>
    <div class="panel">${unbudgeted.length ? unbudgeted.map(id => `<button class="row" data-go="f-budget" data-arg="${id}"><span class="who cat">${ic(cats[id].mark)}</span><span class="nm">${cats[id].name}</span><span class="pill zero">Set</span></button>`).join('') : '<div class="empty">All used categories have a budget.</div>'}</div>
    <h2 class="sec">Notes</h2><div class="field"><textarea id="plannote" data-f="plannote" aria-label="Notes for this cycle" placeholder="Notes for this cycle">${esc(FS.plannote ?? 'Christmas gifts come out of the December cycle.')}</textarea><span class="hint">**bold** works</span></div>
  </div></div>`;
}

/* Where it went, plus money in and out by week, cycle or year */
function analytics(){
  const T = state === 'new' || state === 'empty' ? [] : txs.concat(D.last_cycle_transactions);
  const range = flowPer === 'week' ? [addDays(today, -6), today] : flowPer === 'cycle' ? [D.cycle.start, today] : ['2026-01-01', today];
  const L = T.filter(t => t.date >= range[0] && t.date <= range[1]);
  const inn = L.filter(t => t.kind === 'income').reduce((a, t) => a + t.amount_minor, 0), out = L.filter(t => t.kind === 'expense').reduce((a, t) => a + t.amount_minor, 0);
  const label = flowPer === 'week' ? 'Last 7 days' : flowPer === 'cycle' ? `${D.cycle.label} cycle so far` : '2026 so far, since your first cycle';
  let body;
  if (state === 'loading') body = `<div class="panel">${skRows(3)}</div>`;
  else if (!L.length) body = `<div class="panel"><div class="empty"><b>Nothing in or out yet</b>Money in and out shows here once you add it.</div></div>`;
  else {
    const days = [...new Set(L.map(t => t.date))].sort(); let run = 0; const pts = days.map(d => { L.filter(t => t.date === d).forEach(t => { if (t.kind === 'income') run += t.amount_minor; if (t.kind === 'expense') run -= t.amount_minor; }); return run; });
    const W = 320, H = 110, mn = Math.min(0, ...pts), mx = Math.max(1, ...pts), X = i => days.length < 2 ? W / 2 : 4 + (W - 8) * i / (days.length - 1), Y = v => 6 + (H - 12) * (1 - (v - mn) / (mx - mn));
    body = `<div class="panel"><div class="flowrow"><span>Money in</span><b style="color:var(--in)">${plus(inn, true)}</b></div><div class="flowrow"><span>Money out</span><b>${kr(out, true)}</b></div><div class="flowrow"><span>Left over</span><b>${inn - out < 0 ? kr(inn - out, true) : plus(inn - out, true)}</b></div></div>
      <div class="chart" style="margin-top:8px"><svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Running total of money in minus money out, ${label}">
        <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line-2)"/><path d="${pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="var(--you-text)" stroke-width="2.2" stroke-linejoin="round"/>
        <text x="0" y="${H + 14}" font-size="10" fill="var(--ink-3)">${fTime(days[0])}</text><text x="${W}" y="${H + 14}" font-size="10" fill="var(--ink-3)" text-anchor="end">${fTime(days[days.length - 1])}</text></svg>
        <div class="legend"><span><i style="background:var(--you-text)"></i>Money in minus money out, day by day</span></div></div>`;
  }
  return analyticsC1() + `<div style="max-width:760px"><h2 class="sec" style="margin-top:32px">Money in and out</h2><div class="hrow" style="margin:0 0 10px">${segOf('flow', flowPer, [['week', 'Week'], ['cycle', 'Cycle'], ['year', 'Year']])}<span class="note" style="padding:0">${label}</span></div>${body}</div>`;
}

/* Shared: the pot, who put in what, and what you spent together */
function shared(){
  const both = txs.concat(D.last_cycle_transactions);
  const T = state === 'empty' || state === 'new' ? [] : sharedPer === 'cycle' ? curT() : both;
  const m = model(T), all = m.mineTop + m.annaTop;
  const head = header('Shared', {big: 'With Anna', aside: sharedPer === 'cycle' ? `${D.cycle.label} cycle` : sharedPer === 'year' ? '2026' : 'Since 30 Sep'});
  if (state === 'loading') return `${head}<div class="panel">${skRows(3)}</div><h2 class="sec">Spent together</h2><div class="panel">${skRows(4)}</div>`;
  if (!all && !m.sharedSpend) return `${head}<div class="panel"><div class="empty"><b>Nothing shared yet</b>Top-ups into the pot and what you spend together show here.<br><button class="btn" data-p="addshared">${ic('add')}Add a shared expense</button></div></div>`;
  const yours = m.myPart;
  const tops = T.filter(t => t.kind === 'topup').slice().reverse();
  const sharedT = T.filter(t => t.shared && t.kind === 'expense');
  const byCat = {}; sharedT.forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount_minor);
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]); const max = rows[0]?.[1] || 1;
  return `${head}${stateTop('Couldn’t refresh the pot.')}
  <div style="margin:0 0 12px">${segOf('shared', sharedPer, [['cycle', 'Cycle'], ['year', 'Year'], ['all', 'All time']])}</div>
  <div class="cols"><div>
    <section class="hero" aria-label="The pot with Anna"><div class="top"><span>The pot you share</span><span class="pair" aria-hidden="true" style="transform:scale(.7);transform-origin:right center;width:80px"><span class="a">A</span><span class="y">You</span></span></div>
      <div class="big num" style="font-size:56px;margin-top:6px">${kr(m.pot, true)}</div><div class="sub">left in the pot</div>
      <div class="sharebar" aria-hidden="true"><i style="flex:${m.mineTop};background:var(--on-you)"></i><i style="flex:${m.annaTop};background:var(--anna)"></i></div>
      <div class="pace" style="border:0;margin:0;padding:0"><span>You put in <b class="num">${kr(m.mineTop, true)}</b></span><span>Anna put in <b class="num">${kr(m.annaTop, true)}</b></span></div></section>
    <div class="panel" style="margin-top:12px;padding:16px"><p class="owes">Your part of <span class="num">${kr(m.sharedSpend, true)}</span> spent together is <em class="num">${kr(yours, true)}</em></p><p class="note" style="padding:6px 0 0">Your part follows what you each put in, ${m.myPct} of every 100 kr. Nobody types a ratio.</p></div>
    <h2 class="sec">Spent together <button data-p="addshared">Add</button></h2>
    <div class="panel">${rows.map(([id, s]) => `<div class="hb"><span class="nm">${ic(cats[id].mark)}${cats[id].name}</span><span class="v">${kr(s, true)}</span><span class="track" aria-hidden="true"><i style="width:${(100 * s / max).toFixed(1)}%"></i></span></div>`).join('')}</div>
  </div><div>
    <h2 class="sec">Into the pot</h2><div class="panel"><div class="bubbles">${tops.map(t => `<div class="bub ${t.paid_by === 'me' ? 'y' : 'a'}"><b class="num">${kr(t.amount_minor, true)}</b><span>${t.paid_by === 'me' ? 'You moved in' : 'Anna moved in'}, ${fTime(t.date)}</span></div>`).join('')}</div></div>
    <h2 class="sec">Latest together <button data-p="sharedall">All</button></h2><div class="panel">${sharedT.slice(0, 5).map(t => txRow(t)).join('')}</div>
  </div></div>`;
}

/* Bank: savings, loans and money owed to you */
function bank(){
  const head = header('Bank', {big: 'Bank', aside: 'Savings, loans and money owed to you'});
  if (state === 'loading') return `${head}<div class="panel">${skRows(2)}</div><h2 class="sec">Savings</h2><div class="panel">${skRows(2)}</div>`;
  const empty = state === 'empty' || state === 'new';
  const sv = empty ? [] : XD.savings, lo = empty ? [] : XD.loans, ow = empty ? [] : XD.owed;
  const svTot = sv.reduce((a, s) => a + s.balance, 0), openLo = lo.filter(l => l.remaining), openOw = ow.filter(o => o.remaining);
  const item = (go, x, mark, right, sub, prog) => `<button class="linkrow" data-go="${go}" data-arg="${x.id}"><span class="who">${ic(mark)}</span><span style="min-width:0"><span class="nm" style="font-weight:500">${esc(x.name)}</span><span class="sub">${sub}</span>${prog != null ? `<span class="goal" aria-hidden="true"><i style="width:${prog}%"></i></span>` : ''}</span><span class="end"><b class="num" style="color:var(--ink);font-weight:500">${right}</b>${ic('chev')}</span></button>`;
  const sec = (title, kind, list, emptyTxt) => `<h2 class="sec">${title} <button data-go="${kind}" data-arg="new">New</button></h2><div class="panel">${list || `<div class="empty">${emptyTxt}</div>`}</div>`;
  return `${head}${stateTop('Couldn’t refresh the bank.')}
  <div class="stats" style="margin-bottom:4px"><div class="stat"><div class="big2 num">${empty ? '–' : kr(XD.bank, true)}</div><p>Bank balance</p></div><div class="stat"><div class="big2 num">${kr(svTot, true)}</div><p>Savings total</p></div>
    <div class="stat deskonly"><div class="big2 num">${kr(openLo.reduce((a, l) => a + l.remaining, 0), true)}</div><p>Still to repay</p></div><div class="stat deskonly"><div class="big2 num">${kr(openOw.reduce((a, l) => a + l.remaining, 0), true)}</div><p>Owed to you</p></div></div>
  <div class="cols3">
    <div>${sec('Savings', 'f-savings', sv.map(s => item('f-savings', s, s.mark, kr(s.balance, true), s.goal ? `${pctOf(s.balance, s.goal)} of 100 toward ${kr(s.goal, true)}` : 'No goal set yet', s.goal ? Math.min(100, pctOf(s.balance, s.goal)) : null)).join(''), 'No savings yet. Name a pot and set a goal.')}</div>
    <div>${sec('Loans', 'f-loan', lo.map(l => item('f-loan', l, 'loan', l.remaining ? kr(l.remaining, true) : 'Settled', l.remaining ? `left of ${kr(l.principal, true)}` : `${kr(l.principal, true)} repaid`, l.remaining ? 100 - pctOf(l.remaining, l.principal) : null)).join(''), 'No loans. Add one to track what is left to repay.')}</div>
    <div>${sec('Owed to you', 'f-owed', ow.map(o => item('f-owed', o, 'owed', o.remaining ? kr(o.remaining, true) : 'Settled', o.remaining ? `still owed of ${kr(o.principal, true)}` : 'Returned in full', o.remaining ? 100 - pctOf(o.remaining, o.principal) : null)).join(''), 'Nobody owes you money.')}</div>
  </div>`;
}

/* Categories and the people you share with */
function categories(){
  const head = header('Categories', {big: 'Categories', right: `<button class="iconbtn" data-go="f-category" data-arg="new" aria-label="New category">${ic('add')}</button>`});
  if (state === 'loading') return `${head}<div class="panel">${skRows(6)}</div>`;
  const row = (c, sub) => `<button class="linkrow ${sub ? 'subrow' : ''}" data-go="f-category" data-arg="${c.id}"><span class="who">${ic(c.mark)}</span><span>${esc(c.name)}${c.budget_minor ? `<span class="sub num">Budget ${kr(c.budget_minor, true)}</span>` : ''}</span><span class="end">${c.system ? '<span class="tagp sys">System</span>' : ''}${ic('chev')}</span></button>`;
  const subs = c => (XD.subs[c.id] || []).map(([n, mk], i) => row({id: c.id + '~' + i, name: n, mark: mk}, true)).join('');
  const exp = D.categories.filter(c => c.kind === 'expense'), inc = D.categories.filter(c => c.kind === 'income');
  return `${head}${stateTop('Couldn’t refresh categories.')}
  <div class="cols even"><div><h2 class="sec">Expenses</h2><div class="panel">${exp.map(c => row(c) + subs(c)).join('')}</div>
  <div style="margin-top:10px"><button class="btn ghost" data-go="f-category" data-arg="new">${ic('add')}New category</button></div></div>
  <div><h2 class="sec">Income</h2><div class="panel">${inc.map(c => row({...c, system: true})).join('')}</div>
  <h2 class="sec">People you share with</h2><div class="panel">${XD.people.map(p => `<button class="linkrow" data-go="f-person" data-arg="${p.id}"><span class="who"><span class="avatar" style="width:26px;height:26px;font-size:12px;background:var(--anna);color:var(--on-anna)">${esc(p.name[0])}</span></span><span>${esc(p.name)}</span><span class="end">${ic('chev')}</span></button>`).join('') || '<div class="empty">No people added yet.</div>'}</div>
  <div style="margin-top:10px"><button class="btn ghost" data-go="f-person" data-arg="new">${ic('add')}Add person</button></div></div></div>`;
}

/* Merchant rules: put a merchant in a category every time */
function rules(){
  const q = (FS.rq || '').toLowerCase(), L = XD.rules.filter(r => r.pattern.includes(q));
  const head = header('Merchant rules', {big: 'Merchant rules', aside: 'A rule always wins over a suggestion', right: `<button class="iconbtn" data-go="f-rule" data-arg="new" aria-label="New rule">${ic('add')}</button>`});
  if (state === 'loading') return `${head}<div class="panel">${skRows(5)}</div>`;
  const what = r => r.block ? 'No suggestions' : r.topup ? 'Top-up to the pot' : `${cats[r.cat]?.name || 'Category'}`;
  const list = state === 'empty' || state === 'new' ? '' : L.map(r => `<button class="linkrow" data-go="f-rule" data-arg="${r.id}"><span class="who">${ic(r.block ? 'close' : r.topup ? 'moved' : cats[r.cat].mark)}</span><span>${esc(r.pattern)}<span class="sub">${{exact: 'Is exactly', prefix: 'Starts with', contains: 'Contains'}[r.match]}, then ${what(r)}</span></span><span class="end">${ic('chev')}</span></button>`).join('');
  return `${head}${stateTop('Couldn’t refresh rules.')}<div style="max-width:760px">
  <label class="search" style="background:var(--surface)">${ic('search')}<span class="sr">Search rules</span><input id="rq" data-f="rq" placeholder="Search" value="${esc(FS.rq || '')}" autocomplete="off"></label>
  <div class="panel">${list || (q ? '<div class="empty"><b>No rule matches</b>Try part of the merchant name.</div>' : `<div class="empty"><b>No rules yet</b>Make one from any transaction, or here.<br><button class="btn" data-go="f-rule" data-arg="new">${ic('add')}Add rule</button></div>`)}</div></div>`;
}

/* Alerts: budgets near or over their line, and heads-up */
function alerts(){
  const m = model(curT());
  const near = budgets.filter(c => (m.by[c.id] || 0) <= c.budget_minor && (m.by[c.id] || 0) >= c.budget_minor * .85);
  const head = header('Alerts', {big: 'Alerts'});
  if (state === 'loading') return `${head}<div class="panel">${skRows(3)}</div>`;
  const over = m.over.map(o => `<button class="row" data-cat="${o.c.id}"><span class="who cat">${ic(o.c.mark)}</span><span><div class="nm">${o.c.name}</div><div class="meta num">${kr(m.by[o.c.id], true)} of ${kr(o.c.budget_minor, true)}</div></span><span class="amt ovq"><i class="ovdot"></i>${kr(o.over, true)} over</span></button>`).join('');
  const nr = near.map(c => `<button class="row" data-cat="${c.id}"><span class="who cat">${ic(c.mark)}</span><span><div class="nm">${c.name}</div><div class="meta num">${pctOf(m.by[c.id], c.budget_minor)} of 100 used, ${D.cycle.days_left} days left</div></span><span class="pill">${kr(c.budget_minor - m.by[c.id], true)} left</span></button>`).join('');
  return `${head}${stateTop('Couldn’t refresh alerts.')}<div style="max-width:760px">
  <h2 class="sec">Over budget</h2><div class="panel">${over || '<div class="empty">No budget is over.</div>'}</div>
  <h2 class="sec">Close to the line</h2><div class="panel">${nr || '<div class="empty">Nothing is close.</div>'}</div>
  <h2 class="sec">Heads-up</h2><div class="panel"><div class="row"><span class="who cat">${ic('cal')}</span><span><div class="nm">Payday ${dayLabel(D.cycle.next_payday)}</div><div class="meta">Log the salary and the December cycle starts.</div></span><span></span></div>
  <div class="row"><span class="who cat">${ic('clock')}</span><span><div class="nm">Nothing added today</div><div class="meta">A coffee or a ticket is easy to forget.</div></span><button class="btn link" data-act="add">Add</button></div></div></div>`;
}

/* Profile: you, the rest of the app on a phone, reminders, export, sign out */
function profile(){
  return `${header('Profile', {big: 'Profile'})}${stateTop('Couldn’t refresh your profile.')}
  <div class="cols even"><div>
    <div style="display:flex;gap:16px;align-items:center;margin:4px 0 18px"><button data-p="avatar" aria-label="Change profile picture"><span class="avatar big">S</span></button><div class="field" style="flex:1;margin:0"><span>Name</span><input id="pname" data-f="pname" value="${esc(FS.pname ?? XD.name)}" autocomplete="name"></div></div>
    <div class="panel phoneonly" style="margin-bottom:14px">${navRow('analytics', 'where', 'Where it went')}${navRow('bank', 'bank', 'Bank', 'Savings, loans, owed to you')}${navRow('categories', 'tag', 'Categories', 'And people you share with')}${navRow('rules', 'rule', 'Merchant rules')}${navRow('alerts', 'bell', 'Alerts', '', '<span class="pill ov" style="font-size:12px">3</span>')}</div>
    <h2 class="sec">Reminders</h2><div class="panel">${sw('reminder', XD.reminder, 'Daily reminder at 18:00', 'A calm nudge to add today’s spending. Needs Cashflow on your Home Screen.')}</div>
  </div><div>
    <h2 class="sec">Export</h2><div class="panel" style="padding:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="field" style="margin:0"><span>From</span><input type="date" id="ex1" data-f="ex1" value="${FS.ex1 || D.last_cycle.start}"></label><label class="field" style="margin:0"><span>To</span><input type="date" id="ex2" data-f="ex2" value="${FS.ex2 || today}"></label></div>
      ${FS.ex1 && FS.ex2 && FS.ex1 > FS.ex2 ? '<p class="field"><span class="err2">The start date must be before the end date.</span></p>' : ''}
      <div style="margin:12px 0">${segOf('fmt', FS.fmt || 'csv', [['csv', 'CSV'], ['pdf', 'PDF']])}</div>
      <button class="btn" data-p="export" style="width:100%" ${FS.ex1 && FS.ex2 && FS.ex1 > FS.ex2 ? 'disabled' : ''}>${ic('export')}Export ${(FS.fmt || 'csv').toUpperCase()}</button></div>
    <div class="panel" style="margin-top:20px"><button class="linkrow" data-go="signin" style="color:var(--over-text)"><span class="who" style="color:inherit">${ic('signout')}</span><span>Sign out</span><span></span></button></div>
  </div></div>`;
}

/* Sign in, sign up, the sign-in callback and a third-party consent */
function signin(up){
  return `<div class="auth"><div><p style="font-family:'Newsreader',Georgia,serif;font-size:22px;color:var(--ink);margin-bottom:40px">Cashflow</p>
    <h1>${up ? 'Your money, payday to payday' : 'Welcome back'}</h1><p>${up ? 'See what is left until payday, keep your budgets, and share a pot with the person you live with.' : 'Pick up your cycle where you left it.'}</p>
    <div class="mini" aria-hidden="true"><div style="font-size:13px;color:var(--on-you-2)">Example</div><div class="big num">827 kr.</div><div class="sub">left to spend, <em>4 days to payday</em></div></div></div>
    <div><button class="gbtn" data-go="home~content"><span class="gmark">G</span>${up ? 'Create account with Google' : 'Continue with Google'}</button>
    <p style="text-align:center;margin-top:16px;font-size:14px">${up ? 'Have an account?' : 'New here?'} <button class="btn link" data-go="${up ? 'signin' : 'signup'}" style="min-height:40px">${up ? 'Sign in' : 'Create an account'}</button></p></div></div>`;
}
const signup = () => signin(true);
function callback(){
  return state === 'error' ? `<div class="auth"><div><h1>Sign-in didn’t finish</h1><p>The link from Google was missing a part. Try again.</p></div><button class="gbtn" data-go="signin">Back to sign in</button></div>`
    : `<div class="auth" style="justify-content:center;text-align:center"><div><span class="sk" style="width:48px;height:48px;border-radius:50%;margin:0 auto 18px"></span><h1 style="font-size:30px">Signing you in…</h1></div></div>`;
}
function consent(){
  return `<div class="auth"><div><p style="font-family:'Newsreader',Georgia,serif;font-size:22px;margin-bottom:28px">Cashflow</p><h1 style="font-size:34px">Budget Helper wants to read your Cashflow</h1>
    <div class="scopes"><div>${ic('list')}<span>Read your transactions</span></div><div>${ic('budgets')}<span>Read your budgets</span></div></div>
    <p class="uri">Returns to https://budget-helper.example/callback</p></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ghost" data-go="home~content">Deny</button><button class="btn" data-go="home~content">Allow</button></div></div>`;
}

/* add: the fast path stays amount, category, name; everything else is one tap away */
function renderAdd(){
  const steps = ['Amount', A.kind === 'topup' ? 'To the pot' : 'Category', 'Name'];
  const title = editId ? 'Edit' : A.kind === 'income' ? 'Money in' : A.kind === 'topup' ? 'Move to the pot' : 'New expense';
  const head = `<div class="bar" style="display:grid"><button class="iconbtn" data-act="close" aria-label="Close">${ic('close')}</button><h1>${title}</h1>${A.step === 1 && !editId ? `<button class="iconbtn" data-p="importpick" aria-label="Import from a receipt or bank file">${ic('import')}</button>` : '<span></span>'}</div>`;
  const stepNav = A.step === 'import' || A.step === 'busy' ? '' : `<div class="steps" role="list">${steps.map((s, i) => `<button role="listitem" data-step="${i + 1}" ${A.step === i + 1 ? 'aria-current="step"' : ''} class="${A.step > i + 1 ? 'done' : ''}" ${i + 1 > A.step || (A.kind === 'topup' && i === 1) ? 'disabled' : ''}>${s}</button>`).join('')}</div>`;
  let b = '';
  if (A.step === 'import') {
    b = `<p class="note" style="padding:8px 4px 14px">Add many at once. You check each one before it saves.</p>
      <div class="panel"><button class="linkrow" data-p="importgo" data-arg="image"><span class="who">${ic('image')}</span><span>Screenshot or receipt<span class="sub">A photo or an image from your phone</span></span><span class="end">${ic('chev')}</span></button>
      <button class="linkrow" data-p="importgo" data-arg="csv"><span class="who">${ic('import')}</span><span>Bank statement<span class="sub">A CSV file from your bank</span></span><span class="end">${ic('chev')}</span></button></div>`;
  } else if (A.step === 'busy') {
    b = `<div class="amountbox"><span class="sk" style="width:56px;height:56px;border-radius:16px"></span><p>${A.src === 'csv' ? 'Reading the statement…' : 'Reading the image…'}</p></div>`;
  } else if (A.step === 1) {
    const date = addDays(today, -A.dOff);
    b = `<div class="amountbox"><label class="sr" for="amt">Amount</label><div id="amt" class="big serif ${A.amt ? '' : 'zero'}" role="textbox" aria-label="Amount" tabindex="0" inputmode="decimal">${amtText()}</div>
      <p>${A.kind === 'income' ? 'Coming in' : A.kind === 'topup' ? 'From you into the pot with Anna. Not spending.' : A.shared ? 'Shared with Anna, from the pot' : 'Yours'}</p></div>
      <div class="off">
        <button data-act="date">${ic('cal')}${dayLabel(date)}</button>
        <button data-act="note" aria-pressed="${A.note !== null}">${ic('note')}Note</button>
        ${A.kind === 'expense' ? `<button data-act="share" aria-pressed="${A.shared}"><span class="shmark"><svg viewBox="0 0 26 20" aria-hidden="true"><circle cx="9" cy="10" r="6" fill="var(--anna)"/><circle cx="16" cy="10" r="6" fill="var(--you)" stroke="var(--surface)" stroke-width="2"/></svg></span>With Anna</button>` : ''}
        <button data-p="kind" data-arg="income" aria-pressed="${A.kind === 'income'}">${ic('in')}Income</button>
        <button data-p="kind" data-arg="topup" aria-pressed="${A.kind === 'topup'}">${ic('moved')}To the pot</button>
        ${!editId && txs.length ? `<button data-p="duplast">${ic('retry')}Same as last</button>` : ''}
      </div>
      ${A.note !== null ? `<input class="notein" id="note" placeholder="Note" aria-label="Note" value="${esc(A.note)}">` : ''}
      <div class="keys">${['1','2','3','4','5','6','7','8','9',',','0','del'].map(k => `<button data-key="${k}" aria-label="${k === 'del' ? 'Delete' : k === ',' ? 'Decimal comma' : k}">${k === 'del' ? ic('del') : k}</button>`).join('')}</div>
      <button class="btn next" data-act="next" ${amtMinor() > 0 ? '' : 'disabled'}>Next</button>`;
  } else if (A.step === 2) {
    const {recent, rest} = catsFor();
    const q = (FS.cq || '').toLowerCase();
    const r = c => `<button class="row" data-pick="${c.id}"><span class="who cat">${ic(c.mark)}</span><span class="nm">${c.name}</span>${(() => { if (!c.budget_minor) return '<span></span>'; const v = c.budget_minor - (model(txs).by[c.id] || 0); return v < 0 ? `<span class="amt" style="color:var(--over-text);font-weight:500">${kr(-v, true)} over</span>` : `<span class="amt" style="color:var(--ink-3);font-weight:400">${kr(v, true)} left</span>`; })()}</button>`;
    const hit = (recent.concat(rest)).filter(c => c.name.toLowerCase().includes(q));
    b = `<div class="summary"><span class="serif num">${kr(amtMinor())}</span><span style="color:var(--ink-2)">${A.shared ? 'Shared with Anna' : A.kind === 'income' ? 'Money in' : 'Yours'}</span></div>
      <label class="search" style="background:var(--surface);margin-top:10px">${ic('search')}<span class="sr">Search categories</span><input id="cq" data-f="cq" placeholder="Search" value="${esc(FS.cq || '')}" autocomplete="off"></label>
      ${q ? `<div class="catlist"><div class="panel">${hit.map(r).join('') || '<div class="empty">No category matches.</div>'}</div></div>`
      : `<div class="catlist"><div class="lbl">${A.kind === 'income' ? 'Income' : 'Recent'}</div><div class="panel recent">${recent.map(r).join('')}</div>${rest.length ? `<div class="lbl">All categories</div><div class="panel">${rest.map(r).join('')}</div>` : ''}</div>`}`;
  } else {
    const c = cats[A.cat];
    const known = {netto: 'groceries', 'rema 1000': 'groceries', 'føtex': 'groceries', 'joe & the juice': 'eating_out', dsb: 'transport'};
    const sug = !sugOff && c && known[A.name.trim().toLowerCase()] && known[A.name.trim().toLowerCase()] !== A.cat ? cats[known[A.name.trim().toLowerCase()]] : null;
    const who = A.kind === 'topup' ? `<span style="display:flex;gap:6px;align-items:center;color:var(--ink-2)">${ic('moved')}To the pot</span>` : `<span style="display:flex;gap:6px;align-items:center;color:var(--ink-2)">${ic(c.mark)}${c.name}</span>`;
    b = `<div class="summary"><span class="serif num">${kr(amtMinor())}</span>${who}</div>
      ${A.shared && XD.people.length > 1 ? `<div class="pickrow" style="margin-top:10px">${XD.people.map(p => `<button>${esc(p.name)}</button>`).join('')}</div>` : ''}
      <div class="namebox"><label for="nm">Name</label><input id="nm" value="${esc(A.name)}" autocomplete="off" enterkeyhint="done" placeholder="Name"></div>
      ${sug ? `<div class="offline" style="margin-top:10px"><span>Suggested: <b>${sug.name}</b></span><span class="spacer"></span><button class="btn link" data-pick="${sug.id}" style="min-height:36px">Use it</button><button class="btn link" data-p="nosug" style="min-height:36px;color:var(--ink-3)">Don’t suggest again</button></div>` : ''}
      ${A.cat === 'salary' ? `<p class="note">${ic('info')} This salary starts a new cycle on ${dayLabel(addDays(today, -A.dOff))}.</p>` : ''}
      <div class="sugs" aria-label="Suggested names">${(A.kind === 'topup' ? ['Top-up, shared account'] : namesFor(c.id)).map(n => `<button data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <span class="spacer"></span>
      <button class="btn next" data-act="save" ${A.name.trim() ? '' : 'disabled'}>Save</button>
      ${editId ? '' : `<button class="btn ghost next" data-p="saveanother" ${A.name.trim() ? '' : 'disabled'} style="margin-top:6px">Save and add another</button>`}`;
  }
  document.getElementById('addin').innerHTML = head + stepNav + b;
  if (A.step === 3){ const i = document.getElementById('nm'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  if (A.step === 1 && !document.getElementById('note')) document.getElementById('amt').focus({preventScroll:true});
}
function save(another){
  const t = {id: editId || 'n' + Date.now(), date: addDays(today, -A.dOff), amount_minor: amtMinor(), kind: A.kind, category: A.kind === 'topup' ? null : A.cat, name: A.name.trim(), shared: A.kind === 'topup' || (A.kind === 'expense' && A.shared), paid_by: 'me'};
  if (A.note) t.note = A.note;
  txs = [t].concat(txs.filter(x => x.id !== t.id)).sort((a, b) => b.date.localeCompare(a.date));
  if (state === 'new' && t.category === 'salary') state = 'content';
  const was = editId; editId = null;
  const msg = state === 'offline' ? `Saved on this phone, ${esc(t.name)}. It syncs when you’re online.` : was ? `Changed ${esc(t.name)}` : `Saved ${kr(t.amount_minor)}, ${esc(t.name)}`;
  if (another === true) { resetAdd(); renderAdd(); toast(msg, t.id); return; }
  if (state !== 'offline' && state !== 'new') state = 'content';
  closeAdd(); closeDetail();
  toast(msg, was ? null : t.id);
}

/* one form sheet for every editor */
function openForm(id, arg){
  formId = id; formArg = arg ?? DEF[id] ?? null; delAsk = false;
  if (FORMS[id] && FORMS[id].on && screen !== FORMS[id].on && !(id === 'f-budget' && screen === 'plan')) goC1(FORMS[id].on);
  renderForm();
  document.getElementById('form').classList.add('on'); document.getElementById('scrim').classList.add('on');
}
function closeForm(quiet){
  if (!formId) return; formId = null; FS.err = null;
  document.getElementById('form').classList.remove('on');
  if (!document.getElementById('add').classList.contains('on') && !document.getElementById('detail').classList.contains('on')) document.getElementById('scrim').classList.remove('on');
  if (!quiet) render();
}
const fhead = (title, right) => `<div class="bar" style="display:grid"><button class="iconbtn" data-p="fclose" aria-label="Close">${ic('close')}</button><h1>${title}</h1>${right || '<span></span>'}</div>`;
const iconPick = (cur) => `<div class="icongrid">${window.ICON_GROUPS.find(g => g[0] === 'Categories')[1].map(([n, l]) => `<button data-p="pickicon" data-arg="${n}" aria-label="${l}" aria-pressed="${cur === n}">${ic(n)}</button>`).join('')}</div>`;
const delBlock = (what) => FS.delAsk ? `<div class="linkrow" style="grid-template-columns:1fr auto auto;margin-top:8px;background:var(--surface);border-radius:14px"><span>Delete ${what}? This can’t be undone.</span><button class="btn ghost" data-p="fdelno" style="min-height:38px">Cancel</button><button class="btn danger" data-p="fdelyes" style="min-height:38px">Delete</button></div>` : '';
function renderForm(){
  const el = document.getElementById('formin'); let h = '';
  const amountField = (label, key, val, hint) => `<label class="field"><span>${label}</span><input class="amtin" id="${key}" data-f="${key}" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${esc(FS[key] ?? minorIn(val))}" placeholder="0">${hint ? `<span class="hint">${hint}</span>` : ''}${FS.err === key ? '<span class="err2">Type an amount, like 1500 or 89,50.</span>' : ''}</label>`;
  if (formId === 'f-budget' || formId === 'f-target') {
    const tgt = formId === 'f-target', c = cats[formArg] || cats[selCat], m = model(curT());
    h = fhead(tgt ? 'Cycle target' : `${c.name} budget`) + `<p class="note" style="padding:4px 4px 14px">${tgt ? 'What you want to save each cycle.' : `${kr(m.by[c.id] || 0, true)} spent this cycle, ${kr(lastBy[c.id] || 0, true)} in ${D.last_cycle.label}.`}</p>
      ${amountField(tgt ? 'Save each cycle' : 'Budget each cycle', 'amt1', tgt ? XD.target : c.budget_minor)}
      <div class="formfoot">${!tgt && c.budget_minor ? '<button class="btn danger" data-p="budgetrm">Remove budget</button>' : ''}<button class="btn" data-p="budgetsave">Save</button></div>`;
  } else if (formId === 'f-category') {
    const isNew = formArg === 'new', [pid, si] = String(formArg).split('~'), sub = si !== undefined, base = cats[pid];
    const c = isNew ? {name: '', mark: FS.icon || 'other', kind: FS.kind || 'expense'} : sub ? {name: XD.subs[pid][si][0], mark: XD.subs[pid][si][1], kind: 'expense'} : base;
    const sys = !isNew && c.kind === 'income';
    if (sys) h = fhead(c.name) + `<div class="dhero"><div class="who" style="margin:0 auto;width:48px;height:48px;color:var(--ink-2)">${ic(c.mark)}</div><p>${c.name} is a system category. It can’t be changed or deleted.</p></div>`;
    else h = fhead(isNew ? 'New category' : sub ? 'Subcategory' : 'Edit category') + `
      ${isNew ? `<div style="margin-bottom:14px">${segOf('ckind', FS.kind || 'expense', [['expense', 'Expense'], ['income', 'Income']])}</div>` : ''}
      <label class="field"><span>Name</span><input id="cname" data-f="cname" value="${esc(FS.cname ?? c.name)}" placeholder="Category name" autocomplete="off">${FS.err === 'cname' ? '<span class="err2">Give it a name.</span>' : ''}</label>
      <div class="field"><span>Icon</span>${iconPick(FS.icon || c.mark)}</div>
      ${sub ? `<p class="note">Part of ${base.name}.</p>` : !isNew && c.kind === 'expense' ? `${amountField('Budget each cycle', 'amt1', c.budget_minor)}<div class="field"><span>Subcategories</span><div class="panel">${(XD.subs[pid] || []).map(([n, mk], i) => `<button class="linkrow" data-p="opensub" data-arg="${pid}~${i}"><span class="who">${ic(mk)}</span><span>${n}</span><span class="end">${ic('chev')}</span></button>`).join('') || '<div class="empty">No subcategories</div>'}</div><button class="btn link" data-p="addsub" style="justify-self:start">${ic('add')}Add subcategory</button></div>` : ''}
      ${delBlock('this category')}
      <div class="formfoot">${isNew ? '' : '<button class="btn danger" data-p="fdel">Delete…</button>'}<button class="btn" data-p="catsave">Save</button></div>`;
  } else if (formId === 'f-person') {
    const p = XD.people.find(x => x.id === formArg) || {name: ''};
    h = fhead(formArg === 'new' ? 'Add person' : 'Edit person') + `<label class="field"><span>Name</span><input id="pn" data-f="pn" value="${esc(FS.pn ?? p.name)}" placeholder="Person name" autocomplete="off"></label><p class="note">Who you share a pot with. Shared expenses name them.</p>${delBlock('this person')}
      <div class="formfoot">${formArg === 'new' ? '' : '<button class="btn danger" data-p="fdel">Delete…</button>'}<button class="btn" data-p="personsave">Save</button></div>`;
  } else if (formId === 'f-rule') {
    const r = XD.rules.find(x => x.id === formArg) || {pattern: FS.pfill || '', match: 'exact', kind: 'expense', cat: null};
    const v = k => FS[k] ?? r[k];
    h = fhead(formArg === 'new' ? 'New rule' : 'Edit rule') + `
      <label class="field"><span>Merchant name</span><input id="rp" data-f="pattern" value="${esc(v('pattern'))}" placeholder="for example netto" autocomplete="off" autocapitalize="none"><span class="hint">Matched without caring about capitals</span>${FS.err === 'pattern' ? '<span class="err2">Type part of the merchant’s name.</span>' : ''}</label>
      <div class="field"><span>Match when the name</span>${segOf('match', v('match'), [['exact', 'Is exactly'], ['prefix', 'Starts with'], ['contains', 'Contains']])}</div>
      <div class="field"><span>Type</span>${segOf('rkind', v('kind'), [['expense', 'Expense'], ['income', 'Income']])}</div>
      <div class="panel" style="margin-bottom:14px">${sw('block', v('block'), 'Don’t suggest a category', 'No suggestion for this merchant')}${v('kind') === 'expense' ? sw('topup', v('topup'), 'It’s a top-up to the pot', 'Counted as money moved, not spending') : ''}</div>
      ${v('block') || v('topup') ? '' : `<div class="field"><span>Category</span><div class="panel">${D.categories.filter(c => c.kind === v('kind')).map(c => `<button class="row" data-p="rcat" data-arg="${c.id}" aria-pressed="${v('cat') === c.id}" style="${v('cat') === c.id ? 'background:var(--you-soft)' : ''}"><span class="who cat">${ic(c.mark)}</span><span class="nm">${c.name}</span><span>${v('cat') === c.id ? ic('check') : ''}</span></button>`).join('')}</div>${FS.err === 'cat' ? '<span class="err2">Pick a category.</span>' : ''}</div>`}
      <label class="field"><span>Note</span><textarea id="rn" data-f="note" placeholder="Optional">${esc(v('note') || '')}</textarea></label>${delBlock('this rule')}
      <div class="formfoot">${formArg === 'new' ? '' : '<button class="btn danger" data-p="fdel">Delete…</button>'}<button class="btn" data-p="rulesave">Save</button></div>`;
  } else if (formId === 'f-savings' || formId === 'f-loan' || formId === 'f-owed') {
    const kind = formId.slice(2), list = kind === 'savings' ? XD.savings : kind === 'loan' ? XD.loans : XD.owed, x = list.find(i => i.id === formArg);
    const W = {savings: ['New savings', 'Emergency fund', 'Goal'], loan: ['New loan', 'Student loan', 'Original amount'], owed: ['Someone owes you', 'Name', 'Amount lent']}[kind];
    if (!x || FS.editing) {
      h = fhead(x ? 'Edit' : W[0]) + `<label class="field"><span>${kind === 'owed' ? 'Who' : 'Name'}</span><input id="bn" data-f="bname" value="${esc(FS.bname ?? (x ? x.name : ''))}" placeholder="${W[1]}" autocomplete="off">${FS.err === 'bname' ? '<span class="err2">Give it a name.</span>' : ''}</label>
        ${amountField(W[2], 'amt1', x ? (kind === 'savings' ? x.goal : x.principal) : 0, kind === 'savings' ? 'Optional' : '')}
        ${kind === 'savings' ? `<div class="field"><span>Icon</span>${iconPick(FS.icon || (x ? x.mark : 'savings'))}</div>` : `<label class="field"><span>Note</span><input id="bnote" data-f="bnote" placeholder="Optional" value="${esc(FS.bnote || '')}"></label>`}
        ${delBlock('it')}<div class="formfoot">${x ? '<button class="btn danger" data-p="fdel">Delete…</button>' : ''}<button class="btn" data-p="banksave">Save</button></div>`;
    } else {
      const acts = {savings: [['add', 'Put in'], ['remove', 'Take out'], ['set', 'Set balance']], loan: [['repaid', 'Repayment'], ['borrowed', 'Borrow more']], owed: [['repaid', 'Money returned'], ['lent', 'Lend more']]}[kind];
      const act = FS.act || acts[0][0], val = kind === 'savings' ? x.balance : x.remaining;
      const word = {add: 'Put in', remove: 'Taken out', set: 'Balance set to', repaid: kind === 'loan' ? 'Repaid' : 'Returned', borrowed: 'Borrowed', lent: 'Lent'};
      h = fhead(esc(x.name), `<button class="iconbtn" data-p="bankedit" aria-label="Edit">${ic('edit')}</button>`) + `
        <div class="dhero"><div class="big serif num">${val ? kr(val, true) : 'Settled'}</div><p>${kind === 'savings' ? (x.goal ? `of ${kr(x.goal, true)} goal` : 'No goal set yet') : kind === 'loan' ? `left to repay of ${kr(x.principal, true)}` : `still owed of ${kr(x.principal, true)}`}</p></div>
        <div style="margin:18px 0 12px">${segOf('act', act, acts)}</div>${amountField('Amount', 'amt1', 0)}
        <button class="btn" data-p="bankact" style="width:100%">Save</button>
        <h2 class="sect">History</h2><div class="panel">${x.history.map(e => `<div class="row"><span class="who cat">${ic(e.kind === 'add' || e.kind === 'lent' || e.kind === 'borrowed' ? 'in' : e.kind === 'set' ? 'edit' : 'out')}</span><span><div class="nm">${word[e.kind]}</div><div class="meta">${fDay.format(dUTC(e.date))}</div></span><span class="amt">${kr(e.amount, true)}</span></div>`).join('') || '<div class="empty">No history yet.</div>'}</div>`;
    }
  } else if (formId === 'f-import') {
    const rows = XD.imports;
    const card = r => `<div class="icard"><div class="top"><span class="nm">${esc(r.name)}</span><b class="num ${r.kind === 'income' ? '' : ''}" style="${r.kind === 'income' ? 'color:var(--in)' : ''}">${r.kind === 'income' ? plus(r.amount) : kr(r.amount)}</b></div>
      <div class="meta">${ic('cal')}${dayLabel(r.date)}<span>·</span>${r.cat ? `${ic(cats[r.cat].mark)}${cats[r.cat].name}` : '<span class="need">Needs a category</span>'}</div>
      <div class="acts"><button data-p="impcat" data-arg="${r.id}">${r.cat ? 'Change category' : 'Pick a category'}</button><button data-p="impdrop" data-arg="${r.id}">Remove</button></div>
      ${FS.impPick === r.id ? `<div class="panel">${D.categories.filter(c => c.kind === r.kind).map(c => `<button class="row" data-p="impset" data-arg="${r.id}:${c.id}"><span class="who cat">${ic(c.mark)}</span><span class="nm">${c.name}</span><span></span></button>`).join('')}</div>` : ''}</div>`;
    const need = rows.filter(r => !r.cat).length;
    h = fhead('Check the import') + `<p class="note" style="padding:4px 4px 12px">${rows.length} found${FS.src === 'csv' ? ' in the statement' : ' on the receipt'}. Nothing saves until you do.</p>
      <div style="display:grid;gap:8px">${rows.map(card).join('') || '<div class="panel"><div class="empty"><b>No transactions left</b>Close to start again.</div></div>'}</div>
      <div class="formfoot" style="position:sticky;bottom:0;background:var(--ground)"><button class="btn" data-p="impsave" ${rows.length && !need ? '' : 'disabled'}>${need ? `${need} still need a category` : `Save ${rows.length}`}</button></div>`;
  } else if (formId === 'f-bulkcat') {
    h = fhead('Category for ' + selSet.size) + `<div class="panel">${budgets.map(c => `<button class="row" data-p="bulkcatset" data-arg="${c.id}"><span class="who cat">${ic(c.mark)}</span><span class="nm">${c.name}</span><span></span></button>`).join('')}</div>`;
  } else if (formId === 'f-bulkdate') {
    h = fhead('Date for ' + selSet.size) + `<label class="field"><span>Date</span><input type="date" id="bd" data-f="bd" value="${FS.bd || today}"></label><p class="note">Amount, name and category stay as they are.</p><div class="formfoot"><button class="btn" data-p="bulkdateset">Apply date</button></div>`;
  } else if (formId === 'f-bulkdel') {
    h = fhead('Delete ' + selSet.size) + `<div class="dhero"><div class="big serif num">${selSet.size}</div><p>transactions will be deleted for good.</p></div><div class="formfoot"><button class="btn ghost" data-p="fclose">Cancel</button><button class="btn danger" data-p="bulkdelyes">Delete ${selSet.size}</button></div>`;
  }
  el.innerHTML = h;
}
function formAction(p, arg){
  const amt = () => { const v = FS.amt1; if (v === undefined) return undefined; const m = parseMinor(v); if (m === null && v !== '') { FS.err = 'amt1'; renderForm(); return null; } return m || 0; };
  switch (p){
    case 'fclose': FS = {plannote: FS.plannote, rq: FS.rq}; return closeForm();
    case 'pickicon': FS.icon = arg; return renderForm();
    case 'fdel': FS.delAsk = true; return renderForm();
    case 'fdelno': FS.delAsk = false; return renderForm();
    case 'fdelyes': {
      if (formId === 'f-rule') XD.rules = XD.rules.filter(r => r.id !== formArg);
      if (formId === 'f-person') XD.people = XD.people.filter(r => r.id !== formArg);
      if (formId === 'f-savings') XD.savings = XD.savings.filter(r => r.id !== formArg);
      if (formId === 'f-loan') XD.loans = XD.loans.filter(r => r.id !== formArg);
      if (formId === 'f-owed') XD.owed = XD.owed.filter(r => r.id !== formArg);
      FS = {}; closeForm(); return toast('Deleted');
    }
    case 'budgetsave': { const m = amt(); if (m === null) return; if (formId === 'f-target') XD.target = m ?? XD.target; else { const c = cats[formArg] || cats[selCat]; if (m !== undefined) c.budget_minor = m || null; if (!budgets.includes(c) && c.budget_minor) budgets.push(c); } FS = {}; closeForm(); return toast('Budget saved'); }
    case 'budgetrm': { const c = cats[formArg] || cats[selCat]; FS = {}; closeForm(); return toast(`${c.name} keeps no budget now`); }
    case 'catsave': if (FS.cname !== undefined && !FS.cname.trim()) { FS.err = 'cname'; return renderForm(); } FS = {}; closeForm(); return toast('Category saved');
    case 'opensub': FS = {}; formArg = arg; return renderForm();
    case 'addsub': FS = {}; formArg = 'new'; return renderForm();
    case 'personsave': if (FS.pn !== undefined && FS.pn.trim()) { if (formArg === 'new') XD.people.push({id: 'p' + Date.now(), name: FS.pn.trim()}); else XD.people.find(x => x.id === formArg).name = FS.pn.trim(); } FS = {}; closeForm(); return toast('Saved');
    case 'rcat': FS.cat = arg; return renderForm();
    case 'rulesave': {
      const r = XD.rules.find(x => x.id === formArg), get = k => FS[k] ?? r?.[k];
      if (!(get('pattern') || '').trim()) { FS.err = 'pattern'; return renderForm(); }
      if (!get('block') && !get('topup') && !get('cat')) { FS.err = 'cat'; return renderForm(); }
      const nr = {id: r?.id || 'r' + Date.now(), pattern: get('pattern').trim().toLowerCase(), match: get('match') || 'exact', kind: get('kind') || 'expense', cat: get('cat'), block: !!get('block'), topup: !!get('topup'), note: get('note')};
      XD.rules = r ? XD.rules.map(x => x.id === r.id ? nr : x) : [nr].concat(XD.rules);
      FS = {}; closeForm(); return toast('Rule saved');
    }
    case 'bankedit': FS.editing = true; return renderForm();
    case 'banksave': { if (FS.bname !== undefined && !FS.bname.trim()) { FS.err = 'bname'; return renderForm(); } const m = amt(); if (m === null) return; const kind = formId.slice(2), list = kind === 'savings' ? XD.savings : kind === 'loan' ? XD.loans : XD.owed, x = list.find(i => i.id === formArg);
      if (!x) { if (!(FS.bname || '').trim()) { FS.err = 'bname'; return renderForm(); } list.push(kind === 'savings' ? {id: 's' + Date.now(), name: FS.bname.trim(), mark: FS.icon || 'savings', balance: 0, goal: m || 0, history: []} : {id: 'x' + Date.now(), name: FS.bname.trim(), principal: m || 0, remaining: m || 0, history: [{date: today, kind: kind === 'loan' ? 'borrowed' : 'lent', amount: m || 0}]}); }
      else { if (FS.bname) x.name = FS.bname.trim(); if (m !== undefined) kind === 'savings' ? x.goal = m : x.principal = m; if (FS.icon) x.mark = FS.icon; }
      FS = {}; closeForm(); return toast('Saved'); }
    case 'bankact': { const m = amt(); if (!m) { FS.err = 'amt1'; return renderForm(); } const kind = formId.slice(2), list = kind === 'savings' ? XD.savings : kind === 'loan' ? XD.loans : XD.owed, x = list.find(i => i.id === formArg), act = FS.act || {savings: 'add', loan: 'repaid', owed: 'repaid'}[kind];
      if (kind === 'savings') x.balance = act === 'add' ? x.balance + m : act === 'remove' ? Math.max(0, x.balance - m) : m; else x.remaining = act === 'repaid' ? Math.max(0, x.remaining - m) : x.remaining + m;
      if (act === 'borrowed' || act === 'lent') x.principal += m;
      x.history.unshift({date: today, kind: act, amount: m}); FS = {}; renderForm(); return toast('Saved'); }
    case 'impcat': FS.impPick = FS.impPick === arg ? null : arg; return renderForm();
    case 'impset': { const [id, c] = arg.split(':'); XD.imports.find(r => r.id === id).cat = c; FS.impPick = null; return renderForm(); }
    case 'impdrop': XD.imports = XD.imports.filter(r => r.id !== arg); return renderForm();
    case 'impsave': { const n = XD.imports.length; XD.imports.forEach(r => txs.unshift({id: 'm' + r.id + Date.now(), date: r.date, amount_minor: r.amount, kind: r.kind, category: r.cat, name: r.name, shared: false, paid_by: 'me'})); txs.sort((a, b) => b.date.localeCompare(a.date)); FS = {}; closeForm(); return toast(`Saved ${n} transactions`); }
    case 'bulkcatset': txs.forEach(t => { if (selSet.has(t.id) && t.kind === 'expense') t.category = arg; }); return bulkDone(`Moved ${selSet.size} to ${cats[arg].name}`);
    case 'bulkdateset': { const d = FS.bd || today; txs.forEach(t => { if (selSet.has(t.id)) t.date = d; }); txs.sort((a, b) => b.date.localeCompare(a.date)); return bulkDone(`Changed the date of ${selSet.size}`); }
    case 'bulkdelyes': { const n = selSet.size; txs = txs.filter(t => !selSet.has(t.id)); return bulkDone(`Deleted ${n}`); }
  }
}
function bulkDone(msg){ selSet = new Set(); selMode = false; FS = {}; closeForm(true); render(); toast(msg); }

/* the screens, the chrome around them, and routing that knows the new places */
const MORE = {home, transactions, budget, analytics, shared, bank, categories, rules, alerts, profile, plan, signin, signup, consent, callback};
const PHONE_TAB = {plan: 'budget', bank: 'home', categories: 'home', rules: 'home', alerts: 'home', profile: 'home', analytics: 'home'}, DESK_TAB = {plan: 'budget'};
const DEF = {'f-budget': 'eating_out', 'f-target': 'target', 'f-category': 'eating_out', 'f-person': 'p1', 'f-rule': 'r1', 'f-savings': 's1', 'f-loan': 'l1', 'f-owed': 'o1'};
function render(){
  const s = screen === 'add' ? under : screen, auth = AUTH.includes(s);
  document.getElementById('view').innerHTML = MORE[s]();
  document.body.classList.toggle('authpage', auth);
  if (state === 'offline' && !auth) { const h = document.querySelector('#view .pagehead'); if (h) h.insertAdjacentHTML('afterend', offBar()); }
  decorateSelect();
  syncChrome();
}
function syncChrome(){
  const s = screen === 'add' ? under : screen, wide = matchMedia('(min-width:960px)').matches;
  const cur = (wide ? DESK_TAB[s] : PHONE_TAB[s]) || s;
  document.querySelectorAll('.tab').forEach(b => { if (b.dataset.go === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const pr = document.getElementById('proto'); pr.hidden = screen === 'add' || (AUTH.includes(s) && s !== 'callback');
  pr.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.state === state));
}
function go(s, push){
  let st, a; [s, st, a] = String(s).split('~'); if (st) state = st;
  if (FORMS[s]) { FS = {}; return openForm(s, a); }
  if (formId) closeForm(true);
  if (document.getElementById('detail').classList.contains('on')) closeDetail();
  selMode = s === 'select'; selSet = new Set(); if (s === 'select') s = 'transactions';
  if (s === 'detail') { goC1('transactions'); return openDetail(txs[0].id); }
  if (s === 'import') { goC1('home'); openAdd(); A.step = 'import'; return renderAdd(); }
  if (s === 'add' && st === 'new') { goC1('home'); return startSalary(); }
  goC1(s, push);
}
function startSalary(){ openAdd(); A.kind = 'income'; A.cat = 'salary'; renderAdd(); }

/* clicks and typing for everything above; runs before the direction's own handler */
document.addEventListener('click', e => {
  const el = e.target.closest('button,[data-go]'); if (!el) return;
  const d = el.dataset;
  if (d.go && (FORMS[d.go] || d.go.includes('~') || d.push)) { e.stopPropagation(); if (FORMS[d.go]) { FS = {}; return openForm(d.go, d.arg); } return go(d.go, !!d.push); }
  if (selMode && d.tx) { e.stopPropagation(); selSet.has(d.tx) ? selSet.delete(d.tx) : selSet.add(d.tx); return decorateSelect(); }
  if (d.act === 'save' && document.getElementById('add').classList.contains('on')) { e.stopPropagation(); if (A.name.trim()) save(); return; }
  if (d.act === 'next' && A && A.kind === 'topup') { e.stopPropagation(); if (amtMinor() > 0) { A.step = 3; A.name = A.name || 'Top-up, shared account'; renderAdd(); } return; }
  if (d.act === 'add' && state === 'new') { e.stopPropagation(); return startSalary(); }
  if (d.act === 'kind') return;
  if (d.pick && A && A.step === 3) { e.stopPropagation(); A.cat = d.pick; sugOff = false; return renderAdd(); }
  if (!d.p) return;
  e.stopPropagation();
  const p = d.p, arg = d.arg;
  if (formId && document.getElementById('form').contains(el)) {
    if (p === 'seg') { const [k, v] = arg.split(':'); FS[{ckind: 'kind', rkind: 'kind', match: 'match', act: 'act'}[k] || k] = v; if (k === 'rkind') FS.cat = null; return renderForm(); }
    if (p === 'toggle') { const r = XD.rules.find(x => x.id === formArg); FS[arg] = !(FS[arg] ?? r?.[arg]); return renderForm(); }
    return formAction(p, arg);
  }
  switch (p){
    case 'seg': { const [k, v] = arg.split(':'); if (k === 'flow') flowPer = v; else if (k === 'shared') sharedPer = v; else FS[k] = v; return render(); }
    case 'toggle': if (arg === 'reminder') { XD.reminder = !XD.reminder; render(); return toast(XD.reminder ? 'Reminder on, every day at 18:00' : 'Daily reminder off'); } return;
    case 'salary': return startSalary();
    case 'select': selMode = true; selSet = new Set(); return render();
    case 'selcancel': selMode = false; selSet = new Set(); return render();
    case 'selall': txList(curT()).forEach(t => selSet.add(t.id)); return render();
    case 'bulkmove': { const pick = txs.filter(t => selSet.has(t.id)), to = !pick.every(t => t.shared); pick.forEach(t => { if (t.kind === 'expense') t.shared = to; }); return bulkDone(`Moved ${pick.length} to ${to ? 'shared' : 'yours'}`); }
    case 'older': olderOpen++; return render();
    case 'planprev': planOff = 1; return render();
    case 'plannext': planOff = 0; return render();
    case 'addshared': openAdd(); A.shared = true; return renderAdd();
    case 'sharedall': filter = 'shared'; return go('transactions', true);
    case 'avatar': return toast('Pick a photo from your phone');
    case 'export': return toast(`Exported ${(FS.fmt || 'csv').toUpperCase()}, ${fTime(FS.ex1 || D.last_cycle.start)} – ${fTime(FS.ex2 || today)}`);
    case 'del': delAsk = true; return refreshDetail(arg);
    case 'delno': delAsk = false; return refreshDetail();
    case 'delyes': { const t = txs.find(x => x.id === arg); txs = txs.filter(x => x.id !== arg); delAsk = false; selTx = null; closeDetail(); render(); return toast(`Deleted ${esc(t.name)}`); }
    case 'dup': { const t = txs.find(x => x.id === arg), n = {...t, id: 'n' + Date.now(), date: today}; txs = [n].concat(txs); closeDetail(); render(); return toast(`Duplicated ${esc(t.name)} to today`, n.id); }
    case 'move': { const t = txs.find(x => x.id === arg); t.shared = !t.shared; refreshDetail(arg); render(); return toast(t.shared ? 'Shared with Anna' : 'Now yours only'); }
    case 'edit': { const t = txs.find(x => x.id === arg); closeDetail(); openAdd(); editId = t.id; Object.assign(A, {step: 1, amt: minorIn(t.amount_minor), kind: t.kind, shared: t.shared, cat: t.category, name: t.name, note: t.note ?? null, dOff: Math.max(0, Math.round((Date.parse(today) - Date.parse(t.date)) / DAY))}); return renderAdd(); }
    case 'ruleFrom': { const t = txs.find(x => x.id === arg); closeDetail(); FS = {pfill: t.name.toLowerCase(), cat: t.category, match: 'exact'}; return openForm('f-rule', 'new'); }
    case 'kind': A.kind = A.kind === arg ? 'expense' : arg; A.shared = false; A.cat = null; return renderAdd();
    case 'duplast': { const t = txs.find(x => x.kind === 'expense'); Object.assign(A, {amt: minorIn(t.amount_minor), cat: t.category, name: t.name, shared: t.shared, step: 3}); return renderAdd(); }
    case 'saveanother': if (A.name.trim()) save(true); return;
    case 'nosug': sugOff = true; renderAdd(); return toast(`No more suggestions for ${esc(A.name.trim())}`);
    case 'importpick': A.step = 'import'; return renderAdd();
    case 'importgo': A.step = 'busy'; A.src = arg; renderAdd(); return setTimeout(() => { closeAdd(); FS = {src: arg}; openForm('f-import'); }, 900);
  }
}, true);
function refreshDetail(id){ const t = txs.find(x => x.id === (id || selTx || document.querySelector('#detailin [data-arg]')?.dataset.arg)); if (!t) return; if (document.getElementById('detail').classList.contains('on')) document.getElementById('detailin').innerHTML = `<div class="bar" style="display:grid"><button class="iconbtn" data-act="closedetail" aria-label="Close">${ic('close')}</button><h1>${t.kind === 'expense' ? 'Expense' : t.kind === 'income' ? 'Money in' : 'Moved'}</h1><span></span></div>${detailBody(t)}`; else { selTx = t.id; render(); } }
document.addEventListener('input', e => {
  const k = e.target.dataset.f; if (!k) return;
  FS[k] = e.target.value; if (FS.err === k || (k === 'amt1' && FS.err === 'amt1')) { FS.err = null; }
  if (k === 'rq' || k === 'cq') { const pos = e.target.selectionStart; k === 'rq' ? render() : renderAdd(); const i = document.getElementById(k); i.focus(); i.setSelectionRange(pos, pos); }
  if (['ex1', 'ex2'].includes(k)) render();
}, true);
document.addEventListener('input', e => { if (e.target.id === 'nm' && A && A.step === 3) { const pos = e.target.selectionStart; renderAdd(); const i = document.getElementById('nm'); i.setSelectionRange(pos, pos); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && formId) { e.stopPropagation(); closeForm(); } }, true);
document.getElementById('scrim').addEventListener('click', e => { if (formId) { e.stopImmediatePropagation(); closeForm(); } }, true);
matchMedia('(min-width:960px)').addEventListener('change', () => render());
