import { useState, useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface TabAccordionItem {
  value: string;
  label: string;
  content: ReactNode;
  icon?: ReactNode;
}

export interface TabAccordionProps {
  items: TabAccordionItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  type?: "tabs" | "accordion" | "auto";
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function TabAccordion({
  items,
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  type = "auto",
}: TabAccordionProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [internalValue, setInternalValue] = useState(
    defaultValue || items[0]?.value || ""
  );

  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const setValue = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  const shouldUseAccordion = type === "accordion" || (type === "auto" && isMobile);

  if (shouldUseAccordion) {
    return (
      <div className={cn("space-y-2", className)} data-testid="tab-accordion-mobile">
        {items.map((item) => {
          const isActive = value === item.value;
          return (
            <div
              key={item.value}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setValue(isActive ? "" : item.value)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-white hover:bg-gray-50 text-gray-900"
                )}
                data-testid={`accordion-trigger-${item.value}`}
                aria-expanded={isActive}
              >
                <div className="flex items-center gap-2 font-medium text-sm">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                <ChevronDown
                  size={18}
                  className={cn(
                    "transition-transform",
                    isActive ? "rotate-180" : ""
                  )}
                />
              </button>
              
              {isActive && (
                <div
                  className="bg-white border-t border-gray-200"
                  data-testid={`accordion-content-${item.value}`}
                >
                  {item.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Tabs
      value={value}
      onValueChange={setValue}
      className={className}
      data-testid="tab-accordion-desktop"
    >
      <TabsList className="w-full justify-start">
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="flex items-center gap-2"
            data-testid={`tab-trigger-${item.value}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      
      {items.map((item) => (
        <TabsContent
          key={item.value}
          value={item.value}
          data-testid={`tab-content-${item.value}`}
        >
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default TabAccordion;
