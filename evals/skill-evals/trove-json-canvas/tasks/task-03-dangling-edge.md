# Task: Diagnose invalid canvas data

Review this .canvas without editing it. Explain why an edge cannot render.

```json
{
  "nodes": [{"id":"alpha","type":"text","x":0,"y":0,"width":300,"height":160,"text":"Alpha"}],
  "edges": [{"id":"edge-a","fromNode":"alpha","toNode":"missing","toSide":"middle"}]
}
```

Do not invent a replacement target. The UI is not available.
