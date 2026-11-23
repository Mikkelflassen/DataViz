// Country map: pick a country and see who gives it more or fewer points than expected.
// With no country picked (the default), the map shows the total points each country received.
/* global d3 */

import { startPage, onThemeChange, segmented } from '../shared/page.js';
import { loadCountries, loadVotes, pairAverages, pairKey, minSharedFinals, signed, yearsLabel, FIRST_YEAR, LAST_YEAR } from '../shared/data.js';
import { createEuropeMap } from '../shared/europe-map.js';
import { createFavoritismScale, drawFavoritismLegend } from '../shared/favoritism-scale.js';
import { createYearRange, wirePresets } from '../shared/year-range.js';
import { createTooltip } from '../shared/tooltip.js';
import { countryFromHash } from '../shared/detect-country.js';

const $ = id => document.getElementById(id);

startPage(async () => {
  const [countries, votes, topology] = await Promise.all([loadCountries(), loadVotes(), d3.json('data/europe.topo.json')]);
  const nameOf = id => byId.get(id).name;
  const byId = new Map(countries.map(c => [c.id, c]));
  const known = new Set(byId.keys());

  const state = {
    focus: countryFromHash(known),   // null = no country picked: total points received
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

  // Totals and who took part, per year range. A country that was in no final in the range
  // has no data at all and is greyed out like the countries outside Eurovision.
  const totalsCache = new Map();
  function totals() {
    const key = `${state.from}-${state.to}`;
    if (!totalsCache.has(key)) {
      if (totalsCache.size > 60) totalsCache.clear();
      const inRange = votes.filter(v => v.year >= state.from && v.year <= state.to);
      const present = new Set();
      inRange.forEach(v => { present.add(v.giver); present.add(v.receiver); });
      const received = d3.rollup(inRange, rows => ({ points: d3.sum(rows, r => r.points), finals: new Set(rows.map(r => r.year)).size }), v => v.receiver);
      totalsCache.set(key, { present, received });
    }
    return totalsCache.get(key);
  }
  const isAbsent = id => !totals().present.has(id);
  const totalFor = id => totals().received.get(id) ?? (isAbsent(id) ? null : { points: 0, finals: 0 });

  // Total points use the red half of the same colours as favoritism, on a square-root scale:
  // all totals are positive, and a few countries have many times more than most.
  function createTotalsScale() {
    const max = d3.max(totals().received.values(), d => d.points) || 1;
    const t = d3.scaleSqrt([0, max], [0.56, 1]).nice().clamp(true);
    const scale = v => colour.interpolate(t(v));
    scale.ink = v => (d3.lab(scale(v)).l < 58 ? '#ffffff' : '#15151b');
    scale.domain = () => t.domain();
    scale.ticks = n => t.ticks(n);
    scale.t = t;
    return scale;
  }
  let totalsColour = null;
  const thousands = d3.format(',');

  /** The pair shown on country `id`, given the focus country and direction. */
  const pairFor = id => (state.direction === 'in' ? [id, state.focus] : [state.focus, id]);
  const valueFor = id => (id === state.focus ? null : averages().get(pairKey(...pairFor(id))));

  function countryTip(id) {
    if (isAbsent(id)) return `<b>${nameOf(id)}</b><br><span class="m">no final in ${yearsLabel(state.from, state.to)}</span>`;
    if (!state.focus) {
      const t = totalFor(id);
      return `<b>${nameOf(id)}</b><br><span class="m">${thousands(t.points)} points received</span><br>` +
        `<span class="m">${t.finals} final${t.finals === 1 ? '' : 's'}${t.finals ? `, ${(t.points / t.finals).toFixed(1)} per final` : ''}</span>`;
    }
    if (id === state.focus) return `<b>${nameOf(id)}</b><br><span class="m">selected country</span>`;
    const [giver, receiver] = pairFor(id);
    const head = `<b>${nameOf(giver)} → ${nameOf(receiver)}</b><br>`;
    const value = valueFor(id);
    if (!value) return `${head}<span class="m">insufficient data</span>`;
    return `${head}<span class="m">${signed(value.fav)} pts vs expected</span><br>` +
      `<span class="m">${value.points.toFixed(1)} pts on average, ${value.finals} finals</span>`;
  }

  const map = createEuropeMap(d3.select('#map'), topology, {
    enter: (e, id) => highlightCountry(id),
    move: (e, id) => tooltip.show(e, countryTip(id)),
    leave: () => { highlightCountry(null); tooltip.hide(); },
    // clicking the selected country again goes back to the total points
    click: (e, id) => setFocus(id === state.focus ? null : id),
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
      if (state.bondScope === 'focus' && state.focus) {
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
    $('bond-scope-focus').textContent = state.focus ? `With ${nameOf(state.focus)}` : 'With one country';
    $('bond-years').textContent = yearsLabel(state.from, state.to);
    $('bond-card').hidden = !state.bonds;

    const svg = d3.select('#bond-chart');
    svg.selectAll('*').remove();
    if (!bonds.length) {
      svg.attr('viewBox', `0 0 ${CHART_WIDTH} 30`);
      svg.append('text').attr('class', 'empty-note').attr('y', 18).text('No data');
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

    const rowTip = (d, i) => `<b>${i + 1}. ${nameOf(d.a)} ⇄ ${nameOf(d.b)}</b><br>` +
      `<span class="m">${nameOf(d.a)} gives ${signed(d.ab)}</span><br><span class="m">${nameOf(d.b)} gives ${signed(d.ba)}</span><br>` +
      `<span class="m">mean ${signed(d.mutual)}</span>`;

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
    const focus = state.focus, incoming = state.direction === 'in';
    const bonds = state.bonds ? strongestBonds() : [];
    const years = yearsLabel(state.from, state.to);
    const absentFill = 'var(--land)', absentInk = 'color-mix(in srgb, var(--muted) 55%, transparent)';
    map.markAbsent(isAbsent);

    if (!focus) {
      // ---------- overview: total points received
      totalsColour = createTotalsScale();
      map.paint({
        fill: id => (isAbsent(id) ? absentFill : totalsColour(totalFor(id).points)),
        ink: id => (isAbsent(id) ? absentInk : totalsColour.ink(totalFor(id).points)),
      });
      map.markSelected(null);
      $('map-title').textContent = 'Total points received';
      $('top-heading').textContent = 'Most points received';
      $('low-heading').textContent = 'Fewest points received';
      const ranked = countries.filter(c => !isAbsent(c.id) && totals().received.has(c.id))
        .map(c => ({ id: c.id, points: totalFor(c.id).points })).sort((a, b) => d3.descending(a.points, b.points));
      fillList('#top', ranked.slice(0, 5), d => totalsColour(d.points), d => totalsColour.ink(d.points), d => thousands(d.points));
      fillList('#low', ranked.slice(-3).reverse(), d => totalsColour(d.points), d => totalsColour.ink(d.points), d => thousands(d.points));
    } else {
      // ---------- one country: favoritism toward it or from it
      const name = nameOf(focus);
      map.paint({
        fill: id => (id === focus ? 'var(--fg)' : isAbsent(id) ? absentFill : valueFor(id) ? colour(valueFor(id).fav) : null),
        ink: id => (id === focus ? 'var(--bg)' : isAbsent(id) ? absentInk : valueFor(id) ? colour.ink(valueFor(id).fav) : 'var(--muted)'),
      });
      map.markSelected(focus);
      $('map-title').textContent = incoming ? `Favoritism toward ${name}` : `Favoritism from ${name}`;
      $('top-heading').textContent = incoming ? 'Highest support' : 'Most favoured';
      $('low-heading').textContent = incoming ? 'Lowest support' : 'Least favoured';
      const ranked = countries.map(c => ({ id: c.id, value: valueFor(c.id) })).filter(d => d.value)
        .sort((a, b) => d3.descending(a.value.fav, b.value.fav));
      const fill = d => colour(d.value.fav), ink = d => colour.ink(d.value.fav), text = d => signed(d.value.fav);
      fillList('#top', ranked.slice(0, 5), fill, ink, text);
      fillList('#low', ranked.slice(-3).reverse(), fill, ink, text);
    }

    const needed = minSharedFinals(state.from, state.to);
    $('hatch-text').textContent = needed > 1 ? `Fewer than ${needed} shared finals` : 'No shared finals';
    $('key-selected').hidden = !focus;
    $('key-hatch').hidden = !focus;
    $('map-years').textContent = years;
    $('map').setAttribute('aria-label', focus
      ? `Map of Europe coloured by favoritism ${incoming ? 'toward' : 'from'} ${nameOf(focus)}`
      : 'Map of Europe coloured by total points received');

    // "Given" and "With <country>" need a country
    $('dir-out').disabled = !focus;
    $('bond-scope-focus').disabled = !focus;
    $('focus-hint').hidden = !!focus;
    drawLegend();

    renderBonds(bonds);
  }

  function fillList(id, rows, fill, ink, text) {
    d3.select(id).selectAll('li').data(rows.length ? rows : [null]).join('li')
      .html(d => (d
        ? `<button type="button" data-id="${d.id}">${nameOf(d.id)}</button>` +
          `<span class="pill" style="background:${fill(d)};color:${ink(d)}">${text(d)}</span>`
        : '<span class="empty">No data</span><span></span>'));
  }

  function setFocus(id) {
    state.focus = id || null;
    $('focus').value = id || '';
    if (!state.focus) {
      // the overview only has one direction and one scope
      state.direction = 'in';
      pressed($('direction'), 'in');
      if (state.bondScope === 'focus') { state.bondScope = 'all'; pressed($('bond-scope'), 'all'); }
    }
    render();
  }
  const pressed = (root, value) => root.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === value)));

  // ---------- controls

  const select = $('focus');
  select.add(new Option('All countries: total points', ''));
  [...countries].sort((a, b) => a.name.localeCompare(b.name)).forEach(c => select.add(new Option(c.name, c.id)));
  select.value = state.focus ?? '';
  select.addEventListener('change', () => setFocus(select.value || null));

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

  function drawLegend() {
    if (state.focus) drawFavoritismLegend(d3.select('#legend'), colour);
    else drawTotalsLegend(d3.select('#legend'), totalsColour);
  }
  onThemeChange(() => { colour = createFavoritismScale(); render(); });
  render();
});

// Legend for the total points: the red half of the favoritism colours, ticks where the
// square-root scale puts them.
function drawTotalsLegend(svg, scale) {
  const width = 280, x0 = 10, x1 = width - 10;
  const [lo, hi] = scale.t.range();
  const x = v => x0 + (scale.t(v) - lo) / (hi - lo) * (x1 - x0);
  const id = `${svg.attr('id')}-totals-gradient`;
  svg.attr('viewBox', `0 0 ${width} 44`).selectAll('*').remove();
  svg.append('defs').append('linearGradient').attr('id', id)
    .selectAll('stop').data(d3.range(0, 1.0001, 0.05)).join('stop')
    .attr('offset', t => t).attr('stop-color', t => scale(scale.t.invert(lo + t * (hi - lo))));
  svg.append('rect').attr('x', x0).attr('y', 2).attr('width', x1 - x0).attr('height', 10).attr('rx', 3).attr('fill', `url(#${id})`);
  const ticks = svg.append('g').selectAll('g').data(scale.ticks(4)).join('g').attr('transform', v => `translate(${x(v)},0)`);
  ticks.append('line').attr('y1', 12).attr('y2', 16).attr('stroke', 'var(--muted)');
  ticks.append('text').attr('class', 'tick-label').attr('y', 27).attr('text-anchor', 'middle').text(d3.format('~s'));
  svg.append('text').attr('class', 'tick-label').attr('x', width / 2).attr('y', 41).attr('text-anchor', 'middle').text('total points received');
}
