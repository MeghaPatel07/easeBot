import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border-0 bg-white/[0.04] px-3 py-2 text-base text-soft ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/10 focus-visible:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
