import re, sys, collections, functools
rows = []
for line in open(sys.argv[1]):
    line = line.rstrip("\n")
    if not line: continue
    f = line.split("|")
    rows.append(dict(id=f[0], title=f[1], cl=f[2], pts=int(f[3]), brk=f[4], wave=f[5], deps=f[6], conf=f[7], note=f[8]))
byid = {r["id"]: r for r in rows}
tier_of_item = {1:"Must",2:"Now",3:"Must",4:"Must",5:"Must",6:"Must",7:"Must",8:"Now",9:"Now",10:"Now",11:"Now",12:"Must",13:"Must",14:"Now",15:"Must",16:"Must",17:"Must",
 18:"Should",19:"Should",20:"Should",21:"Should",22:"Should",23:"Should",24:"Should",25:"Now",26:"Should",27:"Should",28:"Should",29:"Should",30:"Later",31:"Later",32:"Later",33:"Later",34:"Later",35:"Later",36:"Later"}
def tier(r):
    if r["id"].startswith("A1."): return "Must"
    if r["id"] == "T7.0": return "Must"
    if r["id"] in ("T26.2", "T27.1"): return "Must*"   # Should items that Must items depend on
    if r["id"] in ("T1.16",): return "In-flight"
    if r["id"] in ("T3.8", "T3.9"): return "Should"   # proposed wallet-sdk-react upgrades (§12)
    if r["id"] in ("T3.11", "T3.12"): return "Later"
    n = int(re.match(r"T(\d+)", r["id"])[1])
    return tier_of_item[n]
for r in rows: r["tier"] = tier(r)
def dep_ids(r):
    out = []
    for tok in re.findall(r"T\d+\.\d+(?:[–-]\d+)?|T\d+\.\d+\.\*|A1\.\d|T6\.5\.\*|T1\.18-25", r["deps"]):
        if tok in byid: out.append(tok); continue
        m = re.fullmatch(r"T(\d+)\.(\d+)[–-](\d+)", tok)
        if m:
            for k in range(int(m[2]), int(m[3]) + 1):
                if f"T{m[1]}.{k}" in byid: out.append(f"T{m[1]}.{k}")
    return out
@functools.lru_cache(None)
def longest(i):
    r = byid[i]
    best = (0, [])
    for d in dep_ids(r):
        if byid[d]["tier"] not in ("Now","Must","Must*") and r["tier"] in ("Now","Must","Must*"): continue
        l = longest(d)
        if l[0] > best[0]: best = l
    return (best[0] + r["pts"], best[1] + [i])
crit = max((longest(r["id"]) for r in rows if r["wave"] in ("W6", "W7") and r["tier"] in ("Now","Must","Must*")), key=lambda x: x[0])
print("critical path to 3.0 (pts):", crit[0], " -> ".join(crit[1]))
wc = max((longest(r["id"]) for r in rows if r["cl"] == "C" and r["wave"] == "W6"), key=lambda x: x[0])
print("wallet chain:", wc[0], " -> ".join(wc[1]))
t = collections.defaultdict(int)
for r in rows: t[r["tier"]] += r["pts"]
print("by tier:", dict(t))
crit30 = sum(r["pts"] for r in rows if r["tier"] in ("Now", "Must", "Must*") and r["wave"] != "W8")
print("3.0 critical scope (Now+Must+Must*, excl. downstream W8):", crit30)
# markdown
order = [("W1","Now — no blockers"),("W2","After the user's open PRs merge (#509 #511 #512 #523, plus #488)"),("W3","After #534 merges (or the ADR cutoff)"),("W4","After #483 is resolved"),("W5","After the user's lifecycle issues (#529 #531 #532)"),("G","Contract gate — must be done before the first breaking merge"),("W6","Contract window (3.0.0-rc.N)"),("W7","API freeze → docs and skills → 3.0.0-rc.1"),("W8","After 3.0.0-rc.1 — downstream repos"),("L","Later (3.x)")]
out = []
for w, label in order:
    rs = [r for r in rows if r["wave"] == w]
    out.append(f"## {w} · {label}\n\n{len(rs)} sub-issues · {sum(r['pts'] for r in rs)} pts\n")
    out.append("| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |")
    out.append("| --- | --- | --: | :-: | --- | --- | --- | --- |")
    for r in rs:
        out.append(f"| {r['id']} | `{r['title']}` | {r['pts']} | {'✔' if r['brk']=='y' else ''} | {r['tier']} | {r['deps']} | {r['conf']} | {r['note']} |")
    out.append("")
open(sys.argv[2], "w").write("\n".join(out))
print("wrote", sys.argv[2])
