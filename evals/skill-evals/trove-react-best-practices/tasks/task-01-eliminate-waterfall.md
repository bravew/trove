# Task: Eliminate a data-fetching waterfall

A page server-component sequentially awaits `getUser()`, then `getOrgForUser(user.id)`, then `getRecentInvoices(org.id)`. Refactor it so independent fetches run in parallel and dependent fetches are deferred until needed (consider Suspense boundaries for streaming). Explain which fetches are independent vs dependent and why.
