import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "build",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(?:react|react-dom)\//,
              priority: 30,
            },
            {
              name: "firebase-vendor",
              test: /node_modules\/(?:firebase|@firebase)\//,
              priority: 20,
            },
            {
              name: "vendor",
              test: /node_modules\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/vitest.setup.js"],
  },
});
