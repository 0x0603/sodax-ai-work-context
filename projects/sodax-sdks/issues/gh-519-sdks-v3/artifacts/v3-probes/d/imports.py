import re,sys,pathlib
root=pathlib.Path(sys.argv[1]); pkg=sys.argv[2]; own=set(open(sys.argv[3]).read().split())
pat=re.compile(r"import\s+(type\s+)?\{([^}]*)\}\s+from\s+['\"]"+re.escape(pkg)+r"['\"]",re.S)
names={}; files=0
for p in list(root.rglob('*.ts'))+list(root.rglob('*.tsx')):
    if 'node_modules' in p.parts: continue
    t=p.read_text(errors='ignore'); found=False
    for m in pat.finditer(t):
        found=True
        for n in m.group(2).split(','):
            n=n.strip()
            if not n: continue
            n=re.sub(r'^type\s+','',n).split(' as ')[0].strip()
            names[n]=names.get(n,0)+1
    files+=found
foreign={n:c for n,c in names.items() if n not in own}
print(f"files importing {pkg}: {files}; distinct names: {len(names)}; names not defined in dapp-kit (come via export * from sdk): {len(foreign)}; occurrences: {sum(foreign.values())}")
print(' '.join(sorted(foreign, key=lambda k:-foreign[k])[:60]))
