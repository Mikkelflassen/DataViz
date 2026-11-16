// "?" help buttons.
//
// Markup:
//   <button type="button" class="help" aria-label="..." aria-controls="h-x" aria-expanded="false">?</button>
//   <div class="help-pop" id="h-x" role="tooltip" hidden>...</div>
//
// Hover or keyboard focus shows the text. A click or tap pins it open.
// Esc, a second click, or a click somewhere else closes it.

export function initHelp() {
  let open = null;
  let pinned = false;

  const popFor = btn => document.getElementById(btn.getAttribute('aria-controls'));
  const helpButton = target => target.closest?.('.help');
  const canHover = () => matchMedia('(hover: hover)').matches;

  function place(btn, pop) {
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = Math.min(340, innerWidth - 24);
    pop.style.width = `${w}px`;
    const x = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
    const h = pop.offsetHeight;
    let y = r.bottom + 8;
    if (y + h > innerHeight - 8 && r.top - h - 8 > 8) y = r.top - h - 8;   // flip above if there is no room below
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
  }

  function show(btn, pin) {
    const pop = popFor(btn);
    if (!pop) return;
    if (open && open !== btn) hide();
    open = btn;
    pinned = pin;
    btn.setAttribute('aria-expanded', 'true');
    place(btn, pop);
  }

  function hide() {
    if (!open) return;
    const pop = popFor(open);
    if (pop) pop.hidden = true;
    open.setAttribute('aria-expanded', 'false');
    open = null;
    pinned = false;
  }

  document.addEventListener('mouseover', e => {
    const btn = helpButton(e.target);
    if (btn && canHover() && !pinned) show(btn, false);
  });
  document.addEventListener('mouseout', e => {
    const btn = helpButton(e.target);
    if (btn && btn === open && !pinned && !btn.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('click', e => {
    const btn = helpButton(e.target);
    if (btn) {
      e.preventDefault();
      if (open === btn && pinned) hide(); else show(btn, true);
    } else if (open && !e.target.closest?.('.help-pop')) {
      hide();
    }
  });
  document.addEventListener('focusin', e => {
    const btn = helpButton(e.target);
    if (btn && !pinned) show(btn, false);
  });
  document.addEventListener('focusout', e => {
    const btn = helpButton(e.target);
    if (btn && btn === open && !pinned) hide();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', () => { if (open) place(open, popFor(open)); }, { passive: true });
  addEventListener('resize', hide);
}
