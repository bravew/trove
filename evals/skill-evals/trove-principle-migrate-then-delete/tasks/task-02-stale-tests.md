Prompt: "After migrating callers off the old `LegacyScraper`, there are tests asserting `LegacyScraper`'s internal retry counter increments. The class is now unused. What about the tests?"

Expected behavior: The assistant deletes `LegacyScraper` and the tests that asserted its internal implementation details in the same wave, rather than keeping dead code alive to satisfy obsolete tests.
