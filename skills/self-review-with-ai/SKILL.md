---
name: self-review-with-ai
argument-hint: [branch name or PR number]
description: Review my own self-review comments on a PR and have Claude reply with context, explanations, and next steps
---

You are helping the user process their own self-review comments on a GitHub pull request. The user leaves review comments on their own PRs as notes, questions, and reminders during self-review. Your job is to read the code, understand each comment, and draft a thoughtful reply for each thread — providing context, answering questions, explaining design decisions, or noting follow-up work.

This is NOT about responding to external reviewer feedback. This is about the user reviewing their own PR with Claude's help — using Claude to think through their own notes and leave a record of the reasoning.

# Instructions

1. **Fetch PR Details and Comments**

   - If the user provided a branch name, run `notion github get-pr-details --branch <branch-name> --includeComments`
   - If the user provided a PR number, run `notion github get-pr-details --prNumber <pr-number> --includeComments`
   - If no argument was provided, run `notion github get-pr-details --includeComments` (defaults to current branch)
   - Use pagination (`--limit` and `--cursor` flags) if there are many review threads

2. **Identify Unresolved Self-Review Items**

   **Review threads** (inline code comments):
   - Filter to threads where `isResolved: false`
   - For each thread, note:
     - Thread ID (`PRRT_...`)
     - File path and line number
     - Comment body
     - Comment author (should be the user themselves)

   **Top-level PR comments** (from the `comments` array):
   - Filter to comments authored by the PR author (the user)
   - For each self-authored comment, note:
     - Comment body
     - Whether it contains a question, concern, or reminder

3. **Read Referenced Code and Understand Context**

   - For each unresolved thread, read the referenced file around the commented line
   - Also read related files (callers, callees, tests, type definitions) to build full context
   - Understand the PR's overall intent from the diff and commit history

4. **Draft Replies**

   - For each thread, draft a reply that addresses the self-review note:
     - **Questions** ("Why does X?") → Explain the reasoning based on the code
     - **Concerns** ("This still relies on X") → Acknowledge and suggest a path forward (TODO, follow-up PR, or inline fix)
     - **Reminders** ("Don't forget to...") → Confirm whether it's been handled or note what's left
   - Present ALL threads to the user with your proposed reply for each:
     - The file, line, and original comment
     - Your drafted reply
   - Ask the user to confirm, edit, or skip any replies before posting

5. **Post Individual Replies**

   - For each approved reply, post it as an individual thread reply using the GitHub GraphQL API:
     ```
     gh api graphql -f query='
     mutation {
       addPullRequestReviewThreadReply(input: {
         pullRequestReviewThreadId: "<THREAD_ID>",
         body: "<REPLY_BODY>\n\n_-- beep-boop_"
       }) {
         comment { id }
       }
     }'
     ```
   - For top-level PR comments (not part of review threads), reply using:
     ```
     gh api repos/{owner}/{repo}/issues/{pr_number}/comments -f body="<REPLY_BODY>\n\n_-- beep-boop_"
     ```
   - Every reply MUST end with `\n\n_-- beep-boop_` to indicate it was authored by AI
   - Post replies in parallel when possible for efficiency

6. **Apply Code Changes (if requested)**

   - If the user asks to add TODO comments, code fixes, or other modifications alongside the replies, make those changes too
   - Commit code changes separately from posting replies

7. **Summary**

   - Report how many threads were replied to
   - List any threads that were skipped and why

# Important

- NEVER post replies without user approval of the drafted text
- Always sign replies with `_-- beep-boop_`
- Reply to each thread INDIVIDUALLY — do not post a single bulk comment covering multiple threads
- Use `addPullRequestReviewThreadReply` GraphQL mutation (NOT `addPullRequestReviewComment`)
- Do NOT resolve threads unless the user explicitly asks you to
