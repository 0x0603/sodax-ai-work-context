---
type: plan
repo: sodax-unified-api
github: 1372
updated: 2026-10-20
---

# PR 2 — sodax-unified-api

Contracts and decisions: `plan.md`. Paths are relative to the sodax-unified-api repo root (line
numbers are at `development` 0db34ec). Read `AGENTS.md` (review rubric) and `CLAUDE.md` first.
Branch: `feat/1372-per-org-rate-limit` → PR to `development`.

Verified on HAProxy 2.8.31 (`process.md` §HAProxy 2.8 spike): map lookup with `sha2(256),hex,lower`,
`map_str_int`, `sub(txn.var)`, `req.hdr(x,1)`, `tune.stick-counters 4` + `sc3`,
`prepare/add/commit map` (works on a `level operator` socket; `disable frontend` is denied there),
map files surviving a reload. **2.8 has no `opt@`/`virt@`** — a referenced map file must exist.

## 1. `gateway-configs/haproxy/haproxy.cfg`

**global** (after the existing `stats socket` line, L4):
```
  # keyset-sync sidecar (#1372): map updates only. operator level cannot disable frontends or servers.
  stats socket /run/haproxy/keyset-sync.sock user haproxy group haproxy mode 660 level operator
  # sc0-sc2 are taken by the edge rate limits; sc3 holds the per-org counter.
  tune.stick-counters 4
```
Confirm the socket's owner/mode with `ls -l` in a `haproxy:2.8` container.

**fe_edge rate-limit block** (L200–280). Keep everything that exists; changes in order:

1. After `acl rl_jailed …` (L262), add:
   ```
   # Per-org limit (#1372): key -> org -> limit, from maps kept by scripts/keyset-sync.py. Only the
   # FIRST x-api-key is hashed, as in the app guard. A miss in either map leaves rl_keyed false, so an
   # unknown key, a suspended org or an org without a limit stays on the per-IP caps.
   http-request set-var(txn.rl_org) req.hdr(x-api-key,1),sha2(256),hex,lower,map_str(/etc/haproxy/maps/apikey_org.map) if !rl_portal { req.hdr(x-api-key,1) -m found }
   http-request set-var(txn.rl_org_limit) var(txn.rl_org),map_str_int(/etc/haproxy/maps/org_limit.map) if { var(txn.rl_org) -m found }
   acl rl_keyed   var(txn.rl_org_limit) -m found
   ```
2. After the `track-sc1 … st_rl_write` line (L268):
   ```
   http-request track-sc3 var(txn.rl_org) table st_rl_org if rl_keyed
   ```
   `sc0` keeps tracking the client IP for EVERY request, keyed or not — the jail reads `sc0`.
3. After `acl rl_over_write …` (L273):
   ```
   http-request set-var(txn.rl_org_over) sc_http_req_rate(3),sub(txn.rl_org_limit) if rl_keyed
   acl rl_over_org     var(txn.rl_org_over) -m int gt 0
   ```
4. The `return 429` lines, final order:
   1. jail — unchanged;
   2. **new:** `http-request return status 429 content-type application/json hdr Retry-After 60 hdr Access-Control-Allow-Origin "*" lf-string '{"ok":false,"error":"org_rate_limited"}' if rl_keyed rl_over_org`
   3. per-IP rate — change the condition to `if rl_over_rate !rl_portal !rl_keyed or rl_over_portal rl_portal`;
   4. write cap — unchanged (still per IP, keyed or not).

**New stick table** next to the `st_rl_*` backends (L878–898):
```
# Per-org counter (#1372). Key = org id (Better Auth ids fit in 64 chars). Per gateway, not peered.
backend st_rl_org
  stick-table type string len 64 size 20k expire 2m store http_req_rate(60s)
```

