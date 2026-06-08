---
name: lint-and-fix-all
description: Run typecheck and eslint, then actively resolve all errors.
---

# Lint, Typecheck, and Fix All Errors

Run eslint and typecheck on the current branch, then iteratively fix all errors until the codebase is clean. Uses fast incremental checks during the fix loop and a full typecheck only as a final gate.

## Instructions

1. **Get the list of changed files** on this branch:

   ```bash
   git diff --name-only main...HEAD
   ```

   Also include any uncommitted changes:

   ```bash
   git diff --name-only HEAD
   ```

   Combine into a deduplicated list of `.ts` and `.tsx` files.

2. **Run eslint with autofixes** on all changed files in the branch:

   ```bash
   notion eslint --branch --fix
   ```

   This auto-fixes what it can. Capture any remaining lint errors.

3. **Get type diagnostics incrementally** using the typescript-lsp MCP. For each changed file (or in batch), call `mcp__typescript-lsp__get_diagnostics` to get type errors. This is much faster than a full typecheck and gives you immediate, targeted feedback.

4. **Triage remaining errors**. Combine the outputs and group errors by:
   - File path
   - Error type (type error vs lint error)
   - Whether they're likely related (e.g., a type change causing downstream errors)

5. **Fix errors iteratively**, starting with root causes:
   - Fix type errors before lint errors (type changes often resolve downstream lint issues)
   - Fix errors in shared/utility files before consumer files
   - For type errors, use the `type-error-fixer` agent when the fix isn't straightforward
   - For lint errors that weren't auto-fixed, read the file, understand the violation, and apply the correct fix
   - **Never** use `eslint-disable`, `any`, `as` casts, `@ts-expect-error`, or other suppressions to "fix" errors

6. **Use fast feedback loops** while fixing. After each batch of fixes:
   - Re-check affected files with `mcp__typescript-lsp__get_diagnostics` (fast, incremental)
   - Re-run `notion eslint --fix` on just the files you edited (fast, targeted)
   - Do NOT run `notion typecheck --go` during the fix loop

7. **Final verification** - only once all LSP diagnostics and eslint are clean, run the full typecheck as a gate:

   ```bash
   notion typecheck --go
   ```

   If this surfaces additional errors in files you didn't check (e.g., downstream consumers), fix those using the same incremental approach (steps 5-6), then re-run the full typecheck.

8. **Report results**:
   - Summarize what was fixed and how
   - If any errors could not be resolved without user input, list them clearly with context about why and what options exist
