---
type: process
repo: sodax-frontend
github: 1623
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Implemented on `fix/1623-fence-scraped-content` (local commit `322b53b6`,
  not pushed). 3 files, +54 / −3.

## Findings

### `signalsBlock` is attacker-controlled too — this is the part worth not missing

The ticket asks to "confirm `scraped.signalsBlock` is fully derived from our own extraction
and contains no verbatim attacker text; if it does, fence it too." **It does.**
`formatSignalsBlock` (`lib/lead-magnet/scrape.ts:485-514`) emits:

| line | source | trusted? |
| --- | --- | --- |
| `Title:` (`:487`) | first `# ` line of the scraped markdown, else `<meta title>` | **verbatim** |
| `Top headings:` (`:489`) | first 5 `#`/`##` lines of the page | **verbatim** |
| `Meta description:` (`:492`) | `<meta name="description">`, entity-decoded | **verbatim** |
| `Meta keywords:` (`:493`) | `<meta name="keywords">` | **verbatim** |
| `OG description:` (`:494`) | `<meta property="og:description">` | **verbatim** |
| `Primary chain:` / `Detected chains` / `Unsupported networks` / `ICP keyword hits` / `Docs found` | matched against closed sets / boolean | ours |

Five verbatim fields, **no length cap, no escaping, newlines intact** — a `<meta
name="description">` containing newlines and markdown headings goes straight into the prompt.
And `signalsBlock` is interpolated **twice** (`route.ts:514` and `:520`, "repeated for
emphasis"), so an injection gets two shots. Fencing only `scraped.content` would have left
the smaller but higher-signal channel wide open.

`scraped.content` itself: capped at `SCRAPE_CHAR_CAP = 25000` (`scrape.ts:15`, applied at
`:406`), raw Jina-Reader markdown of the target page.

### The live system prompt is not in the repo

`fetchLeadMagnetSystemPrompt` (`lib/lead-magnet/notion-prompt.ts:88-111`) fetches the system
prompt **from a Notion page at request time**, walking `blocks/{id}/children` depth-first. The
in-repo `SYSTEM_PROMPT` / `SOLANA_SYSTEM_PROMPT` are used only when the env pair is unset, when
Notion returns empty, or on a fetch error.

Two consequences that shaped the fix:

1. A trust-boundary clause added only to the repo would **not be in effect in production**.
   So the clause is sent in the **user prompt**, which is code, on every request.
2. The Notion page is editable by BD/marketing, so even a correct clause there could be
   removed by someone editing prompt copy. The user-prompt copy is the durable one.

Both static fallbacks still got the clause, so the fallback path is not weaker than the
primary one.

### The sentinel trap is real and narrow

- Constant: `lib/lead-magnet/non-protocol.ts:153` — `NOT_A_PROTOCOL_SENTINEL = 'NOT_A_PROTOCOL:'`
- Server check on raw model output: `analyze/route.ts` inside `onFinish` —
  `text.trimStart().startsWith(NOT_A_PROTOCOL_SENTINEL)`. A false negative here means a
  "not a protocol" answer gets written to Notion + Blob + disk.
- The prompt rule it depends on: `system-prompt.ts:80-90` "First-character rule (no preamble,
  ever)".
- Client-side twin: `parseNotAProtocolSentinel` (`non-protocol.ts:156-161`), used by both
  lead-magnet heroes.

So the clause ends with an explicit restatement — answer starting with the H1 or the sentinel,
and *do not acknowledge this paragraph*. The sentinel code itself was not touched; confirmed
by diff.

### Break-out test

Ran against the real constants and helper extracted from the shipped file, with a payload that
embeds **both** markers plus an `IGNORE PREVIOUS INSTRUCTIONS` line:

```
marker occurrences in output -> head:1 foot:1   (exactly one of each)
opens with head? true      ends with foot? true
injected text still present as data? true
benign passthrough intact? true
```

The injected instruction survives as *content* — which is correct; the model should be able to
describe it. What it cannot do is escape the fence.

### Gate results

`pnpm lint` clean, `pnpm checkTs` green, `pnpm build` successful (1m47s).

## Changes During Work

Nothing outside the three files. The `# Verified signals (prefer these for classification)`
headings stay **outside** the fences, so that instruction is still ours and still applies.
