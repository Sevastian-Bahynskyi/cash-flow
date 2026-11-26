# Builds the full prototype (direction E with icon system B and every screen of the app) and its review page.
# Usage: python3 docs/redesign/proto/build.py <out.html>    (also writes proto/out/app.html for headless shots)
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(H, '..')
sys.path.insert(0, os.path.join(R, 'icons'))
from build import variant, js  # icons/build.py

def swap(s, a, b):
    assert a in s, a[:70]
    return s.replace(a, b, 1)

NAV = '''<nav class="nav" aria-label="Main">
  <div class="brand">Cashflow</div>
  <button class="tab" data-go="home"><i data-ic="cycle"></i><span>Cycle</span></button>
  <button class="tab" data-go="transactions"><i data-ic="list"></i><span>Transactions</span></button>
  <button class="tab" data-go="budget"><i data-ic="budgets"></i><span>Budgets</span></button>
  <button class="tab deskonly" data-go="analytics"><i data-ic="where"></i><span>Where it went</span></button>
  <button class="tab" data-go="shared"><i data-ic="shared"></i><span>Shared</span></button>
  <button class="tab deskonly" data-go="bank"><i data-ic="bank"></i><span>Bank</span></button>
  <div class="navsep deskonly"></div>
  <button class="tab deskonly" data-go="categories"><i data-ic="tag"></i><span>Categories</span></button>
  <button class="tab deskonly" data-go="rules"><i data-ic="rule"></i><span>Merchant rules</span></button>
  <button class="tab deskonly" data-go="alerts"><i data-ic="bell"></i><span>Alerts</span></button>
  <button class="tab deskonly" data-go="profile"><i data-ic="profile"></i><span>Profile</span></button>
  <button class="addbtn" data-act="add" aria-label="Add a transaction"><i data-ic="add"></i><span>Add</span></button>
</nav>'''

def app():
    s = variant('b')
    a = s.index('<nav class="nav"'); b = s.index('</nav>', a) + 6
    s = s[:a] + NAV + s[b:]
    s = swap(s, "const SCREENS = ['home','add','transactions','budget','analytics','icons'];",
             "const SCREENS = ['home','add','transactions','budget','analytics','shared','bank','categories','rules','alerts','profile','plan','signin','signup','consent','callback'];")
    s = swap(s, "const curT = () => state === 'empty' ? [] : txs;", "const curT = () => state === 'empty' || state === 'new' ? [] : txs;")
    for name in ['home', 'transactions', 'budget', 'analytics', 'go']:
        s = swap(s, f'function {name}(', f'function {name}C1(')
    s = swap(s, 'function detailBody(t){', 'function detailBodyC1(t){')
    s = swap(s, "{big: 'Your ' + D.cycle.label + ' cycle',", "{right: avatarBtn(), big: 'Your ' + D.cycle.label + ' cycle',")
    s = swap(s, '${heroCard(m)}${look}', '${heroCard(m)}${whereLink(m)}${look}')
    s = swap(s, '<span class="spacer"></span><button class="iconbtn deskonly" data-act="search"', '<span class="spacer"></span><button class="btn link" data-p="select">Select</button><button class="iconbtn deskonly" data-act="search"')
    s = swap(s, '<button data-state="error">Error</button>', '<button data-state="error">Error</button><button data-state="offline">Offline</button><button data-state="new">New</button>')
    s = swap(s, '<div class="toast" id="toast"', '<section class="sheet" id="form" role="dialog" aria-modal="true" aria-label="Edit"><div class="in" id="formin"></div></section>\n<div class="toast" id="toast"')
    s = swap(s, "} else go(SCREENS.includes(start) ? start : 'home');", "} else { const b0 = start.split('~')[0]; go(SCREENS.includes(b0) || FORMS[b0] || ['select', 'detail', 'import'].includes(b0) ? start : 'home'); }")
    s = swap(s, '/* start */', open(os.path.join(H, 'more.js')).read() + '\n/* start */')
    s = swap(s, '</style>', open(os.path.join(H, 'more.css')).read() + '\nbody.authpage{display:block}\nbody.authpage .nav{display:none}\nbody.authpage #view{max-width:none;padding-top:0;padding-bottom:0}\n</style>')
    return s