**Comments:** rewrite L202–203 ("Flood protection only … does not replace the app-level business
throttles") to describe two layers — per-IP flood protection, plus a per-org cap for requests with a
known key. Add the org cap to the numbered tier list in the comment block (L217–248), noting it is
per gateway, the limit comes from api-auth divided by `KEYSET_LIMIT_DIVISOR`, and it never latches
the jail.

**PR description must list the effect per route family** (`AGENTS.md` P1 rubric): keyed requests on
every non-portal route use the org cap instead of 300/10s; portal routes unchanged; write cap and
jail unchanged; keyless traffic unchanged; with empty maps nothing changes.

## 2. Deploy agent — create missing map files before validation

`scripts/sodax_deploy/validate.py`, new function:
```python
def ensure_map_files(cfg_path, maps_dir):
    """Create empty map files the config references under maps_dir, if missing. Never overwrites."""
```
- Find absolute paths in the cfg matching `map(?:_[a-z]+)*\((/[^,)\s]+)`; keep only those whose
  directory is `maps_dir` (compare real paths). Paths elsewhere are left for `haproxy -c` to reject.
- `os.makedirs(maps_dir, 0o755, exist_ok=True)`; for each missing file, create it empty (`open(path, 'x')`),
  `chmod 0o644`, log `INFO created empty map <path>`. Never truncate an existing file.

Call sites:
- `scripts/sodax-gateway-deploy.py` `deploy()` (~L62): `validate.ensure_map_files(candidate, cfg["SODAX_MAPS_DIR"])`
  right before `validate.validate_config(candidate)`, inside the same `try`.
- `scripts/sodax_deploy/apply.py` `rollback()` (~L118): same call on `backup` before
  `run(["haproxy", "-c", "-f", backup])` (import inside the function if needed to avoid a cycle).
- Add `(validate, "ensure_map_files")` to `_REQUIRED_API` (~L155–176).
- `scripts/sodax_deploy/config.py` `DEFAULTS`: `"SODAX_MAPS_DIR": "/etc/haproxy/maps"`; add it to
  `scripts/sodax-gateway-deploy.env.example` (optional block), `scripts/install.py` `ENV_ORDER`, and
  the Configuration reference table in `scripts/README.md`.

This is a safety net. Rollout step 3 in `plan.md` pre-creates the files, because the agent on a
gateway only changes after `update-agent.py update` — until then the old agent would reject the new
cfg (safe, but noisy).

## 3. CI and the mirrored validate snippet

Add to the stub step in `.github/workflows/ci.yml` (L46–55), `CLAUDE.md` (L13–22) and `AGENTS.md`
(L46–56) — all three must stay identical:
```
mkdir -p /etc/haproxy/maps && touch /etc/haproxy/maps/apikey_org.map /etc/haproxy/maps/org_limit.map
```
Add a CI job (or step) running `python3 scripts/keyset-sync.py --self-test`.

## 4. Sidecar — new `scripts/keyset-sync.py`

Stdlib only; target Python 3.8+ (no `match`, no `tomllib`). Must byte-compile — `update-agent.py`
compiles every `scripts/*.py` before adopting a checkout. Independent of `sodax_deploy` (no imports
from it).

**CLI:** default = run forever; `--once` = one fetch/apply, then exit; `--self-test` = offline checks,
exit 0/1.

**Config:** env file at `$KEYSET_SYNC_ENV_FILE` (default `/etc/sodax-keyset-sync.env`), `KEY="value"`
lines parsed the same way as `sodax_deploy/config.py`; real environment variables override.

| Variable | Default | Notes |
|---|---|---|
| `KEYSET_URL` | required | `https://auth.sodax.com/v1/keyset` on all gateways (prod api-auth) |
| `KEYSET_TOKEN` | required | verifier token; never logged |
| `KEYSET_POLL_SECONDS` | `15` | |
| `KEYSET_TIMEOUT_SECONDS` | `10` | |
| `KEYSET_LIMIT_DIVISOR` | `1` | `2` on gateway-a/b; per-gateway limit = `ceil(limit / divisor)` |
| `KEYSET_MAX_LIMIT` | `1000000` | cap, mirrors api-auth validation |
| `KEYSET_MAPS_DIR` | `/etc/haproxy/maps` | must match the paths in haproxy.cfg |
| `KEYSET_SOCKET` | `/run/haproxy/keyset-sync.sock` | also accept `tcp://host:port` (local testing) |

**One tick:**
1. `GET KEYSET_URL` with `Authorization: Bearer <token>`, `Accept: application/json`, and
   `If-None-Match: <last etag>` when there is one. TLS verification stays on.
2. **304** → drift check: read `entry_cnt` for both maps via `show map`; if it differs from what
   was last applied, re-apply the last good rows (step 6). Done.
3. **200** → parse; require a `keys` list. For each entry keep it only if:
   `orgStatus == "active"`; `limits.rateLimitPerMinute` is an `int` (not bool), ≥ 1 (cap at
   `KEYSET_MAX_LIMIT`); `keyHash` matches `^[0-9a-f]{64}$`; `orgId` matches `^[A-Za-z0-9_-]{1,64}$`.
   Rows: `keys[keyHash] = orgId`, `orgs[orgId] = ceil(limit / divisor)`. Count kept and skipped.
   Validation is also the guard against command injection on the socket — nothing unvalidated is
   ever written to a file or the socket.
4. Render both files deterministically: header `# managed by keyset-sync.py — do not edit`, then
   sorted `key value` lines.
5. Write each file atomically: `.<name>.tmp` in the same dir → write → flush → `fsync` → `chmod 0644`
   → `os.replace`.
6. Apply at runtime, per map: `prepare map <path>` → parse `New version created: N` →
   `add map @N <path> <payload>` (multi-line payload; if 2.8 rejects it, one `add map @N` per entry)
   → `commit map @N <path>`. Any unexpected response is a failure. Only `show/prepare/add/commit map`
   are ever sent.
7. Success → store the ETag and the applied counts; log one line
   `applied version=<first 10 chars> orgs=<n> keys=<m> skipped=<s>`.
8. Any failure (network, 401/403, 5xx, bad JSON, file write, socket) → log one ERROR line (no token,
   no hashes), **clear the stored ETag** so the next tick does a full fetch, keep the current maps.
   401/403 is logged as "token rejected".

SIGTERM → exit cleanly. Logs go to stdout (journald).

**`--self-test`** (no network, no socket), each case asserted:
suspended org skipped; org without limit skipped; limit `0`, `1.5`, `"100"`, `true` skipped; bad
hash skipped; orgId containing a space or newline skipped; divisor 2 → `ceil(1801/2) = 901`; cap at
`KEYSET_MAX_LIMIT`; two keys of one org → one org row; rendering is sorted and stable; parsing of
`New version created: 3`.

## 5. systemd unit — `scripts/systemd-units.py`

Add `SYNC_SERVICE = "sodax-keyset-sync.service"`, a `sync_unit()` generator, and subcommands
`install-keyset-sync` / `uninstall-keyset-sync` (separate from the deploy agent's install, so a
gateway can run one without the other); include it in `status`.
```
[Unit]
Description=SODAX keyset sync (per-org rate-limit maps for HAProxy)
After=network-online.target haproxy.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 <HERE>/keyset-sync.py
Environment="KEYSET_SYNC_ENV_FILE=/etc/sodax-keyset-sync.env"
User=sodax-keyset
Group=sodax-keyset
SupplementaryGroups=haproxy
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/etc/haproxy/maps
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

## 6. Docs

`scripts/README.md`, following its existing structure:
- Contents table: `keyset-sync.py`.
- New install step:
  ```bash
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin sodax-keyset
  sudo install -d -o sodax-keyset -g haproxy -m 0755 /etc/haproxy/maps
  sudo install -m 0640 -o root -g sodax-keyset /dev/null /etc/sodax-keyset-sync.env   # then fill it
  sudo -u sodax-keyset python3 <repo>/scripts/keyset-sync.py --self-test
  sudo -u sodax-keyset python3 <repo>/scripts/keyset-sync.py --once
  sudo <repo>/scripts/systemd-units.py install-keyset-sync
  ```
  Note: the `sodax-keyset` user must be able to read the checkout.
- Day-to-day: logs (`journalctl -u sodax-keyset-sync`), inspect maps (`show map` on the socket),
  **after `update-agent.py update` run `sudo systemctl restart sodax-keyset-sync`** (the agent never
  restarts services), turn off (`systemctl stop` + empty the two map files + `systemctl reload haproxy`).
- Configuration reference, Troubleshooting (token rejected, socket permission, map files missing),
  Security notes (operator-level socket, input validation, token file mode).

Design doc v1.4.0 (doc-semver, `CONTRIBUTING.md` L57–112):
- New `docs/design/Unified_SODAX_API_Design_Document_v1.4.0.md`; `git mv` v1.3.1 into
  `docs/design/versions/`; bump `Version`; Version-history row "1.4.0 — per-org rate limit at the
  edge (sodax-backend#1372) — ADR-004".
- §4.1: add an "Org cap" row (scope: requests with a key mapped to an active org that has a limit;
  threshold: limit ÷ divisor per 60s per gateway; effect: 429 `org_rate_limited`, `Retry-After: 60`,
  never feeds the jail). Replace "Business limits per route or per API key stay in the apps. This
  layer is flood protection only." Correct "A `peers` section would fix both": open-source peers
  overwrite counters, so they would only stop a reload from clearing them.
- §5 Components / §6 Deployment: the sidecar.
- New `docs/design/adr/ADR-004.md` from `ADR_TEMPLATE.md`: per-org rate limit at the edge via a
  keyset-sync sidecar (context, decision, consequences: per-gateway counting, dark launch).
- Update the current-version pointers: `CONTRIBUTING.md` L40, `README.md` L133/L148/L213,
  `AGENTS.md` L337. Do **not** create the `design-v1.4.0` tag.

## 7. Definition of done

- CI snippet passes locally: `haproxy -c` in `haproxy:2.8` with the map stubs.
- `python3 scripts/keyset-sync.py --self-test` and `python3 scripts/sodax-gateway-deploy.py --self-test` pass.
- `ensure_map_files` checked against a temp dir: creates missing files, leaves existing ones untouched.
- **Local end-to-end** (no gateway needed):
  1. api-auth locally with Postgres (sodax-backend `docs/partner-portal-local-dev.md` or
     `docker-compose.api-auth.yml`) with your own verifier/provisioner tokens; mint two keys for one
     org (`POST /v1/keys`), one for a second org; `PATCH /v1/tiers/base {"limits":{"rateLimitPerMinute":500}}`.
  2. Test copy of the real cfg: substitute `<PLACEHOLDER_HOST>`, replace the `:443 ssl … verify required`
     bind with `bind :8080`, add `stats socket ipv4@127.0.0.1:9999 level operator` (test copy only).
  3. Run `haproxy:2.8` with that cfg and a mounted maps dir; run the sidecar with
     `KEYSET_SOCKET=tcp://127.0.0.1:9999`, `KEYSET_MAPS_DIR=<mounted dir>`, `--once`, then forever.
  4. Probe an unmatched path (answered by `be_404`, so no origin is needed). Expect:
     - no key: 300 pass per 10s, then `rate_limited`;
     - the two keys of the first org together: past 300, then `org_rate_limited` at 500 per 60s;
     - unknown key, or the second org with its limit cleared: per-IP 300;
     - suspend the first org → after the next sync: per-IP 300;
     - keyed flood > 1500/10s → `temporarily_blocked` (jail still per IP);
     - `docker kill -s USR2` (reload) → maps still loaded;
     - clear the tier limit → maps empty within ~15s.
- PR description: per-route-family effects, how it was verified, the rollout steps from `plan.md`,
  and the out-of-scope notes.
