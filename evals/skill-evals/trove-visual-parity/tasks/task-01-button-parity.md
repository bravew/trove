Prompt: "Migrate the primary Button from the Vue app to React and confirm it looks identical."

Expected behavior: The assistant captures a baseline screenshot of the Vue button (in CI), builds the React version, and verifies parity with `toHaveScreenshot()` against that baseline within a tuned threshold — not by visually comparing screenshots by eye.
