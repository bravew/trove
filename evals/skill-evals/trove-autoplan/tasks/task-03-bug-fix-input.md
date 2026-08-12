# Task: Wrong-tool input

Idea: 'Fix the off-by-one in pagination.' This is a bug fix, not a new feature. Autoplan should recognize that and decline to run the full spec→story→release pipeline; it should hand off to trove-commit + trove-review instead.
