# Project instructions

## Project context

- `frontier-attempt-3` is a public, MIT-licensed project in its initial setup phase.
- No application code, runtime, package manager, build system, or test suite has been selected yet.
- Sign in with ChatGPT is a future option only. Do not implement authentication or add authentication dependencies unless requested.
- See the README for the official OpenAI documentation to revisit when that feature is requested. Public repository visibility alone does not configure or enable sign-in.

## Checks

- Run `git diff --check` for changes and `git diff --cached --check` before committing.
- There are currently no build or test commands. Add verified commands here when the application stack is introduced.
- Review documentation for accuracy and avoid describing planned features as available.

## Commit and push rules

- After each completed change, run appropriate checks, commit only the files changed for that task, and push to the configured GitHub upstream without waiting for a separate request.
- Before editing, record staged, unstaged, and untracked files. Files with pre-existing changes are off limits: do not edit, stage, commit, revert, stash, or otherwise alter them unless the user explicitly authorizes those files. Ask if the task depends on such a file.
- Stage explicit paths only; never use `git add .`, `git add -A`, or other blanket staging.
- Inspect the staged diff and commit contents. Preserve unrelated staged changes and use a path-scoped commit when needed to exclude them.
- Never force-push or rewrite existing commits. If a push would include unrelated unpushed commits, ask before publishing those commits.
- Outside `/init`, report a missing repository, GitHub remote, upstream, or authentication as a blocker rather than guessing or creating a destination.
- Report the commit and push result, including any failure, in the final response.
