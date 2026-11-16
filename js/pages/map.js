// Country map: pick a country and see who gives it more or fewer points than expected.
/* global d3 */

import { startPage, onThemeChange, segmented } from '../shared/page.js';
import { loadCountries, loadVotes, pairAverages, pairKey, minSharedFinals, signed, yearsLabel, FIRST_YEAR, LAST_YEAR } from '../shared/data.js';
import { createEuropeMap } from '../shared/europe-map.js';
import { createFavoritismScale, drawFavoritismLegend } from '../shared/favoritism-scale.js';
import { createYearRange, wirePresets } from '../shared/year-range.js';
import { createTooltip } from '../shared/tooltip.js';
import { detectCountry, countryFromHash } from '../shared/detect-country.js';

const $ = id => document.getElementById(id);

startPage(async () => {
  const [countries, votes, topology] = await Promise.all([loadCountries(), loadVotes(), d3.json('data/europe.topo.json')]);
  const nameOf = id => byId.get(id).name;
  const byId = new Map(countries.map(c => [c.id, c]));
  const known = new Set(byId.keys());

  const state = {
    focus: detectCountry(known),
    direction: 'in',        // 'in' = who favours the focus country, 'out' = who it favours
    from: FIRST_YEAR,
    to: LAST_YEAR,
    bonds: 6,               // how many of the strongest mutual pairs to draw
    bondScope: 'all',       // 'all' of Europe, or only pairs with the 'focus' country
  };

  const tooltip = createTooltip();
  let colour = createFavoritismScale();

  // Averages per year range are cached; dragging the slider revisits the same ranges a lot.
  const cache = new Map();
  function averages() {
    const key = `${state.from}-${state.to}`;
    if (!cache.has(key)) {
      if (cache.size > 60) cache.clear();
      cache.set(key, pairAverages(votes, state.from, state.to));
    }
    return cache.get(key);
  }

  /** The pair shown on country `id`, given the focus country and direction. */
  const pairFor = id => (state.direction === 'in' ? [id, state.focus] : [state.focus, id]);
  const valueFor = id => (id === state.focus ? null : averages().get(pairKey(...pairFor(id))));

  function countryTip(id) {
    if (id === state.focus) return `<b>${nameOf(id)}</b><br><span class="m">selected country</span>`;
    const [giver, receiver] = pairFor(id);
    const head = `<b>${nameOf(giver)} → ${nameOf(receiver)}</b><br>`;
    const value = valueFor(id);
    if (!value) return `${head}<span class="m">too few shared finals</span>`;
    return `${head}<span class="m">${signed(value.fav)} pts vs expected</span><br>` +
      `<span class="m">avg ${value.points.toFixed(1)} pts over ${value.finals} finals</span>`;
  }

  const map = createEuropeMap(d3.select('#map'), topology, {
    move: (e, id) => tooltip.show(e, countryTip(id)),
    leave: () => tooltip.hide(),
    click: (e, id) => setFocus(id),
  });

  // ---------- strongest bonds

  // Pairs where both directions are known, ranked by the average of the two.
  function strongestBonds() {
    const avg = averages();
    const pairs = [];
    for (const [key, there] of avg) {
      let [a, b] = key.split('>');
      if (a > b) continue;                          // each pair once
      const back = avg.get(pairKey(b, a));
      if (!back) continue;
      let ab = there.fav, ba = back.fav;
      if (state.bondScope === 'focus') {
        if (a !== state.focus && b !== state.focus) continue;
        if (b === state.focus) [a, b, ab, ba] = [b, a, ba, ab];   // focus country first
      }
      pairs.push({ a, b, ab, ba, mutual: (ab + ba) / 2 });
    }
    return pairs.sort((x, y) => d3.descending(x.mutual, y.mutual)).slice(0, state.bonds);
  }

  const samePair = (x, y) => x && y && x.a === y.a && x.b === y.b;

  // Pick out one pair: fade the other wedges and outline the two countries.
  function highlight(pair) {
    d3.select('#map').classed('bonds-dim', !!pair);
    map.overlay.selectAll('.bond').classed('is-on', d => samePair(d, pair));
    d3.selectAll('#bond-list li').classed('is-on', d => samePair(d, pair));
    map.outline(pair ? new Set([pair.a, pair.b]) : null);
  }

  // One direction of a bond as a tapered shape along a slightly bent line.
  // Tapered edges read faster than arrowheads for direction (Holten & van Wijk 2009),
  // and they don't pile up where several lines end in the same small country.
  // The two directions of a pair bend to opposite sides so both stay visible.
  function wedgePath(from, to, baseWidth) {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.max(12, Math.min(34, length * 0.16));
    const control = [(from[0] + to[0]) / 2 - dy / length * bend, (from[1] + to[1]) / 2 + dx / length * bend];
    const at = t => [
      (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t * t * to[0],
      (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t * t * to[1],
    ];
    const start = Math.min(0.3, 6 / length), end = 1 - Math.min(0.3, 7 / length);   // stay clear of the end dots
    const steps = 18, left = [], right = [];
    for (let i = 0; i <= steps; i++) {
      const s = i / steps, t = start + (end - start) * s;
      const [x, y] = at(t), [x2, y2] = at(t + 0.001);
      const l = Math.hypot(x2 - x, y2 - y) || 1, nx = -(y2 - y) / l, ny = (x2 - x) / l;
      const half = (baseWidth * (1 - s) + 0.6 * s) / 2;
      left.push([x + nx * half, y + ny * half]);
      right.push([x - nx * half, y - ny * half]);
    }
    return { outline: `M${[...left, ...right.reverse()].join('L')}Z`, centre: d3.line()(d3.range(0, 1.01, 0.1).map(s => at(start + (end - start) * s))) };
  }

  const wedgeWidth = fav => 2.5 + Math.max(0, Math.min(fav, 13)) / 13 * 9.5;   // 2.5 to 12 px at the base

  function renderBonds(bonds) {
    $('bond-scope-focus').textContent = `With ${nameOf(state.focus)}`;
    $('bond-years').textContent = `· ${yearsLabel(state.from, state.to)}`;
    $('bond-card').hidden = !state.bonds;
    $('bond-key').hidden = !state.bonds;

    const bondTip = d => `<b>${nameOf(d.a)} ⇄ ${nameOf(d.b)}</b><br>` +
      `<span class="m">${nameOf(d.a)} gives ${signed(d.ab)}</span><br><span class="m">${nameOf(d.b)} gives ${signed(d.ba)}</span>`;

    d3.select('#bond-list').selectAll('li').data(bonds.length ? bonds : [null]).join('li')
      .html(d => (d
        ? `<button type="button" data-id="${d.a}">${nameOf(d.a)} ⇄ ${nameOf(d.b)}</button>` +
          `<span class="pill" style="background:${colour(d.mutual)};color:${colour.ink(d.mutual)}">${signed(d.mutual)}</span>` +
          `<div class="dirs"><span>${d.a.toUpperCase()} gives ${signed(d.ab)}</span><span>${d.b.toUpperCase()} gives ${signed(d.ba)}</span></div>`
        : '<span class="empty">No pairs in these years</span><span></span>'))
      .on('mouseenter', (e, d) => highlight(d))
      .on('mouseleave', () => highlight(null));

    // weakest first, so the strongest pair is drawn on top
    const groups = map.overlay.selectAll('g.bond').data([...bonds].reverse(), d => `${d.a}-${d.b}`).join('g')
      .attr('class', 'bond')
      .on('mouseenter', (e, d) => highlight(d))
      .on('mousemove', (e, d) => tooltip.show(e, bondTip(d)))
      .on('mouseleave', () => { highlight(null); tooltip.hide(); })
      .on('click', (e, d) => setFocus(d.a === state.focus ? d.b : d.a));
    groups.selectAll('*').remove();
    groups.each(function (d) {
      const g = d3.select(this), pa = map.position[d.a], pb = map.position[d.b];
      for (const [from, to, fav] of [[pa, pb, d.ab], [pb, pa, d.ba]]) {
        const width = wedgeWidth(fav), shape = wedgePath(from, to, width);
        g.append('path').attr('class', 'wedge').attr('d', shape.outline);
        g.append('path').attr('class', 'hit').attr('d', shape.centre).attr('stroke-width', Math.max(12, width + 6));
      }
      for (const p of [pa, pb]) g.append('circle').attr('class', 'end').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3);
    });
  }

  // ---------- everything that follows the state

  function render() {
    tooltip.hide();
    const focus = state.focus, name = nameOf(focus), incoming = state.direction === 'in';
    const bonds = state.bonds ? strongestBonds() : [];

    map.paint({
      fill: id => (id === focus ? 'var(--fg)' : valueFor(id) ? colour(valueFor(id).fav) : null),
      ink: id => (id === focus ? 'var(--bg)' : valueFor(id) ? colour.ink(valueFor(id).fav) : 'var(--muted)'),
    });
    map.markSelected(focus);
    map.lowerLabels(new Set(bonds.flatMap(d => [d.a, d.b])));

    const needed = minSharedFinals(state.from, state.to);
    $('hatch-text').textContent = needed > 1 ? `Fewer than ${needed} shared finals` : 'No shared final in these years';
    $('map-title').textContent = incoming ? `Who favours ${name}?` : `Who does ${name} favour?`;
    $('map-years').textContent = yearsLabel(state.from, state.to);
    $('top-heading').textContent = incoming ? `Biggest fans of ${name}` : `${name}'s favourites`;
    $('low-heading').textContent = incoming ? `Least keen on ${name}` : `${name} gives least to`;

    const ranked = countries.map(c => ({ id: c.id, value: valueFor(c.id) })).filter(d => d.value)
      .sort((a, b) => d3.descending(a.value.fav, b.value.fav));
    const fillList = (id, rows) => d3.select(id).selectAll('li').data(rows.length ? rows : [null]).join('li')
      .html(d => (d
        ? `<button type="button" data-id="${d.id}">${nameOf(d.id)}</button>` +
          `<span class="pill" style="background:${colour(d.value.fav)};color:${colour.ink(d.value.fav)}">${signed(d.value.fav)}</span>`
        : '<span class="empty">No pairs in this period</span><span></span>'));
    fillList('#top', ranked.slice(0, 5));
    fillList('#low', ranked.slice(-3).reverse());

    renderBonds(bonds);
  }

  function setFocus(id) {
    state.focus = id;
    $('focus').value = id;
    render();
  }

  // ---------- controls

  const select = $('focus');
  [...countries].sort((a, b) => a.name.localeCompare(b.name)).forEach(c => select.add(new Option(c.name, c.id)));
  select.value = state.focus;
  select.addEventListener('change', () => setFocus(select.value));

  segmented($('direction'), value => { state.direction = value; render(); });
  segmented($('bond-scope'), value => { state.bondScope = value; render(); });

  $('bonds').addEventListener('input', e => {
    state.bonds = +e.target.value;
    $('bonds-value').textContent = state.bonds;
    render();
  });

  const markPreset = wirePresets($('presets'), (from, to) => { slider.set(from, to); setYears(from, to); });
  let frame = 0;
  function setYears(from, to) {
    state.from = from;
    state.to = to;
    $('years-value').textContent = yearsLabel(from, to) + (from === 2020 && to === 2020 ? ' (no contest)' : '');
    markPreset(from, to);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);   // one redraw per frame while dragging
  }
  const slider = createYearRange($('years'), {
    years: d3.range(FIRST_YEAR, LAST_YEAR + 1), from: state.from, to: state.to, onChange: setYears,
  });
  markPreset(state.from, state.to);

  // names in the side lists select that country
  document.querySelector('.side').addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if (btn) setFocus(btn.dataset.id);
  });
  addEventListener('hashchange', () => { const id = countryFromHash(known); if (id) setFocus(id); });

  function drawLegend() { drawFavoritismLegend(d3.select('#legend'), colour); }
  onThemeChange(() => { colour = createFavoritismScale(); drawLegend(); render(); });
  drawLegend();
  render();
});
