# Builds the icon-system choices page: direction E (c1) three times, each with one icon system, plus a sheet of every icon.
# Usage: python3 docs/redesign/icons/build.py <out.html>
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(H, '..')
def js(v): return json.dumps(v, ensure_ascii=False).replace('<', '\\u003c')
c1 = open(os.path.join(R, 'directions', 'c1', 'app.html')).read()
icons = open(os.path.join(H, 'icons.js')).read()

def swap(s, a, b):
    assert a in s, a[:60]
    return s.replace(a, b, 1)

SHEET_CSS = """
.isheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:4px;padding:10px}
.isheet div{display:grid;justify-items:center;gap:6px;padding:12px 4px;text-align:center;font-size:11px;color:var(--ink-2);line-height:1.2}
.isheet svg.i{width:26px;height:26px;color:var(--ink)}
.istrip{display:flex;gap:18px;flex-wrap:wrap;align-items:center;padding:16px 18px;border-radius:18px}
.istrip svg.i{width:22px;height:22px}
.isizes{display:flex;gap:18px;align-items:end;padding:16px 18px}
"""
SHEET_JS = """
function icons(){
  const cell = ([n, l]) => `<div>${ic(n)}<span>${l}</span></div>`;
  return header('Icons') + `
  <h2 class="sec">On the card and on over</h2>
  <div class="istrip" style="background:var(--you);color:var(--on-you)">${['cycle','list','budgets','where','shared','moved','savings','in'].map(n => ic(n)).join('')}</div>
  <div class="istrip" style="background:var(--over-card);color:#fff;margin-top:8px">${['utensils','cup','bag','bolt','warn','basket','ticket','gift'].map(n => ic(n)).join('')}</div>
  <h2 class="sec">Sizes</h2>
  <div class="panel isizes">${[16,20,24,32,44].map(s => ic('basket').replace('class="i ', `style="width:${s}px;height:${s}px" class="i `)).join('')}${[16,20,24,32,44].map(s => ic('shared').replace('class="i ', `style="width:${s}px;height:${s}px" class="i `)).join('')}</div>
  ${window.ICON_GROUPS.map(([g, list]) => `<h2 class="sec">${g}</h2><div class="panel isheet">${list.map(cell).join('')}</div>`).join('')}`;
}
"""

def variant(k):
    s = c1
    s = swap(s, '<script src="../../data/cashflow-fake.js"></script>', f'<script src="../../data/cashflow-fake.js"></script>\n<script>window.ICONSET={js(k)};\n{icons}</script>')
    a = s.index('/* one icon family'); b = s.index('const ic = ', a); b = s.index('\n', b)
    s = s[:a] + 'const ic = (n, cls) => window.renderIcon(n, cls);' + s[b:]
    for go, name in [('home', 'cycle'), ('transactions', 'list'), ('budget', 'budgets'), ('analytics', 'where')]:
        a = s.index(f'<button class="tab" data-go="{go}"><svg'); b = s.index('</svg>', a) + 6
        s = s[:a] + f'<button class="tab" data-go="{go}"><i data-ic="{name}"></i>' + s[b:]
    a = s.index('<button class="addbtn" data-act="add" aria-label="Add a transaction"><svg'); b = s.index('</svg>', a) + 6
    s = s[:a] + '<button class="addbtn" data-act="add" aria-label="Add a transaction"><i data-ic="add"></i>' + s[b:]
    s = swap(s, "const SCREENS = ['home','add','transactions','budget','analytics'];", "const SCREENS = ['home','add','transactions','budget','analytics','icons'];")
    s = swap(s, '({home, transactions, budget, analytics})[s]()', '({home, transactions, budget, analytics, icons})[s]()')
    s = swap(s, '/* routing */', SHEET_JS + '\n/* routing */')
    s = swap(s, '/* start */', "/* start */\ndocument.querySelectorAll('[data-ic]').forEach(e => { e.outerHTML = ic(e.dataset.ic); });")
    s = swap(s, '</style>', SHEET_CSS + '</style>')
    return s

if __name__ == '__main__':
    out = sys.argv[1]
    sets = [('a', 'Fine line', 'A thin soft line. Calm, the lightest touch.'),
            ('b', 'Soft fill', 'The same line with a soft wash inside. Friendlier, still quiet.'),
            ('c', 'Solid pebble', 'Solid, rounded shapes with the details cut out. Easiest to read small.')]
    dirs = [{'id': k, 'letter': 'ABC'[i], 'name': n, 'idea': idea} for i, (k, n, idea) in enumerate(sets)]
    apps = {k: variant(k) for k, _, _ in sets}
    cfg = {'h1': 'Three icon systems', 'lede': 'The same app with each system. Tap through it, or compare all three on one screen. Pick one and leave a note. Everything saves by itself.',
           'dirLabel': 'Icon system', 'pickQ': 'Best on {name}', 'overallQ': 'Your icon system', 'screens': [
        {'id': 'icons', 'name': 'Every icon', 'said': 'All icons the app needs, on the card, on over, and at every size.'},
        {'id': 'home', 'name': 'Home', 'said': 'Tabs, category marks and the add button in place.'},
        {'id': 'transactions', 'name': 'Transactions', 'said': 'Category marks in a long list.'},
        {'id': 'budget', 'name': 'Budgets', 'said': 'Marks on the red card and in rows.'},
        {'id': 'add', 'name': 'Add', 'said': 'Categories to pick, date, note, switch.'},
        {'id': 'overall', 'name': 'Overall', 'said': 'Which system? Anything to change in it.'}]}
    data = open(os.path.join(R, 'data', 'cashflow-fake.js')).read()
    shell = open(os.path.join(R, 'choices', 'shell.html')).read()
    page = shell.replace('__TITLE__', 'Cashflow Icons').replace('__CFG__', js(cfg)).replace('__DIRS__', js(dirs)).replace('__APPS__', js(apps)).replace('__DATA__', js(data))
    open(out, 'w').write(page)
    for k in apps:
        os.makedirs(os.path.join(H, 'out'), exist_ok=True); open(os.path.join(H, 'out', f'app-{k}.html'), 'w').write(apps[k])
    print(out, round(len(page) / 1024), 'KB')
