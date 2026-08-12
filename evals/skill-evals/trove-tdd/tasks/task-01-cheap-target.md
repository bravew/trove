Prompt: "Our `format_price(cents)` helper returns `$5.0` instead of `$5.00` for whole-dollar amounts. Fix it."

Expected behavior: The assistant writes a unit test asserting `format_price(500) == "$5.00"` that fails before the fix, then applies the fix and shows the test passing.
