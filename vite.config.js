import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    lib: {
      entry: "./js/mage-lib.js",
      name: "MAGE",
      fileName: "mage-engine",
      formats: ["umd"],
      sourcemap: true,
      minify: false, // easier line-accurate debugging
    }
  }
})