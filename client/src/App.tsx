import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import Products from "@/pages/products";
import ProductDetails from "@/pages/product-details";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import Payment from "@/pages/payment";
import Admin from "@/pages/admin";
import PhonePeReconciliationAdminPage from "@/pages/admin/phonepe-reconciliation";
import Influencer from "@/pages/influencer";
import ThankYou from "@/pages/thank-you";
import UserOrders from "@/pages/user-orders";
import TermsOfService from "@/pages/terms-of-service";
import RefundPolicy from "@/pages/refund-policy";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import MobileNav from "@/components/layout/mobile-nav";
import CartDrawer from "@/components/cart/cart-drawer";
import { useState } from "react";

function Router() {
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  return (
    <ErrorBoundary>
      <Switch>
        {/* Full-screen admin and influencer pages */}
        <Route path="/admin/phonepe-reconciliation" component={PhonePeReconciliationAdminPage} />
        <Route path="/admin" component={Admin} />
        <Route path="/influencer" component={Influencer} />
        
        {/* Regular layout for other pages */}
        <Route>
          <div className="app-shell">
            <ErrorBoundary>
              <Header />
            </ErrorBoundary>
            <main className="page-main flex-1 pb-16 md:pb-0">
              <div className="container page-container">
                <ErrorBoundary>
                  <Switch>
                    <Route path="/" component={Products} />
                    <Route path="/product/:id" component={ProductDetails} />
                    <Route path="/cart" component={Cart} />
                    <Route path="/checkout" component={Checkout} />
                    <Route path="/payment" component={Payment} />
                    <Route path="/thank-you" component={ThankYou} />
                    <Route path="/orders" component={UserOrders} />
                    <Route path="/terms-of-service" component={TermsOfService} />
                    <Route path="/refund-policy" component={RefundPolicy} />
                    <Route component={NotFound} />
                  </Switch>
                </ErrorBoundary>
              </div>
            </main>
            <ErrorBoundary>
              <Footer />
            </ErrorBoundary>
            <ErrorBoundary>
              <MobileNav />
            </ErrorBoundary>
            <ErrorBoundary>
              <CartDrawer 
                open={isCartDrawerOpen} 
                onOpenChange={setIsCartDrawerOpen} 
              />
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
