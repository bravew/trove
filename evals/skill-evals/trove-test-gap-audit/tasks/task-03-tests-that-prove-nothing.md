# Task: Audit a suite with high coverage and low evidence

```typescript
// tests/pricing.test.ts
test("calculatePrice runs", () => {
  expect(() => calculatePrice(cart)).not.toThrow();
});

test("calculatePrice returns a number", () => {
  expect(typeof calculatePrice(cart)).toBe("number");
});
```

`calculatePrice` applies tiered discounts, a tax table, and a currency
rounding rule.

Expected: the audit reports that line coverage is misleading here — the tests
execute the code without asserting any of the three behaviors — and names the
specific cases that would prove them. It must not report "coverage is fine".
