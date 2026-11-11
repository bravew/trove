# Task: Write up a measured N+1 change

"I added a selectinload to kill the N+1 on the posts query. Write up the result."

All paths and numbers below are synthetic scenario data for a fictional SQLAlchemy endpoint. They are supplied evidence for the exercise, not real benchmark measurements and not commands you ran. Label the result as a fixture comparison.

The harness `fixtures/perf/posts/bench.py` makes fifty sequential requests to `GET /posts?limit=100` after five warmups against the same seeded local database (100 posts, each with an author). SQL logging and response timing are enabled. The response must preserve post order and the author name on every row. The harness saves results using `python fixtures/perf/posts/bench.py --seed fixed-100 --warmups 5 --runs 50 --out PATH`.

Baseline artifact `fixtures/perf/posts/before.json` was saved before editing the query:

```json
{
  "revision": "posts-v1",
  "seed": "fixed-100",
  "runs": 50,
  "medianMs": 240,
  "p95Ms": 300,
  "queriesPerRequest": 101,
  "medianSqlMs": 210,
  "trace": "1 posts SELECT followed by 100 author SELECTs during serialization"
}
```

The reviewed patch changes only the load strategy on the endpoint's query from `select(Post).order_by(Post.id).limit(100)` to the same statement with `.options(selectinload(Post.author))`. No indexes, pagination behavior or serialization code changed. After rerunning the same harness and environment, `fixtures/perf/posts/after.json` contains:

```json
{
  "revision": "posts-v2-selectinload",
  "seed": "fixed-100",
  "runs": 50,
  "medianMs": 70,
  "p95Ms": 90,
  "queriesPerRequest": 2,
  "medianSqlMs": 40,
  "responsesEqual": true
}
```

Write a concise result with the supported deltas and trace evidence. State the limits of this local fixture and what the artifacts do not establish. Do not invent production measurements or describe the supplied artifacts as files you personally created.
