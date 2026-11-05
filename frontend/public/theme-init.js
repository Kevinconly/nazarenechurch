(() => {
  let preference = 'system'
  try {
    const saved = window.localStorage.getItem('remera-theme-preference')
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved
  } catch { /* Storage may be unavailable; use the system preference. */ }
  const systemIsDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  const resolved = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference
  document.documentElement.dataset.themePreference = preference
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#2c2e30' : '#ffffff')
})()
