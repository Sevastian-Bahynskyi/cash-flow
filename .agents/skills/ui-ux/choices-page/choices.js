// The choices page. It needs window.FLOWS from screens.js:
// [{ id, name, screens: [{ id, name, html: variant => '<div>..</div>', variants?: [['a','A. Name']], said?: 'one line', ask?: true (shows Yes / No), wire?: (view, api) => {} }] }]
(() => {
  const FLOWS = window.FLOWS, el = id => document.getElementById(id), phone = el('phone');
  phone.innerHTML = '<div id="view"></div><div class="status"><i></i></div>';
  const view = el('view'), pick = {}, likes = {}, notes = {}; let flow = 0, at = 0, col = null, timer;
  const list = () => FLOWS[flow].screens;
  const api = { go: (i, d = 1) => { at = Math.max(0, Math.min(list().length - 1, i)); render(d); }, next: () => api.go(at + 1, 1), back: () => api.go(at - 1, -1), render: () => render(0) };
  const keep = async id => { if (!col) { el('state').textContent = 'Not saved here. Tell Claude in the chat.'; return; } try { await col.doc(id).set({ note: notes[id] ?? '', like: likes[id] ?? null, pick: pick[id] ?? null }); el('state').textContent = 'Saved'; } catch { el('state').textContent = 'Not saved. Tell Claude in the chat.'; } };
  const save = () => { const id = list()[at].id; el('state').textContent = 'Saving\u2026'; clearTimeout(timer); timer = setTimeout(() => keep(id), 600); };
  function render(dir = 1) {
    const s = list()[at], v = pick[s.id] ?? s.variants?.[0][0];
    view.innerHTML = `<div class="scrn ${dir === 0 ? 'still' : ''}" style="--dir:${dir}">${s.html(v)}</div>`;
    view.querySelectorAll('[data-next]').forEach(b => { b.onclick = api.next; }); view.querySelectorAll('[data-back]').forEach(b => { b.onclick = api.back; }); s.wire?.(view, api);
    el('flows').innerHTML = FLOWS.map((f, i) => `<button data-f="${i}" class="${i === flow ? 'on' : ''}">${f.name}</button>`).join(''); el('flows').querySelectorAll('button').forEach(b => { b.onclick = () => { flow = +b.dataset.f; api.go(0, 1); }; });
    el('vars').hidden = !s.variants; el('vars').innerHTML = (s.variants ?? []).map(([k, n]) => `<button data-v="${k}" class="${k === v ? 'on' : ''}">${n}</button>`).join(''); el('vars').querySelectorAll('button').forEach(b => { b.onclick = () => { pick[s.id] = b.dataset.v; render(0); save(); }; });
    el('said').hidden = !s.said; el('said').textContent = s.said ?? ''; el('likes').hidden = !s.ask; el('likes').querySelectorAll('button').forEach(b => { b.classList.toggle('on', likes[s.id] === b.dataset.like); b.onclick = () => { likes[s.id] = likes[s.id] === b.dataset.like ? null : b.dataset.like; render(0); save(); }; });
    el('where').textContent = `${at + 1} of ${list().length}`; el('sname').textContent = s.name; el('note').value = notes[s.id] ?? ''; el('state').textContent = '';
    el('strip').innerHTML = list().map((x, i) => `<button data-at="${i}" class="${i === at ? 'on' : ''}${notes[x.id] || likes[x.id] ? ' has' : ''}"><em>${i + 1}</em>${x.name}</button>`).join('');
  }
  el('strip').onclick = e => { const b = e.target.closest('[data-at]'); if (b) api.go(+b.dataset.at, 1); };
  el('prev').onclick = api.back; el('fwd').onclick = api.next; el('again').onclick = () => { flow = 0; api.go(0, 1); };
  el('note').oninput = () => { notes[list()[at].id] = el('note').value; save(); };
  render();
  (async () => { const db = await window.claude?.use?.('db'); if (!db) return; col = db.collection('picks'); for (const s of FLOWS.flatMap(f => f.screens)) { try { const d = await col.doc(s.id).get(); const v = d?.exists === false ? null : (typeof d?.data === 'function' ? d.data() : d?.data ?? d); if (v?.note && notes[s.id] === undefined) notes[s.id] = v.note; if (v?.like && !likes[s.id]) likes[s.id] = v.like; if (v?.pick && !pick[s.id]) pick[s.id] = v.pick; } catch { /* none yet */ } } render(0); })();
})();
