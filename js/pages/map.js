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
    bonds: 8,               // how many of the strongest mutual pairs to list
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
    enter: (e, id) => highlightCountry(id),
    move: (e, id) => tooltip.show(e, countryTip(id)),
    leave: () => { highlightCountry(null); tooltip.hide(); },
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

  // The pairs are drawn as a paired bar chart next to the map, not as lines on it.
  //
  // Each row is one pair. The first country's name is on the left and the second's on the
  // right, and each country's bar grows from the middle toward its own name: the bar under
  // a name is what that country gives the other. All bars share one scale that starts at
  // zero, so the strongest and the weakest pair on the list can be compared by length, and
  // a one-sided friendship shows up as one long and one short bar.
  //
  // Lines on the map had three problems: they crossed each other where many pairs meet (the
  // Balkans), they competed with the map colours, and line width or arrow size is a weak way
  // to compare amounts. Length from a shared baseline is about the most accurate one there is
  // (Mackinlay 1986, lecture 9). The map still shows where a pair is: hover a row and the two
  // countries are picked out, hover a country and its pairs are picked out in the chart.

  const CHART_WIDTH = 320, ROW = 44, TOP = 44;
  const samePair = (x, y) => x && y && x.a === y.a && x.b === y.b;
  let shownBonds = [];

  // one pair in focus: outlined on the map with everything else dimmed, and its row picked out
  function highlightPair(pair) {
    map.outline(pair ? new Set([pair.a, pair.b]) : null);
    map.spotlight(pair ? new Set([pair.a, pair.b]) : null);
    d3.select('#bond-chart').classed('has-focus', !!pair);
    d3.selectAll('#bond-chart .pair').classed('is-on', d => samePair(d, pair));
  }

  // hovering a country on the map picks out the pairs it is part of
  function highlightCountry(id) {
    const involved = d => !!id && (d.a === id || d.b === id);
    d3.select('#bond-chart').classed('has-focus', !!id && shownBonds.some(involved));
    d3.selectAll('#bond-chart .pair').classed('is-on', involved);
  }

  function renderBonds(bonds) {
    shownBonds = bonds;
    $('bond-scope-focus').textContent = `With ${nameOf(state.focus)}`;
    $('bond-years').textContent = yearsLabel(state.from, state.to);
    $('bond-card').hidden = !state.bonds;

    const svg = d3.select('#bond-chart');
    svg.selectAll('*').remove();
    if (!bonds.length) {
      svg.attr('viewBox', `0 0 ${CHART_WIDTH} 30`);
      svg.append('text').attr('class', 'empty-note').attr('y', 18).text('No pairs in these years');
      return;
    }

    const mid = CHART_WIDTH / 2, half = mid - 34;   // room for the value at the end of the longest bar
    const max = Math.max(5, d3.max(bonds, d => Math.max(d.ab, d.ba)));
    const length = d3.scaleLinear([0, max], [0, half]).nice();
    const height = TOP + bonds.length * ROW + 4;
    svg.attr('viewBox', `0 0 ${CHART_WIDTH} ${height}`);

    // scale: faint lines every few points on both sides, numbers along the top
    const ticks = length.ticks(3).filter(t => t > 0);
    const grid = svg.append('g').attr('class', 'grid');
    for (const t of ticks) {
      for (const x of [mid - length(t), mid + length(t)]) {
        grid.append('line').attr('x1', x).attr('x2', x).attr('y1', TOP - 5).attr('y2', height - 2);
        grid.append('text').attr('class', 'tick-label').attr('x', x).attr('y', TOP - 9).attr('text-anchor', 'middle').text(`+${t}`);
      }
    }
    svg.append('text').attr('class', 'tick-label').attr('x', 0).attr('y', 10).text('← gives');
    svg.append('text').attr('class', 'tick-label').attr('x', CHART_WIDTH).attr('y', 10).attr('text-anchor', 'end').text('gives →');
    svg.append('text').attr('class', 'tick-label').attr('x', mid).attr('y', 10).attr('text-anchor', 'middle').text('points vs expected');

    const rowTip = (d, i) => `<b>${i + 1}. ${nameOf(d.a)} ⇄ ${nameOf(d.b)}</b><br>` +
      `<span class="m">${nameOf(d.a)} gives ${signed(d.ab)}</span><br><span class="m">${nameOf(d.b)} gives ${signed(d.ba)}</span><br>` +
      `<span class="m">average ${signed(d.mutual)}</span>`;

    const rows = svg.append('g').selectAll('g').data(bonds).join('g')
      .attr('class', 'pair').attr('transform', (d, i) => `translate(0,${TOP + i * ROW})`)
      .attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', (d, i) => `${i + 1}. ${nameOf(d.a)} gives ${signed(d.ab)}, ${nameOf(d.b)} gives ${signed(d.ba)}`)
      .on('mouseenter focus', (e, d) => highlightPair(d))
      .on('mousemove', (e, d) => tooltip.show(e, rowTip(d, bonds.indexOf(d))))
      .on('mouseleave blur', () => { highlightPair(null); tooltip.hide(); })
      .on('click keydown', (e, d) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        setFocus(d.a === state.focus ? d.b : d.a);
      });

    rows.append('rect').attr('class', 'row-bg').attr('x', -4).attr('y', 0).attr('width', CHART_WIDTH + 8).attr('height', ROW - 4).attr('rx', 6);
    // line 1: rank and the two names, each on the side its bar grows toward
    rows.append('text').attr('class', 'rank-no').attr('x', mid).attr('y', 14).attr('text-anchor', 'middle').text((d, i) => i + 1);
    rows.append('text').attr('class', 'pair-name').attr('x', 2).attr('y', 14).text(d => nameOf(d.a));
    rows.append('text').attr('class', 'pair-name').attr('x', CHART_WIDTH - 2).attr('y', 14).attr('text-anchor', 'end').text(d => nameOf(d.b));

    // line 2: the two bars from the middle, coloured like the map
    const barY = 21, barH = 13;
    const bar = (d, value, side) => {
      const w = length(Math.max(0, value));
      return { x: side < 0 ? mid - w : mid, w, value, side };
    };
    for (const [key, side] of [['ab', -1], ['ba', 1]]) {
      const parts = rows.append('g').datum(d => bar(d, d[key], side));
      parts.append('rect').attr('class', 'bar').attr('x', b => b.x).attr('y', barY).attr('width', b => Math.max(b.w, 1.5)).attr('height', barH).attr('rx', 2)
        .attr('fill', b => colour(b.value));
      parts.append('text').attr('class', 'bar-value')
        .attr('x', b => mid + side * (b.w + 4)).attr('y', barY + 10.5).attr('text-anchor', side < 0 ? 'end' : 'start')
        .attr('fill', b => (b.value < 0 ? 'var(--neg2)' : 'var(--fg)'))
        .text(b => signed(b.value));
    }
    rows.append('line').attr('class', 'mid-line').attr('x1', mid).attr('x2', mid).attr('y1', barY - 2).attr('y2', barY + barH + 2);
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

  $('bonds').addEventListener('change', e => { state.bonds = +e.target.value; render(); });

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
