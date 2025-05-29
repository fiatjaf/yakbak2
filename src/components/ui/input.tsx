import { ComponentProps } from "solid-js"

import { cn } from "../utils"

const Input = (props: ComponentProps<"input">) => {
  const cls = () =>
    cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm mt-2",
      props.class
    )

  return <input ref={props.ref} {...props} class={cls()} />
}

export { Input }
