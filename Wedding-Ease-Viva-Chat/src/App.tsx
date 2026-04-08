import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/ui/loading-screen";

const Index = lazy(() => import('./pages/Index'));
const SharedChat = lazy(() => import('./pages/SharedChat'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient();

const App = () => (

  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/chat/:threadId" element={<Index />} />
              <Route path="/:userId/gallery" element={<Index />} />
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
              <Route path="/share/:shareId" element={<SharedChat />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
