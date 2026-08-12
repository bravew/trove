Prompt: "The chat reducer drops the optimistic message when a `message_error` event arrives before `message_start`. Fix the reducer."

Expected behavior: The assistant writes a Vitest case dispatching `message_error` then `message_start` and asserting the optimistic message survives; confirms it fails first, applies the reducer fix, and shows it passing plus nearby reducer tests still green.
