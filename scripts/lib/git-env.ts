/**
 * Environment for git calls that may reach the network. A scheduled or scripted
 * run must fail on a private or missing repository, not hang on a credential
 * prompt. GIT_TERMINAL_PROMPT=0 stops the terminal prompt; an empty GIT_ASKPASS
 * stops an inherited askpass helper from opening one.
 */
export function noninteractiveGitEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" };
}
