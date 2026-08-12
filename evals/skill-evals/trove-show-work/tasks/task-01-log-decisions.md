Prompt: "You're running an unattended migration overnight. Set up a decision trail and log the first three decisions: picking the migration order, choosing a characterization snapshot for the pin, and confirming the first component migrated cleanly."

Expected behavior: The assistant creates an append-only TSV decision log (one row per decision with ts/phase/decision/why/evidence/result) using the helper, with each row's evidence pointing at a concrete artifact rather than narrating the run in prose.
