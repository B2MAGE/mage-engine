import { defineConfig } from "vite"

export default defineConfig({
  plugins: [],
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
    minify: false,
    outDir: "dist",
  }
})