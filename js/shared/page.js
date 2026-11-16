// What every page does first: top bar, help buttons, and a visible message if the data can't load.

import { renderTopbar } from './nav.js';
import { initHelp } from './help.js';

export function startPage(main) {
  renderTopbar();
  initHelp();
  main().catch(err => {
    console.error(err);
    const box = document.createElement('p');
    box.className = 'stage error';
    box.textContent = location.protocol === 'file:'
      ? 'The data files could not be loaded. Open the site through a local server (VS Code "Open with Live Server", or python3 -m http.server) instead of double-clicking the file.'
      : `Something went wrong while loading the page: ${err.message}`;
    document.querySelector('main')?.prepend(box);
  });
}

// Read a colour (or any custom property) from the stylesheet.
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Run fn again when the colour theme changes, for the few colours that are computed in JS.
export function onThemeChange(fn) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// Segmented buttons (<div class="seg">): keeps aria-pressed in sync and reports the pressed button's data-value.
export function segmented(root, onChange) {
  const buttons = [...root.querySelectorAll('button')];
  root.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    onChange(btn.dataset.value);
  });
}
