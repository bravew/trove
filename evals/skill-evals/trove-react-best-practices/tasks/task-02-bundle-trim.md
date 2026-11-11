# Task: Trim bundle weight on a marketing page

A landing page imports `lodash`, `date-fns`, and a 200KB charting library at the top of the file. Only one chart renders below the fold and lodash is used in two helpers. Refactor imports for analyzable paths, defer the third-party chart, and replace barrel imports with direct paths. Quantify the expected bundle savings qualitatively.

This is a fictional Next.js App Router fixture. Review the whole page, not only the imports.

`app/page.tsx`:

```text
1  import _ from 'lodash';
2  import { format } from 'date-fns';
3  import { getHero, getPricing } from '@/lib/cms';
4  import UsageChart from '@/components/UsageChart';
5  export default async function Page() {
6    const hero = await getHero();
7    const pricing = await getPricing();
8    const plans = _.sortBy(pricing.plans, 'price');
9    return (<main>
10     <h1>{hero.title}</h1>
11     <p>Updated {format(pricing.updatedAt, 'PP')}</p>
12     <Plans plans={plans} />
13     <UsageChart since={new Date(pricing.updatedAt)} />
14   </main>);
15 }
```

`components/UsageChart.tsx`:

```text
1  'use client';
2  import { Chart } from 'big-chart-lib';
3  import { useScrollY } from '@/lib/scroll';
4  export default function UsageChart({ since }: { since: Date }) {
5    const y = useScrollY();
6    return <Chart options={{ animate: true, from: since }} visible={y > 900} />;
7  }
```

`getHero()` and `getPricing()` read different CMS entries; neither needs the other's result. `useScrollY` updates state on every scroll event.
