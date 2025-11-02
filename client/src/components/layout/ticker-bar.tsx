import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface TickerMessage {
  id: string;
  text: string;
  icon?: string;
}

export interface TickerBarProps {
  messages: TickerMessage[];
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
}

export function TickerBar({
  messages,
  speed = 30,
  pauseOnHover = true,
  className,
}: TickerBarProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down
        setIsVisible(false);
      } else {
        // Scrolling up
        setIsVisible(true);
      }
      
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const duplicatedMessages = [...messages, ...messages, ...messages];

  return (
    <div
      className={cn(
        "w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white overflow-hidden transition-all duration-300 md:hidden",
        isVisible ? "h-8 opacity-100" : "h-0 opacity-0",
        className
      )}
      data-testid="ticker-bar"
    >
      <div
        ref={tickerRef}
        className="flex items-center h-full whitespace-nowrap"
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        style={{
          animation: isPaused ? "none" : `ticker ${speed}s linear infinite`,
        }}
      >
        {duplicatedMessages.map((message, index) => (
          <div
            key={`${message.id}-${index}`}
            className="flex items-center px-8"
          >
            {message.icon && (
              <span className="mr-2 text-base">{message.icon}</span>
            )}
            <span className="text-sm font-medium">{message.text}</span>
            {index < duplicatedMessages.length - 1 && (
              <span className="mx-8 text-orange-200">•</span>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
      `}</style>
    </div>
  );
}

export default TickerBar;
