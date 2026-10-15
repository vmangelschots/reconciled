import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'reconciled-theme' // 'light' | 'dark'; absent = no explicit choice yet

function getSystemPreference() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredChoice() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeProvider({ children }) {
  const [explicitChoice, setExplicitChoice] = useState(() => getStoredChoice())
  const [systemPreference, setSystemPreference] = useState(() => getSystemPreference())

  const resolvedTheme = explicitChoice ?? systemPreference

  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  // Live-update when the OS preference changes, but only while the user
  // hasn't made an explicit choice - per the ui-shell spec.
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange(event) {
      setSystemPreference(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  function setTheme(theme) {
    setExplicitChoice(theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // best-effort persistence only
    }
  }

  return (
    <ThemeContext.Provider value={{ theme: resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
