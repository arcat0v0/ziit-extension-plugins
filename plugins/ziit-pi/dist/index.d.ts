export interface ZiitExtensionAPI {
    on(event: "session_start", handler: (event: unknown, context: {
        cwd: string;
    }) => void | Promise<void>): void;
    on(event: "session_shutdown", handler: () => void | Promise<void>): void;
    on(event: "tool_call" | "tool_result", handler: (event: {
        toolName: string;
        toolCallId: string;
        input?: Record<string, unknown>;
        isError?: boolean;
    }) => void | Promise<void>): void;
}
export declare function createZiitExtension(pi: ZiitExtensionAPI, editorName: string, platformName: string): void;
export default function ziitPi(pi: ZiitExtensionAPI): void;
