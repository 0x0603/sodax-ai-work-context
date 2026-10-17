import re,sys,pathlib
root=pathlib.Path(sys.argv[1]); pkg=sys.argv[2]
pat=re.compile(r"import\s+(type\s+)?\{([^}]*)\}\s+from\s+['\"]"+re.escape(pkg)+r"['\"]",re.S)
names={}
for p in list(root.rglob('*.ts'))+list(root.rglob('*.tsx')):
    if 'node_modules' in p.parts: continue
    t=p.read_text(errors='ignore')
    for m in pat.finditer(t):
        for n in m.group(2).split(','):
            n=re.sub(r'^type\s+','',n.strip()).split(' as ')[0].strip()
            if n: names[n]=names.get(n,0)+1
print(len(names)); print(' '.join(f"{k}:{v}" for k,v in sorted(names.items(), key=lambda kv:-kv[1])))
