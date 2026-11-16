// Two-handle year slider built from two overlapping <input type="range">.
//
//   <div class="range" id="years" role="group" aria-labelledby="..."></div>
//
// `years` is the list of selectable years. Passing a list instead of min/max lets a page
// skip years (the jury page has no 2020). The handles can't cross, and `minSteps` keeps
// them a number of steps apart.

export function createYearRange(root, { years, from, to, minSteps = 0, onChange }) {
  root.innerHTML = `
    <div class="track"></div><div class="fill"></div>
    <input type="range" min="0" max="${years.length - 1}" step="1" aria-label="From year">
    <input type="range" min="0" max="${years.length - 1}" step="1" aria-label="To year">`;
  const fill = root.querySelector('.fill');
  const [lo, hi] = root.querySelectorAll('input');
  const last = years.length - 1;
  let a = years.indexOf(from);
  let b = years.indexOf(to);

  function paint() {
    lo.value = a;
    hi.value = b;
    fill.style.left = `calc(9px + ${a / last} * (100% - 18px))`;
    fill.style.width = `calc(${(b - a) / last} * (100% - 18px))`;
    lo.style.zIndex = a > last * 0.8 ? 3 : 1;   // keep the left handle grabbable when both sit at the far right
  }

  function moved(which) {
    a = +lo.value;
    b = +hi.value;
    if (b - a < minSteps) {
      if (which === lo) { a = Math.min(a, last - minSteps); b = a + minSteps; }
      else { b = Math.max(b, minSteps); a = b - minSteps; }
    }
    paint();
    onChange(years[a], years[b]);
  }

  lo.addEventListener('input', () => moved(lo));
  hi.addEventListener('input', () => moved(hi));
  paint();

  return {
    /** Move the handles from code (presets). Does not call onChange. */
    set(fromYear, toYear) { a = years.indexOf(fromYear); b = years.indexOf(toYear); paint(); },
  };
}

// Preset buttons: <div class="presets"><button data-range="1957-2023">All</button>…</div>
export function wirePresets(root, onPick) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-range]');
    if (btn) onPick(...btn.dataset.range.split('-').map(Number));
  });
  return (fromYear, toYear) => root.querySelectorAll('button').forEach(btn =>
    btn.setAttribute('aria-pressed', String(btn.dataset.range === `${fromYear}-${toYear}`)));
}
