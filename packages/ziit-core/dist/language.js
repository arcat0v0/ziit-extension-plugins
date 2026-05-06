const LANGUAGE_BY_EXTENSION = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyw": "python",
    ".rs": "rust",
    ".go": "go",
    ".rb": "ruby",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".swift": "swift",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".sql": "sql",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "css",
    ".sass": "css",
    ".less": "css",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".md": "markdown",
    ".markdown": "markdown",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
    ".prisma": "prisma",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
};
/**
 * Detect programming language from a file path.
 * Uses the file extension lookup table with special-case handling
 * for Dockerfile and Makefile (basename match, no extension).
 */
export function detectLanguage(filePath) {
    const lowerName = filePath.split("/").pop()?.toLowerCase() ?? "";
    if (lowerName === "dockerfile")
        return "dockerfile";
    if (lowerName === "makefile")
        return "makefile";
    const dotIndex = lowerName.lastIndexOf(".");
    if (dotIndex === -1)
        return "unknown";
    const extension = lowerName.slice(dotIndex);
    return LANGUAGE_BY_EXTENSION[extension] ?? "unknown";
}
