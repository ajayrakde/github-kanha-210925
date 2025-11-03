import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded text-sm font-semibold transition-all focus-visible:outline-none focus:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent focus:shadow-[0_0_0_3px_rgba(11,111,167,0.2)] active:shadow-[0_0_0_3px_rgba(11,111,167,0.3)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-transparent focus:shadow-[0_0_0_3px_rgba(255,89,94,0.2)] active:shadow-[0_0_0_3px_rgba(255,89,94,0.3)]",
        outline:
          "border border-gray-300 bg-background hover:bg-gray-50 hover:border-gray-400 focus:shadow-[0_0_0_3px_rgba(11,111,167,0.15)] active:bg-gray-100",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent focus:shadow-[0_0_0_3px_rgba(255,217,61,0.3)] active:shadow-[0_0_0_3px_rgba(255,217,61,0.4)]",
        ghost: "hover:bg-gray-100 focus:bg-gray-100 active:bg-gray-200",
        link: "text-primary underline-offset-4 hover:underline focus:underline",
      },
      size: {
        default: "h-12 px-4 py-2",
        sm: "h-10 rounded px-3",
        lg: "h-12 rounded px-8",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Keeps button text on a single line when `true`.
   */
  noWrap?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, noWrap = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), noWrap && "whitespace-nowrap", className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
