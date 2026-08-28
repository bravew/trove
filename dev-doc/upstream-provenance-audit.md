# Upstream provenance audit

Reviewed on 2026-08-28 against repository commit `dcfade2`.

## Inventory

The canonical inventory contains 51 `skills/**/SKILL.md.tmpl` templates. The
`skills` section of `upstream.yaml` classifies every template directory exactly
once.

- 42 skills are recorded as original Trove work.
- Three skills are adapted from `vercel-labs/agent-skills`.
- Six principles are adapted from pstack.

The previous `spudex/pstack` comment did not provide a resolvable source. The
audit resolved the attribution to Lauren Tan's pstack distribution in
`cursor/plugins`, recorded its repository, full evidence revision, source path,
and MIT declaration, and replaces the ambiguous comment.

## Vendored React skills

The repository history does not prove the original import revision for any of
the three adapted React skills. This change therefore proposes an explicit
re-baseline at upstream commit
`063bee94c3f4df8453406c830b0a7df0f2860278`. The selected upstream trees are
locked by digest, deterministic transformations are declared in the manifest,
and the complete local divergence is stored in checked-in patch files.

The re-baseline does not change canonical skill content. Review of this change
is the maintainer approval gate for the new bases.

The `checked_sha` records the latest upstream revision inspected. A report-only
check may advance it without changing the accepted `base_sha`.

## License evidence

The three selected Vercel skill frontmatters declare `license: MIT`. The Vercel
repository had no top-level license file at the inspected revision. The pstack
plugin manifest declares MIT. `THIRD_PARTY.md` preserves both attributions.

This record preserves the evidence. Redistribution obligations and approval of
a re-baseline remain maintainer decisions.
