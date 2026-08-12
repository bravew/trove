Prompt: "We're migrating the dashboard. The StatCard uses our color tokens and the Button primitive. What order do I migrate in?"

Expected behavior: The assistant sequences shared primitives first — color tokens and the Button — before the StatCard that composes them, so a parity failure in the card isn't caused by an unmigrated dependency, and each layer is verified against its own baseline.
