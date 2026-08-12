# Task: Fix a re-render storm

A `<Dashboard>` component re-renders all child cards on every keystroke in an unrelated search input. The cards take a `filters` object prop that's reconstructed inline. Diagnose the root cause, propose a fix using memoization and/or derived state (without adding `useMemo` everywhere), and explain when memoization would *not* help here.
