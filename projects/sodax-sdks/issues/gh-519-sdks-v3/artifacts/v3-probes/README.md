# v3 research probes (2026-10-16)

Small, hand-written helpers the four research agents used against the read-only `origin/main`
tree at cc053fef. Installs, source copies and outputs were left in the session scratchpad and are
not kept. Each report's last section ("Probes run") lists the commands and results.

| Dir | Cluster | What |
| --- | --- | --- |
| `a/` | A · build/packaging | side-effect scan, import/cycle scans, per-entry esbuild measure, tsc transpile probe |
| `b/` | B · core/chains | import inventory per chain, dispatcher tally, PR diff helpers |
| `c/` | C · wallet | tsconfigs and manifests for the wagmi v3 / TS 5.5 vs 5.9 typecheck probes |
| `d/` | D · dapp-kit/migration | dapp-kit import and naming inventories |

The root holds the synthesis data:
- `subissues.psv`: the 148 sub-issues, one per line, columns id|title|cluster|pts|breaking|wave|deps|conflicts|note.
- `check.py`: validates dependencies and wave order, and prints totals.
- `gen.py`: prints the critical path and the tier totals, and regenerates the `plan-v3-subissues.md` body.

```bash
python3 -I check.py subissues.psv
python3 -I gen.py subissues.psv /tmp/index.md
```
