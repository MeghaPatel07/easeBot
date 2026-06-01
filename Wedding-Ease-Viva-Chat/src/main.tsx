import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// PostHog analytics is intentionally NOT initialized here (WE-20260528-305).
// It used to be `initAnalytics()` + `startReplay()` synchronously, which
// pulled posthog-js (~60 KB gzipped) into the initial chunk graph and
// blocked first paint. The boot is now deferred to a requestIdleCallback
// inside App.tsx → see AnalyticsBoot.
createRoot(document.getElementById("root")!).render(<App />);
