import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const presetGeneratorScriptPath = fileURLToPath(new URL("./scripts/generate_embedded_presets.cjs", import.meta.url));
const skyboxGeneratorScriptPath = fileURLToPath(new URL("./scripts/generate_embedded_skyboxes.cjs", import.meta.url));

function embedAssetsPlugin() {
  return {
    name: "embed-assets",
    apply: "build",
    buildStart() {
      execFileSync("node", [presetGeneratorScriptPath], { stdio: "inherit" });
      execFileSync("node", [skyboxGeneratorScriptPath], { stdio: "inherit" });
    },
  };
}

export default defineConfig({
  plugins: [embedAssetsPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    lib: {
      entry: "./js/mage-lib.js",
      name: "MAGE",
      fileName: "mage-engine",
      formats: ["es"],
    },
    sourcemap: true,
    minify: false, // easier line-accurate debugging
  }
})