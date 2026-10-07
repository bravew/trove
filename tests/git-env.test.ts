import { expect, test } from "bun:test";
import { noninteractiveGitEnv } from "../scripts/lib/git-env";

test("noninteractiveGitEnv disables prompts and askpass without dropping the base environment", () => {
  const env = noninteractiveGitEnv({ PATH: "/usr/bin", GIT_ASKPASS: "/usr/local/bin/helper", GIT_TERMINAL_PROMPT: "1" });
  expect(env).toEqual({ PATH: "/usr/bin", GIT_ASKPASS: "", GIT_TERMINAL_PROMPT: "0" });
});
