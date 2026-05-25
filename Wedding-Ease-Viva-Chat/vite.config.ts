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
        target: 'http://localhost:3001',
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
    // BUG-VIVA-20260525-303: stock build emitted two main-route chunks > 1 MB
    // raw (Index 1.32 MB / 354 KB gz, index 1.20 MB / 331 KB gz) and one
    // 513 KB raw NoteEditor chunk. Splitting heavy vendor libs into their
    // own chunks shrinks per-route payload and lets the browser cache them
    // across deploys (the chat home rarely changes Firebase or Radix).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('@floating-ui')) return 'vendor-tiptap'
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('@radix-ui')) return 'vendor-radix'
          if (id.includes('lucide-react')) return 'vendor-lucide'
          if (id.includes('libphonenumber-js')) return 'vendor-phone'
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('posthog-js')) return 'vendor-posthog'
          if (id.includes('microsoft-cognitiveservices-speech-sdk')) return 'vendor-speech'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('purify')) return 'vendor-pdf'
          if (id.includes('date-fns') || id.includes('react-day-picker')) return 'vendor-date'
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('micromark') || id.includes('mdast-')) return 'vendor-markdown'
          return 'vendor'
        },
      },
    },
    // Push the warning threshold up so the build doesn't yell about the
    // legitimately-large vendor-tiptap chunk (tiptap's editor surface
    // doesn't split usefully past this point).
    chunkSizeWarningLimit: 700,
  },
}));
