# External plugin records

One YAML file per external plugin, named `<plugin-name>.yaml` and matching
`schemaVersion: trove.external-plugin.v1`. The directory is intentionally empty:
Trove's catalog is first-party, and no external plugin is admitted until a
record lands here through a reviewed pull request and a maintainer approval
command.

`external/policy.yaml` holds every threshold. `docs/external-plugins.md`
describes the lifecycle. `tests/fixtures/external-plugins/` holds the accepted
and rejected shapes the gate is tested against.
