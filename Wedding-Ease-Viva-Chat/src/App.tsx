import { lazy, Suspense } from 'react';
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
