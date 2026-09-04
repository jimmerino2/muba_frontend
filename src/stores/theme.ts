import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'wayfare-theme'

/**
 * Mirrors the choice the inline script in index.html already applied to
 * `<html data-theme>` before Vue mounted (avoiding a flash of the wrong
 * theme) — this store just gives the rest of the app a reactive handle on
 * that same state, and keeps `<html>` + localStorage in sync when it changes.
 */
export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(
    (document.documentElement.dataset.theme as ThemeMode | undefined) ??
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  )

  function apply(next: ThemeMode) {
    mode.value = next
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage blocked (private mode, quota) — the theme still applies for this load.
    }
  }

  function toggle() {
    apply(mode.value === 'dark' ? 'light' : 'dark')
  }

  return { mode, toggle, apply }
})
