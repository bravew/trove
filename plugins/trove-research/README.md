# trove-research

Last-30-days social research skills, installable as one plugin.

| Skill | Coverage | Auto-attach |
|-------|----------|-------------|
| `trove-pulse` | Reddit, X, YouTube, Hacker News, GitHub, Polymarket, web | no |
| `trove-pulse-cn` | Weibo, Xiaohongshu, Bilibili, Zhihu, Douyin, WeChat, Baidu, Toutiao | no |

Neither skill auto-attaches. Invoke them by name, description, or trigger.

## Installation

```bash
./setup --role pm
./setup --role dev
```

No API keys and no `pip install` are required for the keyless baseline.
Optional credentials and the CN crawler extras (`jieba`, Playwright) are
documented in each skill and in `docs/user-config.md`.
