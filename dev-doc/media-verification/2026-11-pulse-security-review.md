# CP4 pulse security review

Reviewed 2026-11-10 against HEAD `261a436`, including the uncommitted working tree and untracked modules. This was a static source review. No imported scripts were executed, and no network, publishing, commits, or code changes were made. User configuration and secret stores were not opened.

## Scope and coverage

Reviewed:

- `upstream.yaml` selection and `not_vendored` notes for both pulse artifacts.
- `upstream-patches/trove-pulse/local.patch` and `upstream-patches/trove-pulse-cn/local.patch`.
- All untracked pulse modules: `bounded_get.py`, `cookie_paths.py`, `devto.py`, `fetch_memo.py`, `grok_audit.py`, `meta_ads.py`, `private_files.py`, `reddit_search.py`, `sqlite_snapshot.py`, `usage.py`, `windows_job.py`, `x_api.py`, `x_envelope.py`, and `x_lane_parity.py`.
- All untracked pulse-cn modules: `github.py`, `hackernews.py`, `hot_board.py`, `hot_board.js`, `hot_board.css`, `pipeline.py`, `reddit.py`, `sources.py`, `trending.py`, `upstream_bridge.py`, and `websearch.py`.
- Security-sensitive changed modules: cookie extraction and persistence, environment loading, HTTP transports, crawler login, output writers, Grok invocation, and saved-report publishing.

The remaining changed modules were inventoried by diff but not line-reviewed. Their absence from the findings is not a safety claim. Generated plugin copies were checked only for the excluded module names and the hot-board PNG dependency.

## Findings

### Medium

- [skills/research/trove-pulse-cn/scripts/lib/env.py:125](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/env.py:125) [CWE-427] A repository-controlled `.claude/last30days-cn.env` is loaded without the trust gate used by `trove-pulse`. It overrides the home configuration and can supply cookies, API tokens, and `LAST30DAYS_UPSTREAM`, which selects a Python executable and script. The added warning in `upstream-patches/trove-pulse-cn/local.patch` is advisory only. Require an explicit trust setting before reading project-local credentials or executable paths.

- [skills/research/trove-pulse-cn/scripts/lib/upstream_bridge.py:72](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/upstream_bridge.py:72) [CWE-78] `LAST30DAYS_UPSTREAM_PYTHON` is executed directly, and an explicit `LAST30DAYS_UPSTREAM` path is accepted after only checking that it is a file whose sibling tree contains `lib/pipeline.py`. Combined with the untrusted project environment above, repository content can select both the interpreter and script. Validate the interpreter and require the same explicit trust boundary before launching it.

- [skills/research/trove-pulse-cn/scripts/lib/crawler_bridge.py:347](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/crawler_bridge.py:347) [CWE-522] `login <platform> --cookie` accepts a complete browser cookie header and converts every name-value pair into persistent Playwright cookies. The command is not limited to the named login cookie. A copied header can therefore place unrelated session cookies into `~/.config/last30days-cn/browser_cookies`, from where later automated browsing sends them to the configured platform. Import only the expected cookie names and values.

- [skills/research/trove-pulse-cn/scripts/lib/hot_board.py:202](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/hot_board.py:202) `render_page()` unconditionally reads excluded `hot_board_cat.png`. `upstream.yaml` excludes that binary, and it is absent from the canonical and generated trees, so HTML hot-board rendering raises `FileNotFoundError` before returning. The failure is fail-closed and does not bypass escaping, but the exclusion and renderer are inconsistent. Remove the sprite dependency or stop excluding the asset.

### Low

- [skills/research/trove-pulse-cn/scripts/lib/crawler_bridge.py:244](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/crawler_bridge.py:244) [CWE-732] Cookie JSON is written to a temporary file before `chmod 0600`; a failure there is ignored and the file is renamed into place. The default `mkstemp` mode is `0600`, but the directory is created with a normal umask and an existing permissive file is not repaired. Create the private mode at `open` time and verify the final file.

- [skills/research/trove-pulse-cn/scripts/lib/render.py:87](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/render.py:87) [CWE-359] Reports and hot-board snapshots containing queries and result text are written with default permissions. `LAST30DAYS_OUTPUT_DIR` selects the destination without the private-output handling added to `trove-pulse`. Use owner-only files when the destination is not explicitly public.

- [skills/research/trove-pulse-cn/scripts/lib/http.py:395](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse-cn/scripts/lib/http.py:395) [CWE-201] The new direct `fetch()` path follows cross-origin redirects without the credential-stripping handler added to `trove-pulse`. A caller-supplied cookie or authorization header can be replayed to another origin. Strip credential headers when the origin changes.

- [skills/research/trove-pulse/scripts/lib/grok_x.py:854](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse/scripts/lib/grok_x.py:854) [CWE-77] Research still launches Grok with `--permission-mode bypassPermissions`. The new audit and isolated home reduce exposure, but the disallowed-tool list is only four names, so a CLI change can restore local tools until the next audit. Keep the child credential-free and fail closed when the audit is inconclusive.

- [skills/research/trove-pulse/scripts/lib/cookie_extract.py:252](/Volumes/4TB_WD/dev/bravew/trove/skills/research/trove-pulse/scripts/lib/cookie_extract.py:252) [CWE-200] The retained browser-cookie lane now reaches Firefox, Safari, and the broader Chromium family through `cookie_paths.py` and `sqlite_snapshot.py`. Consent, domain selection, parameterized SQL, and private snapshots are present. This remains local credential-store access, including a WSL scan under `/mnt/c/Users`, and is the open D2a decision rather than a new excluded-module bypass.

## Checked boundaries

- `agentcookie.py`, `chrome_cdp.py`, and `box_chrome_login.py` are excluded. No imports or files for them exist in the canonical or generated pulse trees. The patch removes their configuration and discovery calls and makes `x_extras_enabled()` return false.
- `cookie_paths.py` is intentionally retained. Its only consumers are the pre-existing cookie extractors.
- `hot_board_cat.png` is absent from all inspected canonical and generated copies, but the renderer still requires it, as recorded above.
- No hardcoded credentials were found. The Grok audit uses obvious local dummy credentials and does not read or transmit the user's token value.
- Pulse-cn HTML rendering escapes text and limits links to HTTP(S). The pulse X-envelope reader bounds input size, rejects credential-store paths, and neutralizes active markup.
- Cookie queries use SQLite parameters. URL command construction and subprocess calls inspected in the new modules pass argument arrays rather than shell strings.

## Limitations

This review did not execute the Python modules, test browsers, decrypt cookies, connect to CDP, or verify runtime file modes. It also did not inspect provider responses or user configuration. Generated plugin copies were not compared byte for byte with the canonical sources.
