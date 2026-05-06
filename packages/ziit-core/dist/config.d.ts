export interface ZiitConfig {
    apiKey: string;
    baseUrl: string;
}
/**
 * Load the Ziit configuration from ~/.config/ziit/config.json.
 * Returns null if the config file is missing, malformed, or lacks an apiKey.
 * The baseUrl defaults to https://ziit.app with trailing slash stripped.
 */
export declare function loadConfig(): Promise<ZiitConfig | null>;
