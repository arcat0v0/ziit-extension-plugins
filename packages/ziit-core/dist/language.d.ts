/**
 * Detect programming language from a file path.
 * Uses the file extension lookup table with special-case handling
 * for Dockerfile and Makefile (basename match, no extension).
 */
export declare function detectLanguage(filePath: string): string;
