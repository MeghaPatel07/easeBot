import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";

// ESM-friendly __dirname + package.json read for build-time constants.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"),
) as { version: string };

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/ingest': {
        // Backend (easebot-backend) binds IPv4 only (0.0.0.0:3001). With
        // "localhost", Node resolves ::1 first and the proxy hits ECONNREFUSED
        // on the absent IPv6 listener. Pin to 127.0.0.1 so the dev proxy always
        // reaches the backend's PostHog /ingest relay.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Surfaced in src/vite-env.d.ts as global declarations.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    sourcemap: false,
  }
}));
