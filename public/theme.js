/* Site appearance is independent of card colors and profile/image state. */
(() => {
  'use strict';
  const storageKey = 'wp-profile-cards-theme';
  const valid = value => ['system', 'light', 'dark'].includes(value);
  const media = matchMedia('(prefers-color-scheme: dark)');
  const systemTheme = () => media.matches ? 'dark' : 'light';
  let theme = 'system';
  let button;
  try {
    const saved = localStorage.getItem(storageKey);
    if (valid(saved)) theme = saved;
  } catch (_) { /* Storage may be blocked; CSS still follows the OS. */ }
  const effectiveTheme = () => theme === 'system' ? systemTheme() : theme;
  function reflectAction() {
    if (!button) return;
    const target = effectiveTheme() === 'dark' ? 'light' : 'dark';
    const action = `Switch to ${target} site appearance`;
    button.dataset.targetTheme = target;
    button.setAttribute('aria-label', action);
    button.title = action;
  }
  const apply = value => {
    theme = valid(value) ? value : 'system';
    document.documentElement.dataset.theme = theme;
    reflectAction();
  };
  apply(theme); // Runs in the head before the stylesheet and builder app.
  function connect() {
    button = document.getElementById('site-theme');
    const control = document.getElementById('site-theme-control');
    if (!button || !control) return;
    reflectAction();
    button.addEventListener('click', () => {
      const target = effectiveTheme() === 'dark' ? 'light' : 'dark';
      // Returning to the OS appearance restores following, not a fixed override.
      apply(target === systemTheme() ? 'system' : target);
      try { localStorage.setItem(storageKey, theme); }
      catch (_) { /* The in-page choice still works without persistence. */ }
    });
    media.addEventListener('change', reflectAction);
    addEventListener('storage', event => {
      if (event.key !== storageKey && event.key !== null) return;
      apply(event.newValue);
    });
    control.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect, { once: true });
  else connect();
})();
