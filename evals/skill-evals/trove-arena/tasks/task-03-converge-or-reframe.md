# Task: Run a caching design arena and decide whether to converge

This is a fictional staged exercise, not an instruction to launch real agents. Start before fanout: describe the coordinator's preparation and the separate briefs and output locations you would give three candidates. Then advance to the supplied candidate returns and make the design decision. Keep coordinator-only evaluation material separate from candidate briefs.

The problem is a new cross-region cache for a collaborative editor's entitlement lookups. A bad cached entitlement could admit an expired member. There is no existing cache design to copy, and changing the invalidation protocol after clients adopt it will be expensive. Reads dominate writes. The product owner has not yet answered whether a revoked member may retain access for up to thirty seconds or must lose access immediately. We can measure lookup latency, stale grants during revocation, recovery from lost events, and operating complexity in a local simulator. The candidate workspace starts at the same fixture revision `cache-fixture-v1`.

After your preparation, suppose these fictional returns arrive:

- Candidate A: read-through cache with a thirty-second TTL and per-key request coalescing. Simulator cases cover cold and warm lookups. A revocation can remain cached until expiry.
- Candidate B: independently chose read-through with the same TTL, adding jitter to avoid synchronized expiry. Its revocation semantics match A. Its prototype adds an extra background worker for warming rarely read keys.
- Candidate C: event-driven invalidation with an outbox sequence number and replay after reconnect. It fails closed when a sequence gap is detected. Its prototype has more moving pieces; it has a useful lost-event test that A and B lack.

How do you compare the returns, choose a base if the evidence supports one, and deal with the unresolved revocation requirement? Explain what you would carry across from the other attempts, what you would reject and why, and how you would validate the resulting design. Also say whether a follow-up request to rename the cache class would justify another arena.
