import re, sys, collections
rows = []
for line in open(sys.argv[1]):
    line = line.rstrip("\n")
    if not line: continue
    f = line.split("|")
    assert len(f) == 9, (len(f), line)
    rows.append(dict(id=f[0], title=f[1], cl=f[2], pts=int(f[3]), brk=f[4], wave=f[5], deps=f[6], conf=f[7], note=f[8]))
ids = [r["id"] for r in rows]
dup = [i for i, c in collections.Counter(ids).items() if c > 1]
assert not dup, dup
rank = {"W1": 1, "W2": 2, "W3": 2, "W4": 2, "W5": 2, "G": 3, "W6": 4, "W7": 5, "W8": 6, "L": 7}
byid = {r["id"]: r for r in rows}
def expand(tok):
    tok = tok.strip()
    m = re.fullmatch(r"(T\d+)\.(\d+)[–-](?:T\d+\.)?(\d+)", tok)
    if m and tok not in byid:
        return [f"{m[1]}.{k}" for k in range(int(m[2]), int(m[3]) + 1)]
    return [tok]
problems = []
for r in rows:
    for tok in re.findall(r"\b(?:T\d+(?:\.\d+(?:[–-](?:T\d+\.)?\d+)?)?(?:\.\*)?|A1\.\d)\b(?:-25|\.\*)?", r["deps"]):
        for t in expand(tok):
            if t in ("T1.18-25", "T6.5.*"):
                pass
            if t not in byid:
                if re.fullmatch(r"T\d+", t) or t.endswith(".x"):
                    continue  # whole-item reference
                problems.append(f"{r['id']}: unknown dep {t}")
                continue
            if rank[byid[t]["wave"]] > rank[r["wave"]]:
                problems.append(f"{r['id']} ({r['wave']}) depends on later {t} ({byid[t]['wave']})")
print("rows", len(rows), "problems", len(problems))
for p in problems: print(" ", p)
tot = collections.defaultdict(int); cnt = collections.defaultdict(int)
for r in rows:
    tot[r["wave"]] += r["pts"]; cnt[r["wave"]] += 1
order = ["W1", "W2", "W3", "W4", "W5", "G", "W6", "W7", "W8", "L"]
print("by wave:", ", ".join(f"{w} {cnt[w]}/{tot[w]}" for w in order))
cl = collections.defaultdict(int)
for r in rows: cl[r["cl"]] += r["pts"]
print("by cluster:", dict(cl))
phase = collections.defaultdict(int)
for r in rows:
    p = "2.x" if rank[r["wave"]] <= 3 else ("later" if r["wave"] == "L" else "3.0")
    phase[p] += r["pts"]
print("by phase:", dict(phase), "total", sum(r["pts"] for r in rows))
print("breaking:", sum(1 for r in rows if r["brk"] == "y"), "rows,", sum(r["pts"] for r in rows if r["brk"] == "y"), "pts")
xrepo = [r for r in rows if r["title"].startswith("(sodax-") or r["title"].startswith("(intents")]
print("cross-repo:", len(xrepo), sum(r["pts"] for r in xrepo))
cond = [r for r in rows if "conditional" in r["note"]]
print("conditional:", [(r["id"], r["pts"]) for r in cond])
