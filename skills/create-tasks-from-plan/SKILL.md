---
name: create-tasks-from-plan
description: Create Notion tasks from a plan document, one task per section, linked to a project
---

# Create Tasks from Plan

Given a Notion plan document URL and a project URL, create one task per PR/section in the Notion Tasks database and link them back to the plan.

## Inputs

The user should provide:
1. **Plan URL** — a Notion page URL containing a plan with numbered PRs/sections
2. **Project URL** — a Notion page URL for the project these tasks belong to

If not provided, ask the user for these before proceeding.

## Instructions

### 1. Fetch the plan document

Use `mcp__notion-dev__notion-fetch` to read the plan page. Identify each distinct PR or section that represents a unit of work (look for `### PR` headings, numbered sections, or similar structure).

### 2. Determine task status

For each section that references a GitHub PR:
- Use `gh pr view <number> --json state,mergedAt,isDraft` to check its status
- Map to Notion status: merged → `Completed`, open → `In Progress`, no PR yet → `To Do`

### 3. Get the current user

Use `mcp__notion-dev__notion-get-users` with `user_id: "self"` to get the assignee ID.

### 4. Draft tasks for review

Present the user with a table of planned tasks:

| # | Title | Status |
|---|-------|--------|

- Titles should be concise and action-oriented (Add, Register, Create, Migrate, Cleanup)
- Do NOT include PR number suffixes like "(PR 1a)" in titles
- Wait for user approval before creating

### 5. Create tasks

Use `mcp__notion-dev__notion-create-pages` with:
- **Parent:** `{"type": "data_source_id", "data_source_id": "c389f3d7-3b15-4629-8997-60ab11e4fc72"}` (Notion's Tasks database)
- **Properties:** `Title`, `Project` (relation to project URL), `Assignee` (current user), `Status`
- **Content:** Each task body should have:
  - `## Why` — 2-3 sentences explaining why this work matters, with a `**Ref:**` link to the plan page section
  - `**PR:**` link if a GitHub PR exists
  - `## Acceptance Criteria` — checklist of concrete deliverables derived from the plan section

### 6. Link tasks back to the plan

Use `mcp__notion-dev__notion-update-page` with `update_content` to add a block under each PR heading in the plan document containing:
- `**Task:** <mention-page url="..."/>`
- `**PR naming:** Include \`[TASK-{id}]\` prefix in the PR title when creating the PR for this task (where `{id}` is the short task ID from the Notion URL, e.g. `TASK-abc123`).`

### 7. Confirm

Present the user with links to all created tasks.

## Notes

- Valid status values for the Tasks database include: `In Progress`, `To Do`, `Completed`, `Backlog`, `Not Done`, `Blocked`, `Paused`, `New`
- The Tasks database data source ID is `c389f3d7-3b15-4629-8997-60ab11e4fc72`
- Always create all tasks in a single `mcp__notion-dev__notion-create-pages` call for efficiency
- **PR naming convention:** PRs created for a task should include `[TASK-{id}]` in the title (e.g. `[TASK-abc123] Add billing webhook handler`). The task ID is the short ID from the Notion task page URL.
