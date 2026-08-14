---
name: save-learnings
description: Extracts durable learnings from the current conversation and appends them to the user's personal ~/.claude/CLAUDE.md. Use when the user asks to save learnings, or wants end-of-session takeaways preserved.
---

# Save Learnings to CLAUDE.md

Extract durable learnings from the current conversation and append them to `~/.claude/CLAUDE.md`, so future sessions start with hard-won context instead of rediscovering it.

## What to capture

Worth keeping:

- Codebase insights (how something works, where things live, API details, column/dataset names)
- Debugging lessons (gotchas, red herrings, non-obvious root causes)
- Architecture decisions and the trade-offs behind them
- Frequently used commands (CLI invocations, query patterns)
- Project quirks and anti-patterns that wasted time
- Coding style preferences discovered or reinforced

Skip one-off values, anything already in the repo's own CLAUDE.md or README, and general knowledge. Prioritize what took multiple attempts, was surprising, or is a pattern the user wants followed consistently.

## How to save

Read `~/.claude/CLAUDE.md` first to match its section structure and avoid duplicating what's already there.

Draft the entries and get the user's sign-off before writing — this file shapes every future session, so it shouldn't change without consent. For each entry, name the section it belongs in (Codebase Insights, Debugging Lessons, Architecture Decisions, …) and include concrete specifics (exact names, paths, commands); vague learnings aren't useful.

On approval, append each entry under its matching `###` subsection — after existing entries, and after the placeholder comment if the subsection is otherwise empty. Then report what landed where.

## Entry format

Match the existing house style: a dated `####` heading, then bold-label bullets. Convert relative dates ("today") to absolute using the system context.

```
#### Stripe rate-limit retry logic (2026-03-27)
- **Where:** `rateLimitRetry` in `src/server/helpers/subscriptions/stripeApiHelpers.ts`
- **Default:** 3 retries at 1s/5s/10s + 2s jitter; auditor schedule uses 8 retries up to 30s
```
