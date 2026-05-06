/**
 * Detect the project name from the git remote origin URL,
 * falling back to the working directory basename.
 */
export declare function detectProject(cwd: string): string;
/**
 * Detect the current git branch.
 * Returns null if not in a git repository or on a detached HEAD.
 */
export declare function detectBranch(cwd: string): string | null;
