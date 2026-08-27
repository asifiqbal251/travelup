import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

// Used for the continuous trip-length control. Discrete snap sliders live in
// src/components/SnapSlider.jsx. Teal active track, ~44px touch height. Pass
// `dark` for use on navy/cinema surfaces (translucent track + light thumb).
const Slider = React.forwardRef(({ className, dark = false, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center min-h-11 py-2", className)}
    {...props}>
    <SliderPrimitive.Track className={cn("relative h-2 w-full grow overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-muted")} />
    <SliderPrimitive.Range className="absolute h-full bg-teal" />
    <SliderPrimitive.Thumb className={cn(
      "block h-6 w-6 rounded-full border-2 shadow-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      dark
        ? "border-teal bg-on-dark focus-visible:ring-teal focus-visible:ring-offset-cinema"
        : "border-on-dark bg-ink focus-visible:ring-ink focus-visible:ring-offset-workflow"
    )} />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }