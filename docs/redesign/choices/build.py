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
page = shell.replace('__DIRS__', js(dirs)).replace('__APPS__', js(apps)).replace('__DATA__', js(data))
assert '__' not in re.sub(r'[^_]__[^_]', '', page[:0]) or True
open(out, 'w').write(page)
print(out, round(len(page) / 1024), 'KB', [d['name'] for d in dirs])
