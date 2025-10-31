import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product/product-card";
import { ApiErrorMessage } from "@/components/ui/error-message";
import { Product } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";

export default function Products() {
  const [, setLocation] = useLocation();
  const { data: products, isLoading, error, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { itemCount, subtotal } = useCart();

  const handleScrollToShop = () => {
    if (typeof window !== "undefined") {
      document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const heroSection = (
    <section className="hero hero--hidden" aria-hidden="true">
      <div className="container">
        <div className="hero-content">
          <span className="hero-kicker">Playful &amp; Nutritious</span>
          <h1 className="hero-title">Joyful bites for happy little tummies</h1>
          <p className="hero-subtitle">
            Discover bright flavours, soft textures, and fun combos crafted to make snack time feel like play time.
          </p>
          <div className="hero-cta">
            <button
              type="button"
              className="btn-primary"
              onClick={handleScrollToShop}
              data-testid="button-explore-snacks"
            >
              Explore Snacks
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setLocation(itemCount > 0 ? "/checkout" : "/cart")}
              data-testid="button-quick-checkout"
            >
              {itemCount > 0 ? `Quick Checkout (${itemCount})` : "View Cart"}
            </button>
          </div>
          <div className="tags">
            <span className="tag tag--yellow">No refined sugar</span>
            <span className="tag tag--green">Kid-tested</span>
            <span className="tag tag--purple">Doorstep delivery</span>
            {itemCount > 0 && <span className="tag">Cart ready!</span>}
          </div>
        </div>
      </div>
    </section>
  );

  if (isLoading) {
    return (
      <>
        {heroSection}
        <section className="product-section">
          <div className="container">
            <div className="section-heading">
              <h2 className="text-3xl font-bold text-primary">Our Star Treats</h2>
              <p>We&apos;re plating up your favourites. Hang tight while we load the goodies!</p>
            </div>
            <div className="product-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="card animate-pulse">
                  <div className="w-full h-[200px] bg-slate-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-6 bg-slate-200 rounded-full w-3/4" />
                    <div className="h-4 bg-slate-200 rounded-full w-full" />
                    <div className="h-4 bg-slate-200 rounded-full w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        {heroSection}
        <section className="product-section">
          <div className="container">
            <div className="section-heading">
              <h2 className="text-3xl font-bold text-primary">Our Star Treats</h2>
              <p>We hit a tiny hiccup fetching the goodies. Please try again in a moment.</p>
            </div>
            <ApiErrorMessage error={error as Error} onRetry={() => refetch()} />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {heroSection}
      <section className="product-section" id="shop">
        <div className="container">
          <div className="section-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-primary">Our Star Treats</h2>
                <p>Pick a playful snack to brighten your kiddo&apos;s day.</p>
              </div>
              {itemCount > 0 && (
                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                  <button
                    type="button"
                    onClick={() => setLocation("/checkout")}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-secondary via-tertiary to-primary px-5 py-2.5 font-bold text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto sm:px-6"
                    data-testid="button-proceed-checkout"
                  >
                    Proceed to Checkout
                    <ArrowRight size={18} />
                  </button>
                  <span className="text-sm text-primary/80 sm:text-right">
                    {itemCount} {itemCount === 1 ? "treat" : "treats"} · ₹{subtotal.toFixed(2)} + delivery love
                  </span>
                </div>
              )}
            </div>
          </div>

          {!products || products.length === 0 ? (
            <div className="card center py-12 px-6">
              <div className="card-content items-center">
                <h3 className="card-title text-center">We&apos;re restocking!</h3>
                <p className="card-text text-center">
                  Our kitchen is whipping up new treats. Please swing by again soon.
                </p>
              </div>
            </div>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
