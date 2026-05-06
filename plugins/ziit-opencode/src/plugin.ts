import type { PluginModule } from "@opencode-ai/plugin"
import { ZiitOpenCodePlugin } from "./index.js"

export { ZiitOpenCodePlugin }

export default {
  server: ZiitOpenCodePlugin,
} satisfies PluginModule
