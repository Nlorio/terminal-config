---
name: save-learnings
description: Extract learnings from this conversation and append them to my personal CLAUDE.md
---

# Save Learnings to CLAUDE.md

Review the current conversation and extract valuable learnings, then append them to `~/.claude/CLAUDE.md`.

## Instructions

1. **Review the conversation** thoroughly. Identify any of the following worth preserving:
   - Codebase insights (how something works, where things live, API details, column names, dataset names)
   - Debugging lessons (gotchas, red herrings, root causes that were non-obvious)
   - Architecture decisions (trade-offs made, rationale for choosing an approach)
   - Frequently used commands (CLI invocations, query patterns)
   - Project-specific notes (quirks of a repo or service)
   - Anti-patterns to avoid (mistakes made, things that wasted time)
   - Coding style preferences discovered or reinforced

2. **Read the current CLAUDE.md** at `~/.claude/CLAUDE.md` to understand the existing structure and avoid duplicating content that's already there.

3. **Draft the learnings** for the user's review before writing anything. For each learning:
   - Identify which section it belongs in (Codebase Insights, Debugging Lessons, Architecture Decisions, etc.)
   - Use the format: a descriptive heading with date, followed by bullet points with bold labels
   - Include concrete details (exact names, paths, commands) - vague learnings are not useful
   - Today's date is available from the system context

4. **Present the draft** to the user and ask:
   - "Here are the learnings I extracted. Want me to add all of these, remove any, or adjust the wording?"

5. **After user approval**, use the Edit tool to append the new entries into the appropriate sections of `~/.claude/CLAUDE.md`. Place new entries:
   - Under the matching `###` subsection heading
   - After any existing entries but before any HTML comment placeholders
   - If a subsection only has a placeholder comment and no entries yet, place the new entry after the comment

6. **Confirm** what was added and where.

## Quality Bar

Skip anything that is:
- Too specific to be useful in future sessions (one-off values, temporary workarounds)
- Already documented in the project's own CLAUDE.md or README
- Common knowledge that doesn't need to be remembered

Prioritize things that:
- Took multiple attempts to figure out
- Were surprising or counter-intuitive
- Would save significant time if remembered next session
- Represent a pattern the user wants to follow consistently
