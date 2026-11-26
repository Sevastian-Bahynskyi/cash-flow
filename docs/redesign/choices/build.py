# Builds the choices page: the shell with every direction's app.html and the fake data inlined.
# Usage: python3 docs/redesign/choices/build.py <out.html> [ids...]
import json, os, re, sys
R = os.path.join(os.path.dirname(__file__), '..')
out, ids = sys.argv[1], sys.argv[2:] or ['a1', 'a2', 'b1', 'b2', 'c1']
def js(v): return json.dumps(v, ensure_ascii=False).replace('<', '\\u003c')
dirs, apps = [], {}
for n, i in enumerate(ids):
    d = os.path.join(R, 'directions', i)
    apps[i] = open(os.path.join(d, 'app.html')).read()
    meta = json.load(open(os.path.join(d, 'meta.json'))) if os.path.exists(os.path.join(d, 'meta.json')) else {}
    dirs.append({'id': i, 'letter': 'ABCDE'[n], 'name': meta.get('name', i), 'idea': meta.get('idea', '')})
data = open(os.path.join(R, 'data', 'cashflow-fake.js')).read()
shell = open(os.path.join(os.path.dirname(__file__), 'shell.html')).read()
CFG = {'h1': 'Five directions', 'lede': 'Try each one like the app, or compare them on one screen. Pick a direction per screen, or mix, and leave a note. Everything saves by itself.', 'dirLabel': 'Direction', 'pickQ': 'Best {name} screen', 'overallQ': 'Your direction overall', 'screens': [
    {'id': 'home', 'name': 'Home', 'said': 'The cycle: what is left, days to payday, what needs attention.'},
    {'id': 'add', 'name': 'Add', 'said': 'The fast path: amount, category, name, save. Try it.'},
    {'id': 'transactions', 'name': 'Transactions', 'said': 'This cycle, by day, in and out.'},
    {'id': 'budget', 'name': 'Budget', 'said': 'Eating out is over. All budgets at a glance.'},
    {'id': 'analytics', 'name': 'Analytics', 'said': 'Where did the money go, and is it different from last cycle?'},
    {'id': 'overall', 'name': 'Overall', 'said': 'Which direction, or which mix? Anything else.'}]}
page = shell.replace('__TITLE__', 'Cashflow Directions').replace('__CFG__', js(CFG)).replace('__DIRS__', js(dirs)).replace('__APPS__', js(apps)).replace('__DATA__', js(data))
open(out, 'w').write(page)
print(out, round(len(page) / 1024), 'KB', [d['name'] for d in dirs])
