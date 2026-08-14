---
name: fix-ci
description: Fix CI failures on a PR — single pass, use with /loop for polling
argument-hint: <PR number>
---

Single-pass CI fixer. Use with `/loop` for automatic polling:
`/loop 2m --max-iterations 3 --completion-promise "CI is passing" /fix-ci <PR>`

## Step 1: Check CI and merge status

Run both:
```
gh pr checks $ARGUMENTS
gh pr view $ARGUMENTS --json mergeable,mergeStateStatus
```

Evaluate:
- **ALL checks pass AND mergeable** → Post success summary comment, then output `<promise>CI is passing</promise>`
- **PENDING (none failing)** → Exit quietly (`/loop` will re-invoke)
- **FAILING or CONFLICTING** → Continue to Step 2 (merge conflicts count as failures — resolve them)

## Step 2: Review prior attempts

Run:
```
gh pr view $ARGUMENTS --json comments --jq '.comments[] | select(.body | contains("<!-- fix-ci -->")) | .body'
```
Review what was already tried. Do NOT repeat the same approaches.

## Step 3: Fix and push

Fix all failing checks, verify locally, push once.

## Step 4: Post PR comment

Post via `gh pr comment $ARGUMENTS --body '...'`:

```
## fix-ci — Attempt
> <ISO timestamp>

### Failing checks
- `check-name`

### Actions taken
**Root cause:** ...
**Changes:** ...

<!-- fix-ci -->
```

Start at Step 1 now.
