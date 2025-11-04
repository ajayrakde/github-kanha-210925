import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:bg-primary/95 active:bg-primary/85 active:ring-2 active:ring-primary/40",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-transparent focus:ring-2 focus:ring-destructive/30 focus:ring-offset-2 focus:bg-destructive/95 active:bg-destructive/85 active:ring-2 active:ring-destructive/40",
        outline:
          "border border-gray-300 bg-background hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:bg-gray-50 active:bg-gray-100 active:ring-2 active:ring-primary/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent focus:ring-2 focus:ring-secondary/40 focus:ring-offset-2 focus:bg-secondary/90 active:bg-secondary/75 active:ring-2 active:ring-secondary/50",
        ghost: "hover:bg-gray-100 focus:bg-gray-100 focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 active:bg-gray-200 active:ring-2 active:ring-gray-300",
        link: "text-primary underline-offset-4 hover:underline focus:underline",
      },
      size: {
        default: "h-12 px-4 py-2",
        sm: "h-10 rounded-md px-3",
        lg: "h-14 rounded-md px-8",
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
