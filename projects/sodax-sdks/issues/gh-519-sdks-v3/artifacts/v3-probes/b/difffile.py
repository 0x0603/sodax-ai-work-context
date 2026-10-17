import sys,re
# usage: difffile.py diff path-substring  -> prints that file's hunk
path=sys.argv[2]
out=False
for line in open(sys.argv[1],encoding='utf-8',errors='replace'):
    if line.startswith('diff --git'):
        out = path in line
    if out: sys.stdout.write(line)
