---
type: draft
repo: builders-sodax-mcp-server
github: 110
status: Done, pushed as e7a7278 and folded into the PR #111 body (2026-11-11)
updated: 2026-11-11
---

Delta on top of a8546fa/e973996, uncommitted in the 110 worktree:

- `url.path`: data API calls are logged by their route, from the drift-checked contract (`/v1/be/config/spoke/chains`
  instead of `.../spoke/*`); other paths mask every segment from the fifth on and, before that, any that isn't a
  plain lowercase word. A test fails if the API client builds a path the contract doesn't have.
- The Swaps API's failure records use `url.path` and `http.status` like the `Upstream call` record; ids in the
  upstream message are masked.
- A `Unified logging heartbeat` record every 5 minutes, through the logger at info whatever `LOG_LEVEL`, so the
  observability stack's liveness alert doesn't page for a quiet server.
- A late shutdown of a replaced OTel handle leaves the newer one attached.
Tests 1011.
