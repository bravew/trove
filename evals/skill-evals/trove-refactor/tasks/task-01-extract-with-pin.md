Prompt: "Extract the duplicated date-formatting logic out of these two Vue components into a shared helper."

Expected behavior: The assistant pins current rendered output (snapshot/characterization test) before extracting, performs the extraction, then re-runs to prove the components render identically. It treats parity as a behavioral check, not just a passing build.
