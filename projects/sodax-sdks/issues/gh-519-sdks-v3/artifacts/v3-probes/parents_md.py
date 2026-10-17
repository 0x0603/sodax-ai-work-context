import sys, csv, importlib.util, re
psv, tsv, out = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location("pt", sys.argv[4]); pt = importlib.util.module_from_spec(spec); spec.loader.exec_module(pt)
rows = [l.rstrip("\n").split("|") for l in open(psv) if l.strip()]
def parent(i): return "A1" if i.startswith("A1.") else re.match(r"(T\d+)", i)[1]
ids = {f[0] for f in rows}
def dep_ids(s):
    out = []
    for tok in re.findall(r"T\d+\.\d+(?:[–-]\d+)?|A1\.\d|T6\.5\.\*|T1\.18-25", s):
        if tok in ids: out.append(tok); continue
        m = re.fullmatch(r"T(\d+)\.(\d+)[–-](\d+)", tok)
        if m: out += [f"T{m[1]}.{k}" for k in range(int(m[2]), int(m[3]) + 1) if f"T{m[1]}.{k}" in ids]
    return out
subs = {}
for f in rows: subs.setdefault(parent(f[0]), []).append(f)
P = [l.rstrip("\n").split("\t") for l in open(tsv)]
short = {k: v[3] for k, v in pt.P.items()}
L = []
L.append("## Summary\n")
L.append("| Parent | Title | Subs | Pts | Waves | Breaking | Waits on (parents) | External gates |")
L.append("| --- | --- | --: | --: | --- | :-: | --- | --- |")
singles = []
for p in P:
    pid, kind, n, pts, waves, brk, waits, ext, score, tier = p
    if kind == "single":
        f = subs[pid][0]; singles.append((pid, f, waves, score, tier)); continue
    title = pt.P[pid][0]
    L.append(f"| **{pid}** | `{title}` | {n} | {pts} | {waves.replace(',', ', ')} | {'✔' if brk else ''} | {waits.replace(',', ', ') or '—'} | {ext.replace(',', ', ') or '—'} |")
L.append("")
L.append(f"**Single-PR items (no parent):** " + "; ".join(f"{pid} → `{f[1]}` ({f[3]} pt{'s' if f[3] != '1' else ''}, {f[5]})" for pid, f, *_ in singles) + ".\n")
L.append("## What each issue is for\n")
L.append("| Issue | Kind | Why it matters |")
L.append("| --- | --- | --- |")
for p in P:
    pid, kind = p[0], p[1]
    L.append(f"| **{pid}** | {'parent' if kind == 'parent' else 'single PR'} | {pt.BENEFIT[pid]} |")
L.append("")
L.append("## Single-PR issue drafts\n")
L.append("These need no parent; file them as plain issues.\n")
for pid, f, waves, score, tier in singles:
    L.append(f"### {pid} — {f[0]}\n")
    L.append(f"(context) score {score}/10 · {tier} · {f[3]} pt{'s' if f[3] != '1' else ''} · {f[5]} · depends on: {f[6]} · conflicts: {f[7]}\n")
    L.append("**Title**")
    L.append("```text\n" + f[1] + "\n```")
    L.append("**Body**")
    sb = [f"**Why it matters.** {pt.BENEFIT[pid]}", ""]
    if f[8]: sb += [f"**Notes.** {f[8]}", ""]
    if f[6] and f[6] != "–": sb += [f"**Depends on:** {f[6]}.", ""]
    sb.append(f"_v3 plan item {pid} ({f[0]}) · score {score}/10 · {tier}_")
    L.append("```markdown\n" + "\n".join(sb) + "\n```\n")
L.append("## Parent drafts\n")
for p in P:
    pid, kind, n, pts, waves, brk, waits, ext, score, tier = p
    if kind == "single": continue
    title, goal, plan, sh, _ = pt.P[pid]
    L.append(f"### {pid} — {sh}\n")
    L.append(f"(context) score {score or '—'}/10 · {tier} · {n} sub-issues · {pts} pts · waves {waves.replace(',', ', ')} · detail: `research/` section for {pid}, order and conflicts: `plan-v3-order.md` §3–§5\n")
    L.append("**Title**")
    L.append("```text\n" + title + "\n```")
    L.append("**Body**")
    body = [f"**Goal.** {goal}", "", f"**Why it matters.** {pt.BENEFIT[pid]}", "", f"**Plan.** {plan}", ""]
    if waits:
        items = []
        for w in waits.split(","):
            pairs = [(f[0], d) for f in subs[pid] for d in dep_ids(f[6]) if parent(d) == w]
            mine, theirs = pairs[0]
            more = f" +{len(pairs)-1}" if len(pairs) > 1 else ""
            items.append(f"{w} {short.get(w, w)} ({mine} needs {theirs}{more})")
        body.append("**Waits on:** " + "; ".join(items) + ".")
    if ext:
        body.append("**External gates:** " + ", ".join(ext.split(",")) + ".")
    if waits or ext: body.append("")
    body.append("**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):")
    for f in subs[pid]:
        body.append(f"- [ ] {f[0]} `{f[1]}` — {f[3]} pt{'s' if f[3] != '1' else ''} · {f[5]}{' · ✔' if f[4]=='y' else ''}")
    body.append("")
    body.append(f"_v3 plan item {pid}" + (f" · score {score}/10 · {tier}_" if score else " · release prerequisite_"))
    L.append("```markdown\n" + "\n".join(body) + "\n```\n")
open(out, "w").write("\n".join(L))
print("parents:", sum(1 for p in P if p[1] == "parent"), "singles:", len(singles))
