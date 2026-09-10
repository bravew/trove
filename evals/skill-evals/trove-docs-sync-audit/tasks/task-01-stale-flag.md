# Task: A documented flag no longer exists

README:

```
Run `./setup --host copilot --legacy-agents` to install the AGENTS.md fallback.
```

Code:

```bash
# setup
case "$1" in
  --host) HOST="$2" ;;
  --role) ROLE="$2" ;;
  --uninstall) MODE=uninstall ;;
esac
```

Expected: `--legacy-agents` is reported as wrong documentation (not missing
documentation), with both the README line and the `setup` case block cited,
and ranked above any purely absent section.
