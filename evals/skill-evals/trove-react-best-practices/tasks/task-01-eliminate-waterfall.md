# Task: Eliminate a data-fetching waterfall

This is a fictional Next.js App Router fixture using React 19. The `/billing` page is slow and also ships more JavaScript than expected. Refactor the supplied server and client code, explaining dependency boundaries and which changes matter most.

```tsx
// app/billing/page.tsx (server component)
import BillingPanel from './BillingPanel';
export default async function Page() {
  const user = await getUser();
  const org = await getOrgForUser(user.id);
  const invoices = await getRecentInvoices(org.id);
  const currencies = await getCurrencyTable();
  const serviceStatus = await getServiceStatus();
  return <BillingPanel invoices={invoices} currencies={currencies}
    status={serviceStatus} generatedAt={new Date()} />;
}
```

`getUser` is request-authenticated. The organization requires that user's ID, and invoices require the organization ID. The currency table and public service status need no user or organization data and are independent of one another. Currency lookup is needed for invoice display, but service status may appear later. `getRecentInvoices` returns objects with `id`, `totalMinor`, and a `Date` instance `issuedAt`. There is no permission to share authenticated results between requests.

```tsx
// app/billing/BillingPanel.tsx
'use client';
import { InvoiceTable, InvoicePdfPreview } from '@fixture/billing-ui';
import { useEffect, useState } from 'react';
export default function BillingPanel({ invoices, currencies, status, generatedAt }) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(invoices);
  const [showPdf, setShowPdf] = useState(false);
  useEffect(() => {
    setVisible(invoices.filter(invoice => invoice.id.includes(query)));
  }, [invoices, query]);
  return <>
    <input value={query} onChange={event => setQuery(event.target.value)} />
    <InvoiceTable rows={visible} currencies={currencies} />
    <button onClick={() => setShowPdf(true)}>Preview PDF</button>
    {showPdf && <InvoicePdfPreview invoices={invoices} />}
    <p>{status.label} / {generatedAt.toISOString()}</p>
  </>;
}
```

The fictional UI package offers documented exports `@fixture/billing-ui/invoice-table` and `@fixture/billing-ui/invoice-pdf-preview`. The root export also imports the PDF engine at module load; the preview is rarely opened. The table formats every row on each render. Address the initial load and search behavior without weakening authorization or moving server-only helpers into client code. Show a coherent refactor, including the data passed across the boundary, and distinguish expected improvements from measurements you have not run.
