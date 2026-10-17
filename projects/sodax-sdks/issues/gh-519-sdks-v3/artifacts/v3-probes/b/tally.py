import sys,collections,re
c=collections.Counter(); per=collections.defaultdict(collections.Counter)
for l in open(sys.argv[1]):
    f,m=l.strip().split(':',1)
    meth=re.search(r'\.(\w+)\($',m).group(1)
    feat=f.lstrip('./').split('/')[0]
    c[meth]+=1; per[feat][meth]+=1
print("by method:", dict(c.most_common()), "total", sum(c.values()))
for k,v in sorted(per.items(), key=lambda x:-sum(x[1].values())):
    print(f"  {k}: {sum(v.values())} ", dict(v.most_common()))
