import { Plus, Minus } from "lucide-react";

interface ProductActionProps {
  quantity: number;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  isAddPending?: boolean;
  isUpdatePending?: boolean;
  maxQuantity?: number;
  productName: string;
  productId: string;
}

export default function ProductAction({
  quantity,
  onAdd,
  onIncrease,
  onDecrease,
  isAddPending = false,
  isUpdatePending = false,
  maxQuantity = 10,
  productName,
  productId,
}: ProductActionProps) {
  const sharedShellClasses = `
    rounded-md h-5 md:h-7 w-[58px] md:w-[72px] min-w-[58px] md:min-w-[72px] max-w-[58px] md:max-w-[72px]
    flex items-center justify-center
    bg-primary text-white border border-transparent transition-all outline-none
    focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-primary
    active:scale-95 active:shadow-[0_0_8px_rgba(255,255,255,0.35)]
    disabled:opacity-50 disabled:active:scale-100 disabled:active:shadow-none
  `.trim().replace(/\s+/g, ' ');

  const iconButtonClasses = `
    h-4 w-4 md:h-5 md:w-5 rounded bg-white/20 hover:bg-white/30
    flex items-center justify-center transition-all flex-shrink-0
    outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-primary
    active:scale-95 active:shadow-[0_0_8px_rgba(255,255,255,0.4)]
    disabled:opacity-50 disabled:active:scale-100 disabled:active:shadow-none
  `.trim().replace(/\s+/g, ' ');

  if (quantity > 0) {
    return (
      <div className={`${sharedShellClasses} gap-0.5 px-0.5`}>
        <button
          type="button"
          className={iconButtonClasses}
          onClick={onDecrease}
          disabled={isUpdatePending}
          data-testid={`button-decrease-quantity-${productId}`}
          aria-label={`Decrease quantity of ${productName}`}
        >
          <Minus size={10} className="text-white md:scale-110" />
        </button>
        <span 
          className="flex-1 text-center font-bold text-[10px] md:text-xs text-white" 
          data-testid={`cart-quantity-${productId}`}
        >
          {quantity}
        </span>
        <button
          type="button"
          className={iconButtonClasses}
          onClick={onIncrease}
          disabled={isUpdatePending || quantity >= maxQuantity}
          data-testid={`button-increase-quantity-${productId}`}
          aria-label={`Increase quantity of ${productName}`}
        >
          <Plus size={10} className="text-white md:scale-110" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${sharedShellClasses} font-medium text-[10px] md:text-xs`}
      onClick={onAdd}
      disabled={isAddPending}
      data-testid={`button-add-to-cart-${productId}`}
      aria-label={`Add ${productName} to cart`}
    >
      Add
    </button>
  );
}
