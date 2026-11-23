// Country map: pick a country and see who gives it more or fewer points than expected.
// With no country picked (the default), the map shows how each country does on average per final:
// points per voting country, compared with the average entry in that final. Same unit and same
// red/blue scale as favoritism, so the two views can be read against each other.
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
  //
  // score: for each final, the mean points the country got per voting country, minus the mean
  // for every entry in that final; then averaged over the finals it was in. Taking the mean per
  // final means a country is not rewarded for simply having been in more finals, and comparing
  // with that final's average entry removes the changes in the points system over the years.
  const totalsCache = new Map();
  function totals() {
    const key = `${state.from}-${state.to}`;
    if (!totalsCache.has(key)) {
      if (totalsCache.size > 60) totalsCache.clear();
      const inRange = votes.filter(v => v.year >= state.from && v.year <= state.to);
      const present = new Set();
      inRange.forEach(v => { present.add(v.giver); present.add(v.receiver); });
      const yearMean = d3.rollup(inRange, rows => d3.mean(rows, r => r.points), v => v.year);
      const received = d3.rollup(inRange, rows => {
        const perFinal = d3.rollups(rows, g => d3.mean(g, r => r.points) - yearMean.get(g[0].year), r => r.year);
        return {
          points: d3.sum(rows, r => r.points),
          finals: perFinal.length,
          score: d3.mean(perFinal, d => d[1]),
        };
      }, v => v.receiver);
      totalsCache.set(key, { present, received });
    }
    return totalsCache.get(key);
  }
  const isAbsent = id => !totals().present.has(id);
  const totalFor = id => totals().received.get(id) ?? null;   // null: absent, or never received a vote
  // Same minimum as for pairs, so one lucky final doesn't top the list.
  const enoughFinals = t => t && t.finals >= minSharedFinals(state.from, state.to);
  const scoreFor = id => (enoughFinals(totalFor(id)) ? totalFor(id) : null);
  const thousands = d3.format(',');

  /** The pair shown on country `id`, given the focus country and direction. */
  const pairFor = id => (state.direction === 'in' ? [id, state.focus] : [state.focus, id]);
  const valueFor = id => (id === state.focus ? null : averages().get(pairKey(...pairFor(id))));

  function countryTip(id) {
    if (isAbsent(id)) return `<b>${nameOf(id)}</b><br><span class="m">no final in ${yearsLabel(state.from, state.to)}</span>`;
    if (!state.focus) {
      const t = totalFor(id);
      if (!t) return `<b>${nameOf(id)}</b><br><span class="m">insufficient data</span>`;
      if (!enoughFinals(t)) return `<b>${nameOf(id)}</b><br><span class="m">only ${t.finals} final${t.finals === 1 ? '' : 's'}: too few for an average</span>`;
      return `<b>${nameOf(id)}</b><br><span class="m">${signed(t.score)} pts per voter vs average entry</span><br>` +
        `<span class="m">${thousands(t.points)} points in ${t.finals} final${t.finals === 1 ? '' : 's'}, ${(t.points / t.finals).toFixed(0)} per final</span>`;
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
    const absentFill = 'var(--land)', absentInk = 'transparent';
    map.markAbsent(isAbsent);
    // countries in no final in these years can't be picked from the list either
    for (const option of $('focus').options) option.disabled = !!option.value && isAbsent(option.value);

    if (!focus) {
      // ---------- overview: how each country does per final, on the favoritism colours
      map.paint({
        fill: id => (isAbsent(id) ? absentFill : scoreFor(id) ? colour(scoreFor(id).score) : null),
        ink: id => (isAbsent(id) ? absentInk : scoreFor(id) ? colour.ink(scoreFor(id).score) : 'var(--muted)'),
      });
      map.markSelected(null);
      $('map-title').textContent = 'Points received per final';
      $('top-heading').textContent = 'Most points per final';
      $('low-heading').textContent = 'Fewest points per final';
      const ranked = countries.filter(c => scoreFor(c.id)).map(c => ({ id: c.id, t: scoreFor(c.id) }))
        .sort((a, b) => d3.descending(a.t.score, b.t.score));
      const fill = d => colour(d.t.score), ink = d => colour.ink(d.t.score), text = d => signed(d.t.score);
      fillList('#top', ranked.slice(0, 5), fill, ink, text);
      fillList('#low', ranked.slice(-3).reverse(), fill, ink, text);
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
    $('hatch-text').textContent = !focus ? `Fewer than ${needed} finals` : needed > 1 ? `Fewer than ${needed} shared finals` : 'No shared finals';
    $('key-selected').hidden = !focus;
    $('key-hatch').hidden = !focus && needed === 1;
    $('map-years').textContent = years;
    $('map').setAttribute('aria-label', focus
      ? `Map of Europe coloured by favoritism ${incoming ? 'toward' : 'from'} ${nameOf(focus)}`
      : 'Map of Europe coloured by points received per final, compared with the average entry');

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
  select.add(new Option('All countries', ''));
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
    // the selected country was in no final in the new years: back to the overview
    if (state.focus && isAbsent(state.focus)) setFocus(null);
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
  addEventListener('hashchange', () => { const id = countryFromHash(known); if (id && !isAbsent(id)) setFocus(id); });

  function drawLegend() {
    drawFavoritismLegend(d3.select('#legend'), colour, state.focus ? 'points vs expected' : 'points per voter vs average entry');
  }
  onThemeChange(() => { colour = createFavoritismScale(); render(); });
  render();
});

