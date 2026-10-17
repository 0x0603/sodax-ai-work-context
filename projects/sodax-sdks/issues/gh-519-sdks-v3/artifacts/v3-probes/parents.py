import re, sys, collections
psv, out_md, out_tsv = sys.argv[1], sys.argv[2], sys.argv[3]
rows = []
for l in open(psv):
    f = l.rstrip("\n").split("|")
    if len(f) == 9:
        rows.append(dict(id=f[0], title=f[1], cl=f[2], pts=int(f[3]), brk=f[4] == "y", wave=f[5], deps=f[6], conf=f[7], note=f[8]))
byid = {r["id"]: r for r in rows}
score = {1:10,2:9,3:9,4:8,5:8,6:8,7:8,8:7,9:7,10:7,11:7,12:7,13:7,14:7,15:6,16:6,17:6,18:6,19:6,20:5,21:5,22:5,23:5,24:5,25:4,26:4,27:4,28:4,29:4,30:3,31:3,32:3,33:3,34:3,35:2,36:2}
tier = {1:"Must",2:"Now",3:"Must",4:"Must",5:"Must",6:"Must",7:"Must",8:"Now",9:"Now",10:"Now",11:"Now",12:"Must",13:"Must",14:"Now",15:"Must",16:"Must",17:"Must",18:"Should",19:"Should",20:"Should",21:"Should",22:"Should",23:"Should",24:"Should",25:"Now",26:"Should",27:"Should",28:"Should",29:"Should",30:"Later",31:"Later",32:"Later",33:"Later",34:"Later",35:"Later",36:"Later"}
def parent(i):
    return "A1" if i.startswith("A1.") else re.match(r"(T\d+)", i)[1]
groups = collections.OrderedDict()
for r in rows: groups.setdefault(parent(r["id"]), []).append(r)
order = ["A1"] + [f"T{n}" for n in range(1, 37)]
waves = ["W1","W2","W3","W4","W5","G","W6","W7","W8","L"]
def dep_ids(s):
    out = []
    for tok in re.findall(r"T\d+\.\d+(?:[–-]\d+)?|A1\.\d|T6\.5\.\*|T1\.18-25", s):
        if tok in byid: out.append(tok); continue
        m = re.fullmatch(r"T(\d+)\.(\d+)[–-](\d+)", tok)
        if m: out += [f"T{m[1]}.{k}" for k in range(int(m[2]), int(m[3]) + 1) if f"T{m[1]}.{k}" in byid]
    return out
meta = {}
for p, rs in groups.items():
    w = sorted({r["wave"] for r in rs}, key=waves.index)
    waits = sorted({parent(d) for r in rs for d in dep_ids(r["deps"]) if parent(d) != p}, key=order.index)
    ext = sorted({m for r in rs for m in re.findall(r"#\d+", r["deps"])}, key=lambda x: int(x[1:]))
    gates = []
    for r in rs:
        d = r["deps"].lower()
        if "product" in d: gates.append("product decision")
        if "team decision" in d: gates.append("team decision")
        if "cross-repo parent issue" in d: gates.append("cross-repo parent issue")
        if "owner decision" in d: gates.append("owner decision")
    meta[p] = dict(rs=rs, pts=sum(r["pts"] for r in rs), waves=w, brk=any(r["brk"] for r in rs), waits=waits, ext=ext, gates=sorted(set(gates)))
for p in meta:
    meta[p]["blocks"] = sorted([q for q in meta if p in meta[q]["waits"]], key=order.index)
with open(out_tsv, "w") as t:
    for p in order:
        if p not in meta: continue
        m = meta[p]; n = int(p[1:]) if p != "A1" else None
        kind = "parent" if len(m["rs"]) > 1 else "single"
        t.write("\t".join([p, kind, str(len(m["rs"])), str(m["pts"]), ",".join(m["waves"]), "y" if m["brk"] else "", ",".join(m["waits"]), ",".join(m["ext"] + m["gates"]), str(score.get(n, "")), tier.get(n, "Must")]) + "\n")
print("written", out_tsv)