# The review page: one strip item per screen and state; ids are screen~state~arg, notes save per item.
S = lambda i, n, said: {'id': i, 'name': n, 'said': said}
SCREENS = [
    S('home~content', 'Cycle', 'What is left until payday. Where it went sits under the card.'),
    S('home~new', 'Cycle, new account', 'No salary yet. One action: log it.'),
    S('home~offline', 'Cycle, offline', 'The last numbers stay; a quiet line says so.'),
    S('add~content', 'Add', 'Amount, category, name. Date, note, Anna, income, the pot and import are one tap away.'),
    S('import~content', 'Import', 'A receipt or a bank file.'),
    S('f-import~content', 'Check the import', 'Every row checked before anything saves.'),
    S('transactions~content', 'Transactions', 'This cycle by day, older cycles below.'),
    S('detail~content', 'A transaction', 'Edit, duplicate, share, a rule from it, delete.'),
    S('select~content', 'Change many', 'Select, then move, set category or date, or delete.'),
    S('budget~content', 'Budgets', 'One category against its budget, all nine at a glance.'),
    S('f-budget~content~eating_out', 'Set a budget', ''),
    S('plan~content', 'Cycle plan', 'Salary, target, what is left to save.'),
    S('analytics~content', 'Where it went', 'Where the money went, and money in and out.'),
    S('shared~content', 'Shared', 'The pot with Anna, your part, what you spent together.'),
    S('bank~content', 'Bank', 'Savings, loans, money owed to you.'),
    S('f-savings~content~s1', 'A savings pot', ''),
    S('f-loan~content~l1', 'A loan', ''),
    S('categories~content', 'Categories', 'With subcategories and the people you share with.'),
    S('f-category~content~eating_out', 'Edit a category', ''),
    S('rules~content', 'Merchant rules', ''),
    S('f-rule~content~r1', 'Edit a rule', ''),
    S('alerts~content', 'Alerts', ''),
    S('profile~content', 'Profile', 'On a phone, also the way to Bank, Categories, Rules and Alerts.'),
    S('signup~content', 'Sign up', ''),
    S('signin~content', 'Sign in', ''),
    S('callback~content', 'Signing in', ''),
    S('consent~content', 'Another app asks', ''),
    S('overall', 'Overall', 'Anything missing, or anything to change before I build it?'),
]

if __name__ == '__main__':
    out = sys.argv[1]
    a = app()
    os.makedirs(os.path.join(H, 'out'), exist_ok=True)
    open(os.path.join(H, 'out', 'app.html'), 'w').write(a)
    cfg = {'h1': 'Cashflow prototype', 'lede': 'Every screen of the app, clickable, with fake data. Use it like the app, switch states in its top corner, and leave a note on any screen. Everything saves by itself.',
           'dirLabel': 'Prototype', 'pickQ': 'Like it as it is?', 'overallQ': 'Ready to build?', 'screens': SCREENS}
    data = open(os.path.join(R, 'data', 'cashflow-fake.js')).read()
    shell = open(os.path.join(R, 'choices', 'shell.html')).read()
    dirs = [{'id': 'p', 'letter': 'E', 'name': 'Two inks', 'idea': 'With the Soft fill icons.'}]
    page = shell.replace('__TITLE__', 'Cashflow Prototype').replace('__CFG__', js(cfg)).replace('__DIRS__', js(dirs)).replace('__APPS__', js({'p': a})).replace('__DATA__', js(data))
    open(out, 'w').write(page)
    print(out, round(len(page) / 1024), 'KB')
