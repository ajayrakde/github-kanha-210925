import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product/product-card";
import { ApiErrorMessage } from "@/components/ui/error-message";
import { Product } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { StoryCircles } from "@/components/product/story-circles";
import { useState, useEffect } from "react";

export default function Products() {
  const [, setLocation] = useLocation();
  const { data: products, isLoading, error, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { itemCount, subtotal } = useCart();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  // Pull-to-refresh for mobile
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;

    let startY = 0;
    let currentY = 0;
    let isRefreshing = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshing || window.scrollY > 0) return;

      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0 && window.scrollY === 0) {
        e.preventDefault();
        setPullDistance(Math.min(diff, 100));
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > 60 && !isRefreshing) {
        isRefreshing = true;
        setIsPullRefreshing(true);
        
        await refetch();
        
        setTimeout(() => {
          setIsPullRefreshing(false);
          setPullDistance(0);
          isRefreshing = false;
        }, 500);
      } else {
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, refetch]);

  // Save scroll position when navigating away
  useEffect(() => {
    const saveScrollPosition = () => {
      sessionStorage.setItem('productsScrollPosition', window.scrollY.toString());
    };
    
    window.addEventListener('beforeunload', saveScrollPosition);
    
    return () => {
      window.removeEventListener('beforeunload', saveScrollPosition);
    };
  }, []);

  // Restore scroll position on mount
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('productsScrollPosition');
    if (savedPosition && products && products.length > 0) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedPosition));
        sessionStorage.removeItem('productsScrollPosition');
      }, 100);
    }
  }, [products]);

  const handleScrollToShop = () => {
    if (typeof window !== "undefined") {
      document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Extract unique categories from products
  const categories = products 
    ? Array.from(new Set(products.map(p => p.category).filter((c): c is string => Boolean(c) && typeof c === 'string')))
    : [];

  // Create story circles for categories
  const storyItems = [
    {
      id: "all",
      label: "All",
      gradient: "from-purple-500 to-pink-500",
      onClick: () => setSelectedCategory("all"),
    },
    ...categories.map((category, index) => {
      const gradients = [
        "from-yellow-400 to-orange-500",
        "from-green-400 to-emerald-500",
        "from-blue-400 to-indigo-500",
        "from-pink-400 to-rose-500",
        "from-cyan-400 to-teal-500",
      ];
      return {
        id: category as string,
        label: category as string,
        gradient: gradients[index % gradients.length],
        onClick: () => setSelectedCategory(category as string),
      };
    }),
  ];

  // Filter products by selected category
  const filteredProducts = products 
    ? selectedCategory === "all" 
      ? products 
      : products.filter(p => p.category === selectedCategory)
    : [];

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
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="fixed top-0 left-0 right-0 flex justify-center items-center z-50 md:hidden"
          style={{ 
            height: `${pullDistance}px`,
            opacity: Math.min(pullDistance / 60, 1),
            transition: pullDistance === 0 ? 'all 0.3s ease-out' : 'none'
          }}
        >
          <div className={`${isPullRefreshing ? 'animate-spin' : ''}`}>
            <ArrowRight className="transform -rotate-90 text-primary" size={24} />
          </div>
        </div>
      )}
      
      {heroSection}
      <section className="product-section" id="shop">
        <div className="container">
          {/* Story Circles for Category Navigation - Mobile Only */}
          {storyItems.length > 1 && (
            <div className="mb-4 -mx-4 px-4 md:hidden">
              <StoryCircles 
                items={storyItems} 
                activeId={selectedCategory}
              />
            </div>
          )}
          
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
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(120deg,var(--accent),var(--purple))] px-5 py-2.5 font-bold text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto sm:px-6"
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
          ) : filteredProducts.length === 0 ? (
            <div className="card center py-12 px-6">
              <div className="card-content items-center">
                <h3 className="card-title text-center">No treats in this category</h3>
                <p className="card-text text-center">
                  Try browsing other categories for delicious options!
                </p>
              </div>
            </div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
