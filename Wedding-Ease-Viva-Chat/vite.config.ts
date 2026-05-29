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
    // WE-20260528-302: split node_modules into per-vendor chunks so the
    // initial / and /chat routes don't ship the whole graph as one mega
    // chunk. We pattern-match on /node_modules/<pkg>/ to stay stable as
    // nested deps move around (a substring like 'firebase' could otherwise
    // catch any package whose name happens to contain it).
    //
    // Anchored prefixes also fix the circular-chunk warning from the
    // earlier WE-20260525-303 fix, where bare `react` and `@tanstack/*`
    // dropped into the catch-all `vendor` while `vendor-react` depended on
    // them — Rollup flagged the cycle.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // Normalize Windows-style separators so the .includes() checks
          // below behave the same in CI as on macOS/Linux dev boxes.
          const p = id.replace(/\\/g, '/')

          // React core + router + scheduler — must include bare `react`
          // (anchored so it doesn't catch `react-router-dom`, `react-dom`,
          // etc.). Order matters: more specific matches first.
          //
          // We also pull react's transitive deps (loose-envify, js-tokens,
          // object-assign, use-sync-external-store) and the router's
          // (@remix-run/router) into the same chunk. Without this they sit
          // in the catch-all `vendor` and create a circular chunk warning
          // (react-vendor -> vendor -> react-vendor).
          if (
            p.includes('/node_modules/react/') ||
            p.includes('/node_modules/react-dom/') ||
            p.includes('/node_modules/scheduler/') ||
            p.includes('/node_modules/react-router-dom/') ||
            p.includes('/node_modules/react-router/') ||
            p.includes('/node_modules/@remix-run/router/') ||
            p.includes('/node_modules/use-sync-external-store/') ||
            p.includes('/node_modules/loose-envify/') ||
            p.includes('/node_modules/js-tokens/') ||
            p.includes('/node_modules/object-assign/')
          ) {
            return 'react-vendor'
          }

          // TipTap + its ProseMirror/floating-ui dep graph. TipTap re-exports
          // from prosemirror-* and uses @floating-ui under the hood — if we
          // don't bundle them together we get duplicate React calls on the
          // editor mount path.
          if (
            p.includes('/node_modules/@tiptap/') ||
            p.includes('/node_modules/prosemirror-') ||
            p.includes('/node_modules/@floating-ui/')
          ) {
            return 'tiptap-vendor'
          }

          // All Firebase SDKs in one chunk. We could split further (auth vs
          // firestore vs storage vs functions) once we measure which routes
          // actually need what — for now one chunk keeps the change small.
          if (
            p.includes('/node_modules/firebase/') ||
            p.includes('/node_modules/@firebase/')
          ) {
            return 'firebase-vendor'
          }

          // All Radix primitives together. Each individual one is small but
          // we use ~25 of them; splitting per-primitive would just produce
          // many tiny chunks that hurt HTTP/2 prioritization.
          if (p.includes('/node_modules/@radix-ui/')) {
            return 'radix-vendor'
          }

          // PostHog client SDK. Stays in its own chunk so a future
          // deferred-load (post-hydration) ticket can flip it to dynamic
          // import without touching the rest of the bundle.
          if (p.includes('/node_modules/posthog-js/')) {
            return 'posthog-vendor'
          }

          // TanStack Query — used app-wide via QueryClientProvider.
          if (p.includes('/node_modules/@tanstack/')) {
            return 'tanstack-vendor'
          }

          // Keep the per-domain splits from the earlier 303 fix so the
          // catch-all `vendor` chunk stays modest. Each of these is heavy
          // enough on its own (lucide ~54KB, phone ~156KB, pdf ~575KB) to
          // warrant isolation; lumping them back into `vendor` would push
          // it well past 500KB.
          if (p.includes('/node_modules/lucide-react/')) return 'vendor-lucide'
          if (p.includes('/node_modules/libphonenumber-js/')) return 'vendor-phone'
          if (
            p.includes('/node_modules/recharts/') ||
            p.includes('/node_modules/d3-')
          ) {
            return 'vendor-charts'
          }
          if (p.includes('/node_modules/framer-motion/')) return 'vendor-motion'
          if (p.includes('/node_modules/microsoft-cognitiveservices-speech-sdk/')) {
            return 'vendor-speech'
          }
          if (
            p.includes('/node_modules/jspdf/') ||
            p.includes('/node_modules/html2canvas/') ||
            p.includes('/node_modules/dompurify/')
          ) {
            return 'vendor-pdf'
          }
          if (
            p.includes('/node_modules/date-fns/') ||
            p.includes('/node_modules/react-day-picker/')
          ) {
            return 'vendor-date'
          }
          if (
            p.includes('/node_modules/react-markdown/') ||
            p.includes('/node_modules/remark-') ||
            p.includes('/node_modules/micromark') ||
            p.includes('/node_modules/mdast-')
          ) {
            return 'vendor-markdown'
          }

          // Everything else (small utilities — clsx, zod, tailwind-merge,
          // class-variance-authority, sonner, cmdk, vaul, etc.).
          return 'vendor'
        },
      },
    },
    // Threshold left at 700KB for the legitimately-large tiptap/pdf chunks
    // that don't split further usefully; anything new crossing it should
    // get its own group above before raising this.
    chunkSizeWarningLimit: 700,
  },
}));
