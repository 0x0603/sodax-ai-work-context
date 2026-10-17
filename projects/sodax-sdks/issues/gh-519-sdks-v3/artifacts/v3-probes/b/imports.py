import re,sys,os
# usage: imports.py root file...
root=sys.argv[1]
for f in sys.argv[2:]:
    p=os.path.join(root,f)
    src=open(p).read()
    # gather import statements (multi-line)
    stmts=re.findall(r"^(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+'([^']+)';", src, re.M)
    full=re.findall(r"^((?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+'([^']+)';)", src, re.M)
    print("==",f)
    for st,mod in full:
        names=re.sub(r"\s+"," ",st)
        names=re.sub(r"^(import|export)\s+","",names)
        names=re.sub(r"\s+from\s+'[^']+';$","",names)
        print("   ",mod,"<-",names[:300])
