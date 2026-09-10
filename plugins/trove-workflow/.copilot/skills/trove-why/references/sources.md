# trove-why: per-source query tips

## Contents
- Source control (git / gh)
- Linear
- Notion
- Slack
- Sentry
- Confidence calibration

## Source control (git / gh)

- `git log --follow -p <file>` for the line's history; `git blame` for the introducing commit, then read that commit's message and PR.
- `gh pr view <n>` and `gh pr list --search` for the discussion around a change. The PR body and review comments often hold the rationale the commit message omits.

## Linear (`Linear:list_issues`, `Linear:get_issue`)

- Search for the feature/area; open the specific issue to read the problem statement and decisions. Prefer one `get_issue` over listing everything.

## Notion (`Notion:search_pages`, `Notion:get_page`)

- Search for design docs / RFCs / postmortems by feature name; fetch the one page, don't dump the workspace.

## Slack (`Slack:search_messages`, `Slack:get_thread`)

- Search for the decision keyword; fetch the thread around a hit. Chat is where the real reasoning often lives, but it's noisy — quote the load-bearing message.

## Sentry (`Sentry:search_issues`, `Sentry:get_issue`)

- For regressions/postmortems: find the issue, read first-seen / regression markers and linked releases to tie a behavior change to a deploy.

## Confidence calibration

- **High**: a primary source states it directly (commit message, RFC, issue decision).
- **Medium**: consistent circumstantial evidence across two sources.
- **Low / inference**: reconstructed from code shape or a single ambiguous hit — label it as such.
- Don't launder a low-confidence inference into a confident statement in the summary.
