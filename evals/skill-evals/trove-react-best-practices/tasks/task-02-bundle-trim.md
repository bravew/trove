# Task: Trim bundle weight on a marketing page

A landing page imports `lodash`, `date-fns`, and a 200KB charting library at the top of the file. Only one chart renders below the fold and lodash is used in two helpers. Refactor imports for analyzable paths, defer the third-party chart, and replace barrel imports with direct paths. Quantify the expected bundle savings qualitatively.
