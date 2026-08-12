# Contributing to Trove

Thanks for considering a contribution. This file is the quick-start; the full
guide — scaffolding, naming conventions, the eval gate, and the release
process — lives in [docs/contributing.md](docs/contributing.md).

## Quick start

```bash
git clone https://github.com/bravew/trove.git
cd trove
bun install
bun run build
bun run validate
bun test
```

You need [Bun](https://bun.sh/) ≥ 1.0.

## Before opening a PR

- `bun run build && bun run validate` passes.
- `bun test` passes.
- New or changed skills follow the naming and structure conventions in
  [docs/skill-authoring.md](docs/skill-authoring.md) and
  [docs/plugin-authoring.md](docs/plugin-authoring.md).
- No secrets, credentials, or private endpoints in any file — the validator
  scans for common patterns, but review your own diff too.

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/bravew/trove/issues). For open-ended
questions or ideas, use
[GitHub Discussions](https://github.com/bravew/trove/discussions).

## Security issues

Do not open a public issue for a security vulnerability — see
[SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
