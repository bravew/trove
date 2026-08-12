# Security Policy

## Supported Versions

Trove ships a single rolling release (CalVer, `YYYY.M.D`). Only the latest
`stable` tag receives security fixes; there is no long-term support branch.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/bravew/trove/security) of this
   repository.
2. Click **Report a vulnerability**.
3. Describe the issue, affected version, and reproduction steps.

This opens a private advisory visible only to you and the maintainer, so the
issue can be triaged and fixed before any public disclosure.

If GitHub private reporting is unavailable to you, open a regular issue that
says only "possible security issue, please contact me" with no technical
detail, and the maintainer will follow up to arrange a private channel.

## What counts as a vulnerability here

Trove is a build-time tool that compiles Markdown skill/plugin sources into
platform-specific projections; it does not run a hosted service and does not
process user data at runtime. Relevant reports include (non-exhaustive):

- A generated skill/plugin projection that could execute untrusted code on
  install
- A build or validation script that reads/writes outside the intended
  project directory
- Secret-scanning bypass patterns in `trove-secret-scan`-style detectors that
  should be tightened
- Supply-chain issues in the dependency tree or CI workflows

## Disclosure

We aim to acknowledge reports within 5 business days and to ship a fix or
mitigation before public disclosure. Credit is given in the release notes
unless you ask to remain anonymous.
