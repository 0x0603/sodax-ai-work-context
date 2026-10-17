import re,sys,os,collections
# usage: pkgnames.py <module-regex> <dir>...
modre=re.compile(sys.argv[1])
names=collections.defaultdict(set)
for d in sys.argv[2:]:
    for root,dirs,files in os.walk(d):
        dirs[:]=[x for x in dirs if x not in('node_modules','dist','.turbo','coverage')]
        for fn in files:
            if not re.search(r'\.(ts|tsx|mts)$',fn) or re.search(r'\.test\.tsx?$',fn) or fn.endswith('.d.ts'): continue
            p=os.path.join(root,fn)
            src=open(p,encoding='utf-8').read()
            for m in re.finditer(r"(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)'",src):
                mod=m.group(3)
                if not modre.search(mod): continue
                body=m.group(2).strip()
                tonly=bool(m.group(1))
                if body.startswith('*'):
                    names[(mod,'* as '+body.split()[-1])].add(p); continue
                inner=re.search(r'\{([\s\S]*)\}',body)
                if inner:
                    for n in inner.group(1).split(','):
                        n=n.strip()
                        if not n: continue
                        t = tonly or n.startswith('type ')
                        n=n.replace('type ','').split(' as ')[0].strip()
                        names[(mod,n+(' (type)' if t else ''))].add(p)
                else:
                    names[(mod,'default '+body)].add(p)
for (mod,n),ps in sorted(names.items()):
    print(f"{mod}\t{n}\t{len(ps)}\t"+", ".join(sorted(os.path.relpath(x) for x in ps)))
