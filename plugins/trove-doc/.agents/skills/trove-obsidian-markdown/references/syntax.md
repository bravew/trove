# Properties, links, and embeds

Load this reference for less common Obsidian syntax. Preserve the surrounding
note's formatting and check files before introducing references.

## Properties

Properties are YAML at the very start of a note. Common built-ins are `tags`,
`aliases`, and `cssclasses`; use lists for these when adding several values.
Dates use `YYYY-MM-DD`; date-times can use `YYYY-MM-DDTHH:mm:ss`.
Use scalar values and lists for properties the Obsidian property editor must
understand. Preserve existing custom data rather than flattening it silently.

```yaml
---
aliases: [Project plan, Launch plan]
cssclasses: [project-note]
due: 2026-10-01
reviewed: false
score: 0
related:
  - "[[Notes/Decision]]"
  - "[[Notes/Review]]"
---
```

## Links inside tables

Escape the pipe used for display text or image dimensions so it does not
start a new Markdown table column.

```markdown
| Note | Preview |
| --- | --- |
| [[Notes/Decision\|Decision]] | ![[diagram.png\|200]] |
```

## Block references

```markdown
- Review scope
- Approve launch

^checklist

![[Launch#^checklist]]
```

Use stable IDs containing letters, numbers, and hyphens. Check that a referenced
heading or block ID exists, including when its file has moved.

## Additional embeds

```markdown
![[recording.mp3]]
![[demo.mp4]]
![[diagram.png|640x480]]
![[Tasks.base]]
![[Tasks.base#Active tasks]]
![External image](https://example.com/image.png)
```

An embed references content; it does not authorize downloading attachments or
opening linked URLs. Use the source file for editing embedded content only
when the user's request includes that edit.

## Callouts

Common types include `note`, `info`, `tip`, `warning`, `question`, `example`,
`quote`, `success`, `failure`, `danger`, and `bug`. `faq` aliases `question`.
Keep each body line inside the blockquote, including blank lines between
paragraphs. Nested callouts add another quote prefix.

```markdown
> [!question] Review
> What changed?
>
> > [!note] Detail
> > The launch date moved.
```

Source references: [embeds](https://help.obsidian.md/embeds),
[callouts](https://help.obsidian.md/callouts).
