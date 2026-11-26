# Deterministic fake month for the redesign prototypes. No real data.
import json, random, datetime as dt
import os; random.seed(int(os.environ.get("SEED","1")))
D = dt.date
cats = [
 # id, name, budget (kr), mark hint
 ("groceries","Groceries",4500,"basket"),("eating_out","Eating out",1500,"cup"),("transport","Transport",900,"train"),
 ("home","Home",9800,"house"),("bills","Bills",1100,"bolt"),("shopping","Shopping",1500,"bag"),
 ("fun","Fun",1000,"ticket"),("health","Health",400,"cross"),("gifts","Gifts",800,"gift"),
]
income_cats = [("salary","Salary"),("other_income","Other income")]
def k(x): return int(round(x*100))
def tx(day, amount, kind, cat, name, shared=False, paid_by="me", note=None):
    return dict(date=day.isoformat(), amount_minor=k(amount), kind=kind, category=cat, name=name, shared=shared, paid_by=paid_by, **({"note":note} if note else {}))
def cycle(start, end_excl, scale, fixed_day_shift=0):
    t=[tx(start, 31200, "income","salary","Salary · Nordlys ApS".replace(" · "," "))]
    t.append(tx(start, 9800,"expense","home","Rent"))
    t.append(tx(start, 4000,"transfer",None,"To savings"))
    t.append(tx(start+dt.timedelta(days=2), 489,"expense","bills","Telia"))
    t.append(tx(start+dt.timedelta(days=3), 129,"expense","bills","Spotify",))
    t.append(tx(start+dt.timedelta(days=5), 389.5,"expense","bills","Ørsted"))
    t.append(tx(start+dt.timedelta(days=8), 149,"expense","bills","Netflix"))
    for off in (0,15):
        t.append(tx(start+dt.timedelta(days=off), 1500,"topup",None,"Top-up, shared account", True, "me"))
        t.append(tx(start+dt.timedelta(days=off+1), 1000,"topup",None,"Top-up from Anna", True, "anna"))
    groc=[("Netto",(80,420)),("Rema 1000",(90,480)),("Føtex",(150,650)),("Lidl",(70,300)),("Irma",(60,240))]
    eat=[("Lagkagehuset",(38,95)),("Joe & the Juice",(55,89)),("Wolt",(169,289)),("Too Good To Go",(39,45)),("Mikkeller Bar",(120,260)),("Sticks'n'Sushi",(420,610))]
    trn=[("Rejsekort",(18,54)),("DSB",(98,268)),("Donkey Republic",(25,40))]
    shop=[("Normal",(49,189)),("H&M",(199,499)),("Zalando",(349,899)),("IKEA",(89,640))]
    fun=[("Cinemaxx",(135,270)),("Tivoli",(165,165)),("Steam",(79,199))]
    hl=[("Matas",(59,249)),("Apotek",(45,180))]
    d=start
    while d<end_excl:
        r=random.random()
        if r<0.62: n,(a,b)=random.choice(groc); t.append(tx(d,round(random.uniform(a,b)*scale,2),"expense","groceries",n, shared=random.random()<0.55))
        if random.random()<0.42: n,(a,b)=random.choice(eat); t.append(tx(d,round(random.uniform(a,b)*scale,2),"expense","eating_out",n, shared=random.random()<0.3))
        if random.random()<0.38: n,(a,b)=random.choice(trn); t.append(tx(d,round(random.uniform(a,b),2),"expense","transport",n))
        if random.random()<0.12: n,(a,b)=random.choice(shop); t.append(tx(d,round(random.uniform(a,b)*scale,2),"expense","shopping",n))
        if random.random()<0.09: n,(a,b)=random.choice(fun); t.append(tx(d,round(random.uniform(a,b),2),"expense","fun",n, shared=random.random()<0.5))
        if random.random()<0.06: n,(a,b)=random.choice(hl); t.append(tx(d,round(random.uniform(a,b),2),"expense","health",n))
        d+=dt.timedelta(days=1)
    return t
# November cycle: salary Fri 30 Oct (last banking day), next salary Mon 30 Nov. Today Thu 26 Nov.
today=D(2026,11,26)
cur=cycle(D(2026,10,30), today+dt.timedelta(days=1), 0.92)
cur+= [tx(D(2026,11,21),412,"expense","gifts","Illums Bolighus", note="Mum's birthday"),
       tx(D(2026,11,14),350,"income","other_income","MobilePay from Jonas", note="Concert tickets"),
       tx(D(2026,11,25),1249,"expense","shopping","Zalando", note="Winter jacket")]
