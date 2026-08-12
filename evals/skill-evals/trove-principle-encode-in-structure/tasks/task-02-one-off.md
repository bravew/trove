Prompt: "I just learned this one repo pins a weird Node version because of a single legacy dependency. Should I write a lint rule about it?"

Expected behavior: The assistant routes by recurrence: this is a one-off quirk, so a brief note (README/learnings entry) is enough; building a lint for a single non-recurring fact would be over-structure. It does not over-engineer a check for a one-time observation.
