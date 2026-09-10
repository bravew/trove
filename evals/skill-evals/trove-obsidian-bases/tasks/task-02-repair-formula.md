# Task: Repair formulas without losing data

Repair this fragment in an existing Obsidian .base file.
Preserve its other views. Due can be absent; price can be zero.

```yaml
formulas:
  days_left: '(date(due) - today()).round(0)'
  price_label: 'if(price, price.toFixed(2), "Missing")'
views:
  - type: table
    name: Budget
    order: [file.name, formula.days_left, formula.price_label, formula.total]
```

The notes also contain quantity. Define total as price times quantity.
