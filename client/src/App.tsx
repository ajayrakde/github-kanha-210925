import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import Products from "@/pages/products";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import Admin from "@/pages/admin";
import Influencer from "@/pages/influencer";
import ThankYou from "@/pages/thank-you";
import TermsOfService from "@/pages/terms-of-service";
import RefundPolicy from "@/pages/refund-policy";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        {/* Full-screen admin and influencer pages */}
        <Route path="/admin" component={Admin} />
        <Route path="/influencer" component={Influencer} />
        
        {/* Regular layout for other pages */}
        <Route>
          <div className="min-h-screen flex flex-col">
            <ErrorBoundary>
              <Header />
            </ErrorBoundary>
            <main className="max-w-4xl mx-auto px-4 py-6 flex-1">
              <ErrorBoundary>
                <Switch>
                  <Route path="/" component={Products} />
                  <Route path="/cart" component={Cart} />
                  <Route path="/checkout" component={Checkout} />
                  <Route path="/thank-you" component={ThankYou} />
                  <Route path="/terms-of-service" component={TermsOfService} />
                  <Route path="/refund-policy" component={RefundPolicy} />
                  <Route component={NotFound} />
                </Switch>
              </ErrorBoundary>
            </main>
            <ErrorBoundary>
              <Footer />
            </ErrorBoundary>
          </div>
        </Route>
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
