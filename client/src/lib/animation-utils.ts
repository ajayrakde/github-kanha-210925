export interface FlyToCartOptions {
  fromElement: HTMLElement;
  toElement: HTMLElement;
  onComplete?: () => void;
  duration?: number;
}

export function flyToCart(options: FlyToCartOptions): void {
  const { fromElement, toElement, onComplete, duration = 800 } = options;

  // Get positions
  const fromRect = fromElement.getBoundingClientRect();
  const toRect = toElement.getBoundingClientRect();

  // Create flying element (clone of product image)
  const flyingElement = fromElement.cloneNode(true) as HTMLElement;
  flyingElement.style.position = "fixed";
  flyingElement.style.left = `${fromRect.left}px`;
  flyingElement.style.top = `${fromRect.top}px`;
  flyingElement.style.width = `${fromRect.width}px`;
  flyingElement.style.height = `${fromRect.height}px`;
  flyingElement.style.zIndex = "9999";
  flyingElement.style.pointerEvents = "none";
  flyingElement.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  
  document.body.appendChild(flyingElement);

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    flyingElement.style.left = `${toRect.left + toRect.width / 2}px`;
    flyingElement.style.top = `${toRect.top + toRect.height / 2}px`;
    flyingElement.style.width = "0px";
    flyingElement.style.height = "0px";
    flyingElement.style.opacity = "0";
  });

  // Clean up after animation
  setTimeout(() => {
    flyingElement.remove();
    onComplete?.();
  }, duration);
}

export function pulseElement(element: HTMLElement | null, options: {
  scale?: number;
  duration?: number;
  color?: string;
} = {}): void {
  if (!element) return;

  const { scale = 1.1, duration = 300, color } = options;
  const originalTransform = element.style.transform;
  const originalBackground = element.style.backgroundColor;

  element.style.transition = `transform ${duration}ms ease-out, background-color ${duration}ms ease-out`;
  element.style.transform = `scale(${scale})`;
  
  if (color) {
    element.style.backgroundColor = color;
  }

  setTimeout(() => {
    element.style.transform = originalTransform;
    element.style.backgroundColor = originalBackground;
    
    setTimeout(() => {
      element.style.transition = "";
    }, duration);
  }, duration);
}

export function bounceElement(element: HTMLElement | null, options: {
  intensity?: number;
  duration?: number;
} = {}): void {
  if (!element) return;

  const { intensity = 10, duration = 500 } = options;
  const originalTransform = element.style.transform;

  element.style.transition = `transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`;
  element.style.transform = `translateY(-${intensity}px)`;

  setTimeout(() => {
    element.style.transform = originalTransform;
    
    setTimeout(() => {
      element.style.transition = "";
    }, duration);
  }, duration / 2);
}

export function slideIn(element: HTMLElement | null, options: {
  from?: "left" | "right" | "top" | "bottom";
  duration?: number;
  distance?: number;
} = {}): void {
  if (!element) return;

  const { from = "bottom", duration = 300, distance = 20 } = options;
  
  const transforms: Record<typeof from, string> = {
    left: `translateX(-${distance}px)`,
    right: `translateX(${distance}px)`,
    top: `translateY(-${distance}px)`,
    bottom: `translateY(${distance}px)`,
  };

  element.style.opacity = "0";
  element.style.transform = transforms[from];
  element.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`;

  requestAnimationFrame(() => {
    element.style.opacity = "1";
    element.style.transform = "translate(0, 0)";
  });
}

export function slideOut(element: HTMLElement | null, options: {
  to?: "left" | "right" | "top" | "bottom";
  duration?: number;
  distance?: number;
  onComplete?: () => void;
} = {}): void {
  if (!element) return;

  const { to = "bottom", duration = 300, distance = 20, onComplete } = options;
  
  const transforms: Record<typeof to, string> = {
    left: `translateX(-${distance}px)`,
    right: `translateX(${distance}px)`,
    top: `translateY(-${distance}px)`,
    bottom: `translateY(${distance}px)`,
  };

  element.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`;
  element.style.opacity = "0";
  element.style.transform = transforms[to];

  setTimeout(() => {
    onComplete?.();
  }, duration);
}

export function fadeIn(element: HTMLElement | null, duration = 300): void {
  if (!element) return;

  element.style.opacity = "0";
  element.style.transition = `opacity ${duration}ms ease-out`;

  requestAnimationFrame(() => {
    element.style.opacity = "1";
  });
}

export function fadeOut(element: HTMLElement | null, options: {
  duration?: number;
  onComplete?: () => void;
} = {}): void {
  if (!element) return;

  const { duration = 300, onComplete } = options;
  
  element.style.transition = `opacity ${duration}ms ease-out`;
  element.style.opacity = "0";

  setTimeout(() => {
    onComplete?.();
  }, duration);
}

export function shake(element: HTMLElement | null, options: {
  intensity?: number;
  duration?: number;
} = {}): void {
  if (!element) return;

  const { intensity = 10, duration = 500 } = options;
  const keyframes = [
    { transform: "translateX(0)" },
    { transform: `translateX(-${intensity}px)` },
    { transform: `translateX(${intensity}px)` },
    { transform: `translateX(-${intensity}px)` },
    { transform: `translateX(${intensity}px)` },
    { transform: "translateX(0)" },
  ];

  element.animate(keyframes, {
    duration,
    easing: "ease-in-out",
  });
}

export function hapticFeedback(type: "light" | "medium" | "heavy" = "light"): void {
  if (!("vibrate" in navigator)) return;

  const patterns = {
    light: 10,
    medium: 20,
    heavy: 30,
  };

  navigator.vibrate(patterns[type]);
}

export function addRippleEffect(element: HTMLElement, event: React.MouseEvent | MouseEvent): void {
  const rect = element.getBoundingClientRect();
  const x = (event as MouseEvent).clientX - rect.left;
  const y = (event as MouseEvent).clientY - rect.top;

  const ripple = document.createElement("span");
  ripple.style.position = "absolute";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.width = "0";
  ripple.style.height = "0";
  ripple.style.borderRadius = "50%";
  ripple.style.backgroundColor = "rgba(255, 255, 255, 0.6)";
  ripple.style.transform = "translate(-50%, -50%)";
  ripple.style.pointerEvents = "none";
  ripple.style.transition = "width 0.6s, height 0.6s, opacity 0.6s";
  ripple.style.opacity = "1";

  element.style.position = "relative";
  element.style.overflow = "hidden";
  element.appendChild(ripple);

  requestAnimationFrame(() => {
    const size = Math.max(rect.width, rect.height) * 2;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.opacity = "0";
  });

  setTimeout(() => {
    ripple.remove();
  }, 600);
}
