import { cn } from "@/lib/utils";

export interface StoryCircleProps {
  label: string;
  gradient: string;
  image?: string;
  onClick?: () => void;
  active?: boolean;
}

export function StoryCircle({
  label,
  gradient,
  image,
  onClick,
  active = false,
}: StoryCircleProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 flex-shrink-0 group"
      data-testid={`story-circle-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div
        className={cn(
          "w-12 h-12 rounded-full p-0.5 bg-gradient-to-br transition-transform group-active:scale-95",
          gradient,
          active && "ring-1 ring-offset-1 ring-primary"
        )}
      >
        <div className="w-full h-full rounded-full bg-white p-0.5">
          <div
            className={cn(
              "w-full h-full rounded-full flex items-center justify-center text-lg bg-gradient-to-br",
              gradient,
              image && "bg-cover bg-center"
            )}
            style={image ? { backgroundImage: `url(${image})` } : undefined}
          >
            {!image && label.charAt(0)}
          </div>
        </div>
      </div>
      <span className="text-[9px] font-medium text-gray-700 max-w-[48px] truncate leading-tight">
        {label}
      </span>
    </button>
  );
}

export interface StoryCirclesProps {
  items: Array<{
    id: string;
    label: string;
    gradient: string;
    image?: string;
    onClick?: () => void;
  }>;
  activeId?: string;
  className?: string;
}

export function StoryCircles({ items, activeId, className }: StoryCirclesProps) {
  return (
    <div
      className={cn(
        "flex gap-2.5 overflow-x-auto pb-1.5 px-2 scrollbar-hide md:hidden",
        className
      )}
      data-testid="story-circles-container"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {items.map((item) => (
        <StoryCircle
          key={item.id}
          label={item.label}
          gradient={item.gradient}
          image={item.image}
          onClick={item.onClick}
          active={activeId === item.id}
        />
      ))}
    </div>
  );
}

export default StoryCircles;
