export type ScrollContext =
  // Success states
  | "payment-success"
  | "coupon-applied"
  | "address-saved"
  | "item-added-to-cart-mobile"
  | "item-added-to-cart-desktop"
  | "order-placed"
  | "order-confirmation"
  
  // Failure states
  | "payment-failed"
  | "payment-timeout"
  | "coupon-invalid"
  | "out-of-stock"
  | "checkout-error"
  
  // Warning/validation states
  | "form-error"
  | "pincode-invalid"
  | "stock-warning"
  | "minimum-order-not-met"
  | "address-incomplete"
  
  // Loading/processing states
  | "payment-processing"
  | "otp-verification"
  | "pincode-checking"
  
  // Navigation contexts
  | "products-from-cart"
  | "cart-from-products"
  | "checkout-continue";

const SCROLL_TARGETS: Record<ScrollContext, string> = {
  // Success states - show the result
  "payment-success": "#order-confirmation, #payment-status, main",
  "coupon-applied": "#order-total-mobile, #cart-summary-mobile, #order-total-desktop, #cart-summary-desktop, #pricing-section",
  "address-saved": "#continue-button, #payment-section, #checkout-actions",
  "item-added-to-cart-mobile": "#sticky-cart-bar, #mobile-cart",
  "item-added-to-cart-desktop": "#cart-summary, #cart-icon",
  "order-placed": "#order-confirmation, #order-details",
  "order-confirmation": "#order-confirmation, #order-details, main",
  
  // Failure states - show the error and action
  "payment-failed": "#retry-section, #payment-error, #error-message",
  "payment-timeout": "#try-again-button, #payment-retry, #retry-section",
  "coupon-invalid": "#coupon-input-mobile, #coupon-input-desktop, #coupon-error, .error-message",
  "out-of-stock": "#alternative-products, #product-suggestions, #continue-shopping",
  "checkout-error": "#error-message, #retry-checkout, main",
  
  // Warning states - scroll to the problem
  "form-error": ".error-message:first-of-type, [aria-invalid=true]:first-of-type, .text-destructive:first-of-type",
  "pincode-invalid": "#pincode-input, [name=pincode], #delivery-form",
  "stock-warning": "#quantity-selector, #stock-message, .stock-warning",
  "minimum-order-not-met": "#add-more-button, #continue-shopping, #product-suggestions",
  "address-incomplete": "[aria-invalid=true]:first-of-type, .error-message:first-of-type, #address-form",
  
  // Loading states - keep the status visible
  "payment-processing": "#payment-status, #processing-indicator, #status-message",
  "otp-verification": "#otp-input, #verification-section, #otp-form",
  "pincode-checking": "#pincode-input, #pincode-status, #delivery-check",
  
  // Navigation contexts - land where user intends
  "products-from-cart": "#product-grid, #products-section, main",
  "cart-from-products": "#cart-items, #cart-summary, main",
  "checkout-continue": "#payment-section, #checkout-form, main",
};

export interface ScrollOptions {
  smooth?: boolean;
  offset?: number;
  behavior?: ScrollBehavior;
}

function isMobileDevice(): boolean {
  return window.innerWidth < 768;
}

export function scrollToContext(
  context: ScrollContext,
  options: ScrollOptions = {}
): boolean {
  const targetSelectors = SCROLL_TARGETS[context];
  if (!targetSelectors) {
    console.warn(`No scroll target defined for context: ${context}`);
    return false;
  }

  // Try multiple selectors (first visible one wins)
  const selectors = targetSelectors.split(",").map((s) => s.trim());
  let element: HTMLElement | null = null;

  for (const selector of selectors) {
    const candidate = document.querySelector(selector) as HTMLElement | null;
    // Check if element exists AND is visible (not display:none or hidden)
    if (candidate && candidate.offsetHeight > 0 && candidate.offsetWidth > 0) {
      element = candidate;
      break;
    }
  }

  if (!element) {
    console.warn(`No visible element found for context: ${context}, tried: ${selectors.join(", ")}`);
    return false;
  }

  // Calculate smart offset
  const defaultOffset = isMobileDevice() ? 80 : 20; // Account for sticky elements on mobile
  const offset = options.offset ?? defaultOffset;

  const elementPosition = element.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - offset;

  window.scrollTo({
    top: Math.max(0, offsetPosition),
    behavior: options.smooth !== false ? "smooth" : "auto",
  });

  // Focus the element if it's an input for accessibility
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    setTimeout(() => {
      element.focus({ preventScroll: true });
    }, 300);
  }

  return true;
}

export function scrollToTop(smooth = true): void {
  window.scrollTo({
    top: 0,
    behavior: smooth ? "smooth" : "auto",
  });
}

export function scrollToBottom(smooth = true): void {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

export function scrollToElement(
  element: HTMLElement | null,
  options: ScrollOptions = {}
): boolean {
  if (!element) return false;

  const defaultOffset = isMobileDevice() ? 80 : 20;
  const offset = options.offset ?? defaultOffset;

  const elementPosition = element.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - offset;

  window.scrollTo({
    top: Math.max(0, offsetPosition),
    behavior: options.smooth !== false ? "smooth" : "auto",
  });

  return true;
}
