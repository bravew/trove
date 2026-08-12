Prompt: "Checkout occasionally double-charges, but only in the full staging flow with the real Stripe sandbox and a 30-second webhook round-trip. Add TDD coverage."

Expected behavior: The assistant recognizes the test path is expensive and integration-heavy, declines to force a brittle E2E test, states why, and proposes a narrower seam (e.g. an idempotency-key unit test) or proceeds without a new test rather than writing a slow/flaky one.
