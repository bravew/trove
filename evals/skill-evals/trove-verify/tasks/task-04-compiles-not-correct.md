Prompt: "I changed the timezone conversion in the report builder and the TypeScript build passes, so it's done."

Expected behavior: The assistant declines to treat a passing build as verification of behavior; it runs or asks to run the actual report output against a known input/expected value (the real artifact), and names the timezone-conversion result as the thing that must be checked, not the compile.
