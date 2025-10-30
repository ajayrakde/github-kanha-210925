import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product/product-card";
import { ApiErrorMessage } from "@/components/ui/error-message";
import { Product } from "@/lib/types";
import { ShoppingCart, ArrowRight } from "lucide-react";
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
          {itemCount > 0 && (
            <div
              className="sticky top-20 z-20 mb-6 rounded-3xl border border-white/30 p-4 text-white shadow-xl backdrop-blur-sm sm:p-5"
              style={{
                background: "linear-gradient(120deg, rgba(58,175,97,0.95) 0%, rgba(106,76,147,0.95) 100%)",
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white/25 p-2">
                    <ShoppingCart size={22} />
                  </div>
                  <div className="text-sm sm:text-base">
                    <div className="font-semibold">
                      {itemCount} {itemCount === 1 ? "treat" : "treats"} ready to ship
                    </div>
                    <div className="text-sm text-white/80">
                      Total: ₹{subtotal.toFixed(2)} + delivery love
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLocation("/checkout")}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-primary shadow-md transition-transform hover:-translate-y-1 sm:w-auto"
                  data-testid="button-proceed-checkout"
                >
                  Proceed to Checkout
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          <div className="section-heading">
            <h2 className="text-3xl font-bold text-primary">Our Star Treats</h2>
            <p>Pick a playful snack to brighten your kiddo&apos;s day.</p>
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
