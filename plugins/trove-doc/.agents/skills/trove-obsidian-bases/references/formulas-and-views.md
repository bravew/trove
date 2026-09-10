# Bases formulas and views

Use the existing note property types to choose functions. This is a focused
reference; consult the installed app and official docs for less common methods.

## Common expressions

| Need | Expression |
| --- | --- |
| Current date or time | `today()`, `now()` |
| Parse a date | `date(due)` |
| Format a date | `file.ctime.format("YYYY-MM-DD")` |
| Age in days | `(now() - file.ctime).days` |
| Tomorrow | `today() + "1d"` |
| Check a folder | `file.inFolder("Projects")` |
| Check a tag | `file.hasTag("task")` |
| Test missing value | `price.isEmpty()` |
| Format a number | `price.toFixed(2)` |
| Check list membership | `authors.contains("Ada")` |
| Build a link | `link(file.path, "Open note")` |

Note properties can be qualified as `note.status`; computed properties use
`formula.status_label`. `file.name` includes the extension, while
`file.basename` omits it. Other useful file properties include `file.path`,
`file.folder`, `file.ext`, `file.ctime`, `file.mtime`, `file.tags`, and `file.links`.

```yaml
formulas:
  days_left: 'if(due, (date(due) - today()).days, "")'
  price_label: 'if(price.isEmpty(), "Missing", price.toFixed(2))'
  total: 'if(price.isEmpty() || quantity.isEmpty(), "", price * quantity)'
  status_label: 'if(status == "done", "Complete", "Open")'
```

Test formulas with a present value, an absent value, and meaningful zero or
false values. Fix data assumptions explicitly rather than silently populating
all notes with defaults.

## Filters and view configuration

```yaml
filters:
  and:
    - 'file.ext == "md"'
    - or:
        - 'file.hasTag("book")'
        - 'file.hasTag("article")'
    - not:
        - 'file.hasTag("archived")'
formulas:
  total: 'if(price.isEmpty() || quantity.isEmpty(), "", price * quantity)'
properties:
  formula.total:
    displayName: Total cost
views:
  - type: table
    name: Reading budget
    order: [file.name, author, price, quantity, formula.total]
    summaries:
      formula.total: Sum
  - type: cards
    name: Library
    order: [file.name, author, status]
```

`order` selects and orders visible properties; it is not a row-sorting rule.
Preserve existing app-generated sorting and view-specific options. Check the
installed version's syntax before introducing unfamiliar options.

Table summaries map properties to a summary name. Common numeric summaries
include `Sum`, `Average`, `Min`, and `Max`; booleans support `Checked` and
`Unchecked`. Custom summaries live under top-level `summaries` and operate on
`values`. Only summarize values of the expected type.

```yaml
summaries:
  rounded_average: 'values.mean().round(2)'
views:
  - type: table
    name: Prices
    order: [file.name, price]
    summaries:
      price: rounded_average
```

## Embedding context

Embed a base with `![[Tasks.base]]` or a named view with
`![[Tasks.base#Active tasks]]`. The `this` value depends on where the base is
displayed. In the main area it refers to the base file; embedded in a note it
refers to that note; in a sidebar it refers to the active main-area file.
Account for that context before adding filters based on `this`.

References: [Bases syntax](https://help.obsidian.md/bases/syntax),
[functions](https://help.obsidian.md/bases/functions),
[views](https://help.obsidian.md/bases/views).
