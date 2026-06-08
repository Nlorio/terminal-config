---
name: writing-my-pr-descriptions
description: Generate a PR description with an interactive interview for motivation, reasoning, and testing
---

## Step 1: Gather context silently

Run all of these to understand the changes:

```
cat .github/pull_request_template.md
```

Determine the base ref:
```
BASEREF=$(gh pr view --json baseRefName --jq '.baseRefName' 2>/dev/null || echo "main")
```

Then gather:
```
git diff --stat $BASEREF...HEAD
git log --oneline $BASEREF...HEAD
gh pr view --json title,body,url 2>/dev/null
```

If the branch name contains a task identifier like `TASK-####`, `SHARD-####`, `BUG-####`, etc., read the linked Notion task for additional context.

Do NOT show the user a list of changed files. Internalize the changes but keep your output focused on the interview.

## Step 2: Interview the user

Before writing anything, ask the user the following questions in a single message. Adapt based on what you already know from conversation context — skip questions you can already answer confidently.

**Questions to ask:**

1. **Why is this change being made?** What problem does it solve, or what goal does it advance? (e.g., a bug report, a product initiative, tech debt, compliance requirement)
2. **What approach did you take, and were there alternatives you considered?** Any tradeoffs worth calling out?
3. **How was this tested, or how do you plan to test it?**
   - Automated tests added/updated?
   - Manual testing performed? If so, what steps?
   - Any testing still TODO?
4. **Is this behind a feature gate?** If so, which one?
5. **Anything else reviewers should know?** (e.g., deploy considerations, follow-up work, risks)

Wait for the user's answers before proceeding.

## Step 3: Generate the PR description

Using the PR template from `.github/pull_request_template.md`, the git context from Step 1, and the user's answers from Step 2, generate the PR title and description.

**Title format:**
- Extract task identifier from branch name if present: `[TASK-####] ` or `[SHARD-####] ` etc.
- Use action words: Add, Fix, Update, Remove, Configure
- Be specific about what changed

**Description rules:**
- **Description section**: Lead with a high-level explanation of WHY this change exists (the motivation, not the mechanics). Then briefly summarize what the change does. Keep it concise — reviewers can read the diff for details.
- **DO NOT include a list of changed files or a file-by-file breakdown.** The diff already shows this. Focus on intent, reasoning, and anything non-obvious.
- **How was this change tested?**: Fill in based on the user's answers. Check the automated test box if tests were added/updated. Only fill manual testing if the user confirmed they did it. If testing is still planned, note it as TODO.
- **Is this feature gated?**: Fill in based on the user's answer. Delete the section if not applicable.
- **Screenshots**: Include a before/after table if there are UI changes. If manual testing is planned but not yet completed, add `🟡 Manual testing pending` to the section. Otherwise delete the section.

## Step 4: Update or create the PR

Show the generated title and description to the user for approval. Once approved:

If the PR already exists:
```
gh pr edit --title "$TITLE" --body "$BODY"
```

If no PR exists yet, create as a draft:
```
gh pr create --draft --title "$TITLE" --body "$BODY"
```
