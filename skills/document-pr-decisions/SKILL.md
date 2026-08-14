---
name: document-pr-decisions
argument-hint: <branch name, PR number, or file path(s)>
description: Trace PR discussions and git blame to extract decisions, then add interface-level decision comments in the code
---

You are helping the user document code decisions by extracting reasoning from pull request discussions (descriptions, comments, review threads) and adding high-level interface comments in the affected code.

# Instructions

## 1. Parse Arguments and Determine Mode

The user will provide one of:
- **A PR number** (e.g., `#12345` or `12345`) or **branch name**: Use **Mode A** — analyze that PR directly
- **One or more file paths**: Use **Mode B** — run git blame to discover which PRs shaped those files
- **No argument**: Use **Mode A** defaulting to the current branch's PR

## 2A. Mode A: Current / Open PR

This is the primary use case — run as a final step before merging to document decisions from the review process.

### Fetch PR details

```bash
notion github get-pr-details --prNumber <number> --includeComments
```

Or if given a branch name or no argument:
```bash
notion github get-pr-details --branch <branch> --includeComments
```

Use `--limit` and `--cursor` flags to paginate if there are many review threads.

### Identify changed files

From the PR output, collect the list of files modified by the PR (the `files` array with `filename`, `status`, and `patch` fields). These are the files that may need decision comments.

Skip to **Step 3** (Decision Extraction) with this PR's data.

## 2B. Mode B: Historical / Git Blame

### Run git blame

For each file, run:
```bash
git blame --porcelain <file-path>
```

Parse the porcelain output to extract:
- Commit SHA (first 40 chars of each group header)
- `summary` line (the commit message)
- Line ranges each commit covers

Group lines by commit SHA and collapse into ranges (e.g., "lines 15-42").

### Discover PRs

For each unique commit, extract the PR number from the commit message using the `(#NNNNN)` pattern common in this codebase.

**Fallback** if no PR number in the message:
```bash
gh pr list --search "<full-SHA>" --state merged --json number,title --limit 1
```

Skip commits with no associated PR.

### Triage — ask the user which PRs to analyze

Present a summary ranked by line coverage:
- "Found N unique PRs that touched this file. The top contributors are:"
- "PR #X: 'title' (lines 1-50, 80-120)"
- "PR #Y: 'title' (lines 51-79)"
- "Which PRs should I analyze? [all / top N / specific numbers]"

Wait for the user's response. Do NOT fetch details for more than 5 PRs without user confirmation.

Then fetch details for the selected PRs:
```bash
notion github get-pr-details --prNumber <number> --includeComments
```

## 3. Decision Extraction

For each PR, analyze all collected information to identify **non-obvious decisions**:

**Sources** (in order of richness):
- **Resolved review threads** (`isResolved: true`) — often contain the deepest "why" discussions
- **PR body** — motivation, approach, alternatives considered
- **Unresolved threads** — may contain open questions worth flagging
- **General comments** — top-level discussion

**What to look for**:
- Why was this approach chosen? What alternatives were rejected?
- What constraints drove the design? (performance, backward compat, API contracts)
- What edge cases or gotchas were discussed?
- What tradeoffs were made?
- What future work was explicitly deferred?

**What to ignore**:
- Style nits, formatting, "LGTM" / acknowledgment comments
- Routine refactors with no design reasoning
- Decisions that are already obvious from reading the code itself
- Mechanical / boilerplate changes

## 4. Present Findings and Prompt the User

Before generating any comments, present a structured summary:

```
## Decisions Found

### PR #12345: "Add retry logic to payment processing"
**Files affected**: src/server/payments/processPayment.ts (lines 45-78)
**Key decisions**:
1. Exponential backoff chosen over fixed delay because [reason from PR]
2. Max retries set to 3 based on [discussion in review thread]

### Ambiguous / Needs Clarification
- PR #12345 had a discussion about caching strategy but the thread was inconclusive.
  Do you have context on what was decided?
```

Ask the user:
- "Are these decisions accurate? Should I adjust any?"
- "For the ambiguous items, can you provide additional context?"
- "Any decisions I missed that you remember from this PR?"

Wait for the user's response before proceeding.

## 5. Draft Comments

Generate interface-level comments based on the approved decisions.

**Placement** — comments go at interface boundaries ONLY:
- Before function/method definitions
- Before class/type/interface definitions
- At the top of a module (for module-level decisions)
- Before significant code blocks that implement a non-obvious design choice

**Format** — use TSDoc-style block comments:

```typescript
/**
 * Decision (PR #12345): Exponential backoff chosen over fixed delay for retry
 * logic because downstream payment APIs have variable recovery times. Fixed
 * delays caused cascading timeouts under load (see incident discussion in PR).
 */
function processPaymentWithRetry(...) {
```

**Rules**:
- Always include the PR number for traceability: `Decision (PR #NNNNN):`
- Explain WHY, not WHAT — the code already shows what it does
- Keep each decision to 1-3 lines
- Group multiple decisions from the same PR together
- Use past tense for historical decisions ("was chosen", "were rejected")
- Do NOT name individual reviewers in comments
- Do NOT add comments that merely restate the code

## 6. User Approval

Present the exact comments you plan to insert, showing for each:
- The file path
- The location where the comment will be placed
- The full text of the comment
- A few lines of surrounding code for context

Ask: "Here are the comments I propose to add. Please review — approve all, modify any, or skip any."

Do NOT insert any comments until the user explicitly approves.

## 7. Insertion

After approval, insert the comments:
- Read the current file content
- Insert comments at the approved locations
- Verify the file still looks correct after insertion

After all insertions, show a summary:
- Number of comments added and which files were modified
- Suggest reviewing with `git diff` before committing

# Important

- NEVER insert comments without explicit user approval
- NEVER reply to or interact with GitHub PR comments on behalf of the user
- NEVER add per-line inline comments — only interface-level block comments
- NEVER add comments that restate what the code does — only document WHY decisions were made
- NEVER fetch PR details for more than 5 PRs without user confirmation
- If `notion github get-pr-details` fails for a PR, note it and move on
- If a PR has few meaningful decisions (e.g., mostly mechanical changes), tell the user honestly rather than inventing commentary
