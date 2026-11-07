---
name: weekly-report
description: Draft my weekly report from GitHub for Discord - what I shipped, what waits for review, what I reviewed, commented on or approved, and the issues I opened - with every PR and issue as a masked link. Use for "weekly report", "lấy task weekly report", "báo cáo tuần", or a report for a given week or date range.
---

# Weekly report

The report goes to Discord, in English. It covers my own work and the review work on other
people's PRs (reviews, comments, approvals, commits I pushed to their branches).

## 1. Window and scope

- Default window: Monday of the current week to today. If today is Monday, or the user names a
  week or range, use that instead. Say the window in the reply.
- Orgs: `gosodax` and `icon-project`. Leave out my personal repos (`0x0603/*`, e.g.
  `sodax-ai-work-context`, `claude-team-ui`); they are tooling, not team work. Say so in one line.
- GitHub only. Discord, Slack and calls are not in it; say so in one line.

## 2. Collect

Work in the scratchpad. `S` is the window start (`YYYY-MM-DD`).

The events feed is the source of truth for what I did and when (reviews with their state,
comments, pushes, merges, issues opened, closed, assigned). It holds the last 300 events, about
90 days, which covers a week:

```bash
gh api --paginate "users/0x0603/events?per_page=100" > events.json
jq -rs --arg s "$S" 'add | .[] | select(.created_at >= $s) |
 if .type=="PullRequestReviewEvent" then "\(.created_at[:10]) REVIEW \(.payload.review.state) \(.repo.name)#\(.payload.pull_request.number)"
 elif .type=="PullRequestEvent" then "\(.created_at[:10]) PR \(.payload.action) \(.repo.name)#\(.payload.pull_request.number)"
 elif .type=="IssuesEvent" then "\(.created_at[:10]) ISSUE \(.payload.action) \(.repo.name)#\(.payload.issue.number) \(.payload.issue.title)"
 elif .type=="IssueCommentEvent" then "\(.created_at[:10]) COMMENT \(.repo.name)#\(.payload.issue.number) pr=\(.payload.issue.pull_request != null)"
 elif .type=="PullRequestReviewCommentEvent" then "\(.created_at[:10]) RCOMMENT \(.repo.name)#\(.payload.pull_request.number)"
 elif .type=="PushEvent" then "\(.created_at[:10]) PUSH \(.repo.name) \(.payload.ref)"
 else empty end' events.json | sort | uniq -c
```

Cross-check with search, so nothing the feed dropped is missed. `--updated` only says the item
moved this week, not that I did something: keep an item only when the feed, its commits or its
comments show my action inside the window.

```bash
for q in "prs --author=@me" "prs --reviewed-by=@me" "prs --commenter=@me" "prs --assignee=@me" \
         "issues --author=@me" "issues --commenter=@me" "issues --assignee=@me"; do
  gh search $q --updated=">=$S" --owner gosodax --owner icon-project --limit 100 \
    --json repository,number,title,state,updatedAt
done
```

For every PR left, get what the report needs:

```bash
gh api repos/$R/pulls/$N --jq '{author: .user.login, state, merged, merged_by: .merged_by.login, draft, created_at, merged_at}'
gh pr view $N -R $R --json headRefName,baseRefName,reviewDecision,reviews
```

- A push to a branch whose PR someone else opened means I co-develop it: list my commits in the
  window (`gh api repos/$R/pulls/$N/commits`, filter on date and author) and sum them up.
- For a review or comment worth more than "approved", read my comments in the window
  (`gh api "repos/$R/issues/$N/comments?since=${S}T00:00:00Z"`, plus review comments) to say what
  I raised in a few words. Bot pings ("@x-worker do PR review") are not review content.

## 3. Sort into sections

In this order, leaving out empty ones:

- **Shipped**: my PRs merged in the window. Add the issue each one closed.
- **In review**: my open, non-draft PRs that wait for review, and others' PRs I co-develop. Say
  where each stands ("Waiting for re-review", "Review requested again"). Group a stacked set of
  PRs under one bullet with its parent issue.
- **In progress**: my draft PRs, and work with no PR yet.
- **Code review**: other people's PRs I reviewed, commented on or approved in the window. End each
  bullet with the outcome: `approved`, `commented, approved`, `N inline comments, approved`,
  `N review comments`, `requested changes`, `tested, approved`, `pushed a fix ..., approved`,
  `approved and merged`. Replies on my own PRs are not code review.
- **New issues and planning**: issues I opened in the window that are still open. Group a parent
  with its sub-issues on one bullet. Issues already closed by a Shipped PR are not repeated.

## 4. Write

- English, plain and short. One bullet per item: the link, then what it does or where it stands
  in my own words. Do not paste the PR title as is when it reads as jargon.
- **Every PR and issue is a Discord masked link with the embed suppressed:**
  `[sodax-sdks#590](<https://github.com/gosodax/sodax-sdks/pull/590>)`. The text is
  `repo#N` (no owner) the first time a repo appears in a bullet, then `#N` for more refs in that
  bullet. Use `/pull/` for PRs and `/issues/` for issues. The `<>` stops Discord from unfurling a
  card for every link.
- Bold section titles (`**Shipped**`), `- ` bullets, a blank line between sections. Title:
  `**Weekly report, <Mon d>–<Mon d>**` with the days that had activity.
- No counts I did not check, no em dashes, no AI flourishes.

## 5. Deliver

1. Write the report to `<scratchpad>/weekly-report-<window start>.md` and copy it with
   `pbcopy < <file>`.
2. Print the whole report in the reply inside a fenced code block. The terminal renders a masked
   link as plain text and hides the URL, so a rendered copy would lose the links.
3. Give its length (`wc -c`). Discord allows 2000 characters per message without Nitro and 4000
   with it. If it is over 2000, offer to split it at section boundaries into messages of at most
   2000 characters each (split a long section between bullets, title the rest `(cont.)`). Write
   each message to `<scratchpad>/discord/<n>.md` and give one `! pbcopy < <path>` per message.
4. Reply to the user in Vietnamese; the report itself stays English.
