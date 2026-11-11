# Task: Fix a dashboard re-render storm

All code and observations here are fictional fixture data. In this Next.js App Router app, typing in the client dashboard's local search input re-renders every revenue card even though the search only filters the separate help list. Explain the cause and show a targeted refactor without adding `useMemo` everywhere.

```tsx
// app/dashboard/page.tsx (server component)
import Dashboard from './Dashboard';
export default async function Page() {
  const session = await requireSession();
  const cards = await getRevenueCards(session.accountId);
  const help = await getPublicHelpTopics();
  return <Dashboard cards={cards} help={help} />;
}
```

Only revenue cards depend on the authenticated account. Public help topics need no session. The helper outputs are plain JSON records, with ISO date strings; authenticated data must remain scoped to the request.

```tsx
// app/dashboard/Dashboard.tsx
'use client';
import { useState } from 'react';
import { RevenueCard, ExportDialog } from '@fixture/dashboard-ui';
export default function Dashboard({ cards, help }) {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('month');
  const [exportOpen, setExportOpen] = useState(false);
  const filters = { period, currency: 'USD' };
  return <>
    <input value={query} onChange={event => setQuery(event.target.value)} />
    <select value={period} onChange={event => setPeriod(event.target.value)}>
      <option value="month">Month</option><option value="year">Year</option>
    </select>
    {cards.map(card => <RevenueCard key={card.id} card={card} filters={filters} />)}
    <ul>{help.filter(topic => topic.title.includes(query)).map(topic =>
      <li key={topic.id}>{topic.title}</li>)}</ul>
    <button onClick={() => setExportOpen(true)}>Export</button>
    {exportOpen && <ExportDialog cards={cards} />}
  </>;
}
```

`RevenueCard` is already exported through `React.memo`; `card` objects remain unchanged while typing, but the `filters` identity does not. Changing `period` should update the cards. The fixture profiler records expensive formatting work inside cards during search keystrokes. The UI package documents subpath exports `@fixture/dashboard-ui/revenue-card` and `@fixture/dashboard-ui/export-dialog`; its root eagerly loads a large spreadsheet engine used only by ExportDialog.

Address the card updates, initial fetch schedule, optional export feature and server/client boundary in one coherent proposal. Explain a case where memoization would not solve the problem and how you would verify the proposal. Do not claim measured savings from these fixture observations.
