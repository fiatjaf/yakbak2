import { type Component, type ComponentProps, splitProps } from "solid-js"

import { cn } from "../utils"

const Label: Component<ComponentProps<"label">> = props => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <label
      class={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        local.class
      )}
      {...others}
    />
  )
}

export { Label }
