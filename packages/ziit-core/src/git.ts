import { execFileSync } from "node:child_process";
import { basename } from "node:path";

/**
 * Run a git command in the given working directory.
 * Returns the trimmed stdout or empty string on failure.
 */
function runGit(cwd: string, args: string[]): string {
  try {
    const output = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim();
  } catch {
    return "";
  }
}

/**
 * Detect the project name from the git remote origin URL,
 * falling back to the working directory basename.
 */
export function detectProject(cwd: string): string {
  const remoteUrl = runGit(cwd, ["remote", "get-url", "origin"]);
  if (remoteUrl) {
    const fromRemote = basename(
      remoteUrl.replace(/\/+$/, "").replace(/\.git$/, ""),
    );
    if (fromRemote) return fromRemote;
  }
  return basename(cwd) || cwd;
}

/**
 * Detect the current git branch.
 * Returns null if not in a git repository or on a detached HEAD.
 */
export function detectBranch(cwd: string): string | null {
  const branch = runGit(cwd, ["branch", "--show-current"]);
  return branch || null;
}
