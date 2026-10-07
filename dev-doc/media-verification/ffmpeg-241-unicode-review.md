# ffmpeg 2.4.1 Unicode review

The maintainer selected exact reviewed exceptions for the five U+200D joiners in source revision `9ada0f6dca03f1a5f1aa62ea237759c3f8e15321`. The decision was recorded on 2026-10-06 while reviewing PR #42. This resolves the conflict between #21's pinned acceptance source and the scanner's default rejection of invisible characters.

The accompanying `ffmpeg-241-unicode-review.json` binds each exception to the source revision, whole-file SHA-256 digest, repository path, line, U+200D code point, and count. Passing it explicitly to `--unicode-review` converts only those matches into review flags. An absent review file leaves default rejection intact. A changed revision, file digest, line, count, duplicate entry, or unused entry fails closed. Other invisible Unicode and bidi controls remain hard rejects.

| File | Line | Count | Reviewed context |
| --- | --- | --- | --- |
| `references/gotchas.md` | 197 | 1 | Markdown example of Hindi ka, virama, joiner and ssa |
| `scripts/_common/emoji.py` | 30 | 1 | Python comment explaining the same orthography |
| `scripts/_common/emoji.py` | 68 | 1 | Docstring showing the woman-technologist emoji as one grapheme cluster |
| `scripts/_common/emoji.py` | 73 | 2 | Docstring comparing a Hindi cluster with a deliberately joined alphabetic example |

The entries preserve the pinned upstream bytes. No source text is stripped, escaped or rewritten. Approval applies only to the content bound by these digests and does not carry forward to an upstream update. A future revision requires inspection and a new review.

The digest evidence was computed directly from `git show <sha>:<path>`. `references/gotchas.md` hashes to `632c85918fdd2a9720c339fb7c0f2939286fb250d6e4c91a53a94972268527a1`; `scripts/_common/emoji.py` hashes to `8db4f6f4eca49990b879f127606ba2795048a7bac9ac86637127cdf6087fd726`.
