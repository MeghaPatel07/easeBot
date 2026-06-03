import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ChatAttachmentsProvider } from "@/contexts/ChatAttachmentsContext";
import LoadingScreen from "@/components/ui/loading-screen";
import { CapHitBanner } from "@/components/pricing/CapHitBanner";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import WeddingEaseFloater from "@/components/WeddingEaseFloater";
import { useCanonical } from "@/hooks/useCanonical";
import { useLocation } from "react-router-dom";

/** Runs route-level side-effects that need router context. */
function RouteEffects() {
  useCanonical()
  return null
}

/**
 * Boots PostHog analytics off the critical path (WE-20260528-305).
 *
 * `posthog-js` (~60 KB gzipped) used to be imported and initialized
 * synchronously from main.tsx, blocking first paint and bloating the
 * initial chunk graph. We now dynamic-import `./lib/analytics` and call
 * `initAnalytics()` inside `requestIdleCallback` after first paint, so
 * the SDK + /ingest/* requests don't compete with main-bundle download.
 *
 * The analytics module buffers any `track()` / `identify()` / etc. calls
 * made before init resolves and replays them once PostHog is ready, so
 * early page-load events are not lost.
 */
function AnalyticsBoot(): null {
  useEffect(() => {
    let cancelled = false
    const boot = (): void => {
      if (cancelled) return
      void import('./lib/analytics').then((mod) => {
        if (cancelled) return
        void mod.initAnalytics().then(() => {
          if (cancelled) return
          // Anonymous/guest replay decision: sampled per §7 cost-control.
          // AuthContext will upgrade this when the user logs in (paying
          // users always record).
          mod.startReplay({ isPaying: false, route: window.location.pathname })
        })
      })
    }
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }).requestIdleCallback
    if (typeof ric === 'function') {
      const id = ric(boot, { timeout: 2000 })
      return () => {
        cancelled = true
        const cic = (window as Window & {
          cancelIdleCallback?: (id: number) => void
        }).cancelIdleCallback
        if (typeof cic === 'function') cic(id)
      }
    }
    // Safari < 16.4 / older WebKit: fall back to a short macrotask delay so
    // we still yield to first paint before pulling in the SDK.
    const t = window.setTimeout(boot, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [])
  return null
 * WE-20260601-200: the backend's guest cap-hit response and the in-chat
 * guest-limit bubble both point the upgrade CTA at `/signup?from=guest-cap`,
 * but no `/signup` route existed — clicking it fell through to NotFound at the
 * single highest-intent conversion moment. The canonical signup surface is the
 * Login page (single email/Google entry handles both sign-in and sign-up), so
 * redirect `/signup` → `/login`, preserving the query string (e.g. the
 * `from=guest-cap` conversion-source param) for analytics/return intent.
 */
function SignupRedirect() {
  const location = useLocation()
  return <Navigate to={`/login${location.search}`} replace />
}

const Index = lazy(() => import('./pages/Index'));
const SharedChat = lazy(() => import('./pages/SharedChat'));
const SharedNote = lazy(() => import('./pages/SharedNote'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFailure = lazy(() => import('./pages/PaymentFailure'));
const Help = lazy(() => import('./pages/Help'));
const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Renders the floater only on non-chat pages */
function GlobalFloater() {
  const location = useLocation();
  // Show the fixed floater only on specific content pages. On all chat/index 
  // views, the floater is handled locally next to the input box.
  const showGlobal = location.pathname.startsWith('/pricing') ||
                     location.pathname.startsWith('/terms') ||
                     location.pathname.startsWith('/privacy') ||
                     location.pathname.startsWith('/checkout') ||
                     location.pathname.startsWith('/payment') ||
                     location.pathname.startsWith('/help') ||
                     location.pathname.startsWith('/login');
  
  if (!showGlobal) return null;
  return <WeddingEaseFloater />;
}

const queryClient = new QueryClient();

const App = () => (

  <QueryClientProvider client={queryClient}>
    <AnalyticsBoot />
    <AuthProvider>
      <ChatAttachmentsProvider>
      <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
          <BrowserRouter>
            <RouteEffects />
            <GlobalFloater />
            <CapHitBanner />
            <AnalyticsConsent />
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/chat/:threadId" element={<Index />} />
              <Route path="/:userId/gallery" element={<Index />} />
              <Route path="/:userId/images" element={<Index />} />
              <Route path="/:userId/planner" element={<Index />} />
              <Route path="/:userId/planner/:checklistId" element={<Index />} />
              <Route path="/:userId/liked" element={<Index />} />
              <Route path="/:userId/reminders" element={<Index />} />
              <Route path="/:userId/budget" element={<Index />} />
              <Route path="/:userId/shopping" element={<Index />} />
              <Route path="/:userId/saved-items" element={<Index />} />
              <Route path="/:userId/timeline" element={<Index />} />
              <Route path="/:userId/progress" element={<Index />} />
              <Route path="/:userId/notifications" element={<Index />} />
              <Route path="/:userId/collaborate" element={<Index />} />
              <Route path="/:userId/notes" element={<Index />} />
              <Route path="/:userId/notes/:noteId" element={<Index />} />
              <Route path="/share/:shareId" element={<SharedChat />} />
              <Route path="/shared/note/:shareId" element={<SharedNote />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              {/* WE-20260527-024: long-name SEO aliases for legal pages —
                  external traffic (search engines, share links) typically
                  uses the fully-spelled forms. Redirect to canonical. */}
              <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
              <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
              {/* WE-20260527-024: /images is canonically /:userId/images, but the
                  bare path is a common deep-link. Send signed-out users to login,
                  signed-in users land on / where the app routes them to their
                  gallery once auth resolves. */}
              <Route path="/images" element={<Navigate to="/" replace />} />
              {/* WE-20260527-024: /settings is query-string driven on the index
                  page. Redirect to the account settings tab by default. */}
              <Route path="/settings" element={<Navigate to="/?settings=account" replace />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/failure" element={<PaymentFailure />} />
              <Route path="/help" element={<Help />} />
              <Route path="/login" element={<Login />} />
              {/* WE-20260601-200: /signup → /login (signup surface), */}
              {/* preserving query so guest-cap CTAs no longer 404. */}
              <Route path="/signup" element={<SignupRedirect />} />
              {/* Sprint 1 batch B (FE-001): /billing placeholder route — */}
              {/* redirects into Settings → Plan & Billing tab. */}
              <Route
                path="/billing"
                element={<Navigate to="/?settings=plan-billing" replace />}
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
      </ChatAttachmentsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
