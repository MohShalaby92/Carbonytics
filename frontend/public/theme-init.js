/**
 * Pre-paint theme application (CSP-safe, no inline script).
 * Runs before React mounts to avoid a flash of the wrong theme.
 * Must stay in sync with src/hooks/useTheme.tsx (same storage key + .dark class).
 */
(function () {
  try {
    var KEY = 'carbonytics-theme';
    var stored = localStorage.getItem(KEY);
    var theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  } catch (e) {
    /* no-op: ThemeProvider will apply the theme on mount */
  }
})();