prev=cycle(D(2026,9,30), D(2026,10,30), 1.0)
def fit(ts, targets, keep=()):
    # Rescale the random items of each category so the cycle tells a fixed story.
    for c,target in targets.items():
        items=[t for t in ts if t["kind"]=="expense" and t["category"]==c and t["name"] not in keep]
        fixed=sum(t["amount_minor"] for t in ts if t["kind"]=="expense" and t["category"]==c and t["name"] in keep)
        tot=sum(t["amount_minor"] for t in items)
        if not items or not tot: continue
        f=(k(target)-fixed)/tot
        for t in items: t["amount_minor"]=max(100,int(round(t["amount_minor"]*f/100))*100+random.choice([0,50,95,0,25,75]))
fit(cur, dict(groceries=4380, eating_out=1840, transport=720, shopping=1388, fun=520, health=240), keep=("Zalando",))
fit(prev, dict(groceries=4210, eating_out=1310, transport=810, shopping=1620, fun=690, health=180))
for i,t in enumerate(sorted(cur,key=lambda x:x["date"])+sorted(prev,key=lambda x:x["date"])): pass
cur=sorted(cur,key=lambda x:(x["date"],x["name"]),reverse=True); prev=sorted(prev,key=lambda x:(x["date"],x["name"]),reverse=True)
for i,t in enumerate(cur): t["id"]=f"t{i+1:03d}"
for i,t in enumerate(prev): t["id"]=f"p{i+1:03d}"
def spent(ts): 
    s={}
    for t in ts:
        if t["kind"]=="expense": s[t["category"]]=s.get(t["category"],0)+t["amount_minor"]
    return s
# shared fairness: shared expenses split 50/50 by inference from top-ups; here: Anna owes the rest
sh=sum(t["amount_minor"] for t in cur if t["kind"]=="expense" and t["shared"])
me_top=sum(t["amount_minor"] for t in cur if t["kind"]=="topup" and t["paid_by"]=="me")
anna_top=sum(t["amount_minor"] for t in cur if t["kind"]=="topup" and t["paid_by"]=="anna")
ratio=me_top/(me_top+anna_top)
data=dict(
 note="Fake data for prototypes only. Amounts are integer minor units (øre).",
 locale="en-DK", currency="DKK", today=today.isoformat(), me="You", partner="Anna",
 cycle=dict(label="November", start="2026-10-30", next_payday="2026-11-30", days_left=4, days_total=31),
 last_cycle=dict(label="October", start="2026-09-30", end_exclusive="2026-10-30"),
 categories=[dict(id=i,name=n,budget_minor=k(b),mark=m,kind="expense") for i,n,b,m in cats]+[dict(id=i,name=n,budget_minor=None,mark="arrow-in",kind="income") for i,n in income_cats],
 transactions=cur, last_cycle_transactions=prev,
 summary=dict(
   income_minor=sum(t["amount_minor"] for t in cur if t["kind"]=="income"),
   spent_minor=sum(t["amount_minor"] for t in cur if t["kind"]=="expense"),
   budget_total_minor=sum(k(b) for _,_,b,_ in cats),
   spent_by_category_minor=spent(cur), last_cycle_spent_by_category_minor=spent(prev),
   saved_this_cycle_minor=k(4000),
   shared=dict(rule="Both top up a shared account. Your share of shared spending = your top-ups / all top-ups. Never a typed ratio.", my_topups_minor=me_top, partner_topups_minor=anna_top, shared_spending_minor=sh, my_share_ratio=round(ratio,4), my_share_minor=round(sh*ratio), partner_share_minor=sh-round(sh*ratio), shared_balance_minor=me_top+anna_top-sh),
 ),
 suggestions=dict(last_used_categories=["groceries","eating_out","transport"], name_suggestions={"groceries":["Netto","Rema 1000","Føtex"],"eating_out":["Lagkagehuset","Wolt"],"transport":["Rejsekort","DSB"]}),
)
out=__import__("os").path.join(__import__("os").path.dirname(__file__),"..","data","cashflow-fake.js")
open(out,"w").write("// "+data["note"]+"\nwindow.CASHFLOW_DATA = "+json.dumps(data,ensure_ascii=False,indent=1)+";\n")
s=data["summary"]; print(len(cur),len(prev), {k:v/100 for k,v in s.items() if isinstance(v,int)}, {c:v/100 for c,v in s["spent_by_category_minor"].items()}, {c:v for c,v in s["shared"].items() if c!="rule"})
