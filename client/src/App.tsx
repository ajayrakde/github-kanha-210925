import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import MobileNav from "@/components/layout/mobile-nav";

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 mb-16 md:mb-0">
        <Switch>
          <Route path="/" component={Products} />
          <Route path="/cart" component={Cart} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/admin" component={Admin} />
          <Route path="/influencer" component={Influencer} />
          <Route path="/thank-you" component={ThankYou} />
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/refund-policy" component={RefundPolicy} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
