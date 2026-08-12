Prompt: "Checkout error rate jumped last Tuesday. Why? We have Sentry and Slack connected."

Expected behavior: The assistant ties the behavior change to a deploy/release via Sentry (first-seen / regression markers) and finds the relevant Slack discussion, citing both. It presents the most-supported explanation and any competing hypotheses, with a coverage map of what was checked.
