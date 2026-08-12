Prompt: "Our indexer writes a `.lock` file on start and deletes it on exit. After a crash, the stale lock blocks all future runs until someone deletes it by hand. How should the lock work?"

Expected behavior: The assistant replaces presence-based locking with stale-lock detection (e.g. record the PID/timestamp and reclaim the lock if that process is dead), so a crashed run self-heals on the next start instead of requiring manual cleanup.
