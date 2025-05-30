import { createContext, createSignal, useContext, onMount, JSX } from "solid-js"

type Theme = "light" | "dark"

interface ThemeContextType {
  theme: () => Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>()

export function ThemeProvider(props: { children: JSX.Element }) {
  const [theme, setThemeSignal] = createSignal<Theme>("light")

  const setTheme = (newTheme: Theme) => {
    setThemeSignal(newTheme)
    localStorage.setItem("theme", newTheme)

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  const toggleTheme = () => {
    setTheme(theme() === "light" ? "dark" : "light")
  }

  onMount(() => {
    const savedTheme = localStorage.getItem("theme") as Theme
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    const initialTheme = savedTheme || systemTheme
    setTheme(initialTheme)
  })

  const value: ThemeContextType = {
    theme,
    setTheme,
    toggleTheme
  }

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
