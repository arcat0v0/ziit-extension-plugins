import { createZiitExtension, type ZiitExtensionAPI } from "./index.js";

export default function ziitOmp(pi: ZiitExtensionAPI): void {
  createZiitExtension(pi, "Oh My Pi", "omp");
}
