// Voting blocs: which countries keep giving each other more points than expected?
//
// Two linked views of the same grouping: a matrix sorted by the clustering, and the map.
/* global d3 */

import { startPage, onThemeChange } from '../shared/page.js';
import { loadCountries, loadVotes, pairAverages, pairKey, signed, yearsLabel, FIRST_YEAR, LAST_YEAR } from '../shared/data.js';
import { createEuropeMap } from '../shared/europe-map.js';
import { createFavoritismScale, drawFavoritismLegend } from '../shared/favoritism-scale.js';
import { createYearRange, wirePresets } from '../shared/year-range.js';
import { createTooltip } from '../shared/tooltip.js';
import { clusterBySimilarity } from '../analysis/cluster.js';

const $ = id => document.getElementById(id);

// Each region has a colour it gets first, so "the Nordic group" stays blue when the slider moves.
const REGION_SLOT = { Nordic: 1, Balkan: 2, 'Ex-Soviet': 3, Southern: 4, Western: 5, Central: 6 };
const SLOTS = 8;
const DARK_INK_SLOTS = new Set([4, 5]);   // yellow and pink need dark text

startPage(async () => {
  const [countries, votes, topology] = await Promise.all([loadCountries(), loadVotes(), d3.json('data/europe.topo.json')]);
  const byId = new Map(countries.map(c => [c.id, c]));
  const nameOf = id => byId.get(id).name;

  const state = { from: FIRST_YEAR, to: LAST_YEAR, groups: 6 };
  const tooltip = createTooltip();
  let colour = createFavoritismScale();
  let model = null;   // the current clustering, see analyse()

  // ---------- analysis

  function analyse() {
    const averages = pairAverages(votes, state.from, state.to);
    const fav = (giver, receiver) => averages.get(pairKey(giver, receiver));
    // how much two countries favour each other: the mean of the two directions
    const mutual = (a, b) => {
      const there = fav(a, b), back = fav(b, a);
      return there && back ? (there.fav + back.fav) / 2 : null;
    };

    // Drop countries that met too few of the others. Dropping one can push another
    // below the line, so repeat until nothing changes.
    let ids = [...new Set([...averages.keys()].flatMap(key => key.split('>')))].sort();
    for (;;) {
      const enough = Math.max(8, ids.length / 2);
      const kept = ids.filter(a => ids.filter(b => b !== a && mutual(a, b) != null).length >= enough);
      if (kept.length === ids.length) break;
      ids = kept;
    }

    const tree = clusterBySimilarity(ids, mutual);
    return { ids, fav, mutual, tree, included: new Set(ids) };
  }

  /** Split the tree into the chosen number of blocs and describe each one. */
  function describeBlocs() {
    const { tree, fav, ids } = model;
    const used = new Set();
    const blocs = tree.cut(Math.min(state.groups, ids.length)).map(members => {
      const regions = d3.rollups(members, group => group.length, id => byId.get(id).region).sort((a, b) => b[1] - a[1]);
      const inside = d3.mean(d3.cross(members, members).filter(([a, b]) => a !== b && fav(a, b)), ([a, b]) => fav(a, b).fav);
      return { members, regions, inside, set: new Set(members) };
    });

    // colours: biggest groups choose first, each takes its main region's colour if it is still free
    for (const bloc of d3.sort(blocs, b => -b.members.length)) {
      const preferred = bloc.regions.map(([region]) => REGION_SLOT[region]);
      bloc.slot = [...preferred, ...d3.range(1, SLOTS + 1)].find(slot => !used.has(slot));
      used.add(bloc.slot);
    }
    blocs.forEach((bloc, i) => {
      bloc.letter = String.fromCharCode(65 + i);
      bloc.colour = `var(--bloc-${bloc.slot})`;
      bloc.ink = DARK_INK_SLOTS.has(bloc.slot) ? '#15151b' : '#ffffff';
      bloc.name = blocName(bloc);
    });
    return blocs;
  }

  function blocName({ members, regions }) {
    if (members.length <= 2) return members.map(nameOf).join(' and ');
    const [[first, count], second] = regions;
    if (count === members.length) return first;
    if (count / members.length > 0.5) return `Mostly ${first}`;
    return `${first} and ${second[0]}`;
  }

  // ---------- the map (drawn once, repainted on every change)

  const map = createEuropeMap(d3.select('#map'), topology, {
    enter: (e, id) => focusCountry(id),
    move: (e, id) => tooltip.show(e, countryTip(id)),
    leave: () => { focusBloc(null); tooltip.hide(); },
    click: (e, id) => { location.href = `index.html#${id}`; },
  });

  let blocs = [];
  const blocOf = id => blocs.find(b => b.set.has(id));
  const countryTip = id => {
    const bloc = blocOf(id);
    return `<b>${nameOf(id)}</b><br><span class="m">${bloc ? `group ${bloc.letter}: ${bloc.name}` : 'too few shared finals in these years'}</span>`;
  };

  // ---------- the matrix

  const SIZE = 760, LEFT = 122, TOP = 58, GAP = 5;

  function renderMatrix() {
    const { tree, fav } = model;
    const order = tree.order, n = order.length;
    const cell = (SIZE - LEFT - 6 - GAP * (blocs.length - 1)) / n;

    // position of each country along the axis, with a small gap between groups
    const offset = new Map();
    let cursor = 0;
    blocs.forEach(bloc => {
      bloc.start = cursor;
      bloc.members.forEach(id => { offset.set(id, cursor); cursor += cell; });
      bloc.size = cursor - bloc.start;
      cursor += GAP;
    });
    const height = TOP + cursor - GAP + 8;

    const svg = d3.select('#matrix').attr('viewBox', `0 0 ${SIZE} ${height}`);
    svg.selectAll('*').remove();
    const hatch = svg.append('defs').append('pattern').attr('id', 'matrix-hatch').attr('width', 4).attr('height', 4)
      .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    hatch.append('rect').attr('width', 4).attr('height', 4).attr('fill', 'var(--surface)');
    hatch.append('line').attr('y2', 4).attr('stroke', 'var(--line)').attr('stroke-width', 2);

    svg.append('text').attr('class', 'axis-note').attr('x', LEFT).attr('y', 10).text('RECEIVES →');
    svg.append('text').attr('class', 'axis-note').attr('x', 2).attr('y', TOP - 8).text('GIVES ↓');

    const plot = svg.append('g').attr('transform', `translate(${LEFT},${TOP})`);
    const crossRow = plot.append('rect').attr('class', 'cross').attr('x', -LEFT).attr('width', LEFT + cursor).attr('height', cell).attr('visibility', 'hidden');
    const crossCol = plot.append('rect').attr('class', 'cross').attr('y', -TOP + 14).attr('height', TOP - 14 + cursor).attr('width', cell).attr('visibility', 'hidden');

    const cells = d3.cross(order, order).map(([giver, receiver]) => ({ giver, receiver, value: giver === receiver ? null : fav(giver, receiver) }));
    plot.append('g').selectAll('rect').data(cells).join('rect')
      .attr('class', d => `cell${d.giver === d.receiver ? ' self' : d.value ? '' : ' none'}`)
      .attr('x', d => offset.get(d.receiver)).attr('y', d => offset.get(d.giver)).attr('width', cell).attr('height', cell)
      .attr('fill', d => (d.value ? colour(d.value.fav) : null))
      .on('mouseenter', (e, d) => {
        crossRow.attr('y', offset.get(d.giver)).attr('visibility', 'visible');
        crossCol.attr('x', offset.get(d.receiver)).attr('visibility', 'visible');
        labels.classed('is-on', l => (l.axis === 'row' ? l.id === d.giver : l.id === d.receiver));
        map.outline(new Set([d.giver, d.receiver]));
      })
      .on('mousemove', (e, d) => tooltip.show(e, cellTip(d)))
      .on('mouseleave', () => {
        crossRow.attr('visibility', 'hidden');
        crossCol.attr('visibility', 'hidden');
        labels.classed('is-on', false);
        map.outline(null);
        tooltip.hide();
      });

    // names down the side, codes along the top; both link to the country map
    const labelData = [...order.map(id => ({ id, axis: 'row' })), ...order.map(id => ({ id, axis: 'col' }))];
    const labels = plot.append('g').selectAll('a').data(labelData).join('a')
      .attr('href', d => `index.html#${d.id}`).attr('aria-label', d => `${nameOf(d.id)} on the country map`)
      .append('text').attr('class', d => `matrix-label${d.axis === 'col' ? ' code' : ''}`)
      .attr('text-anchor', d => (d.axis === 'row' ? 'end' : 'middle'))
      .attr('x', d => (d.axis === 'row' ? -12 : offset.get(d.id) + cell / 2))
      .attr('y', d => (d.axis === 'row' ? offset.get(d.id) + cell / 2 + 3.5 : -12))
      .text(d => (d.axis === 'row' ? nameOf(d.id) : d.id.toUpperCase()))
      .on('mouseenter', (e, d) => focusCountry(d.id))
      .on('mouseleave', () => focusBloc(null));

    // each group: an outline on the diagonal, and its colour as a strip beside the names and codes
    const groups = plot.append('g').selectAll('g').data(blocs).join('g');
    groups.append('rect').attr('x', -8).attr('y', b => b.start).attr('width', 5).attr('height', b => b.size).attr('rx', 2).attr('fill', b => b.colour);
    groups.append('rect').attr('y', -8).attr('x', b => b.start).attr('height', 5).attr('width', b => b.size).attr('rx', 2).attr('fill', b => b.colour);
    groups.append('rect').attr('class', 'bloc-box').attr('x', b => b.start).attr('y', b => b.start).attr('width', b => b.size).attr('height', b => b.size);
    groups.append('text').attr('class', 'bloc-tag').attr('x', b => b.start + b.size / 2).attr('y', -27).attr('text-anchor', 'middle').text(b => b.letter);
  }

  const cellTip = d => {
    const head = `<b>${nameOf(d.giver)} → ${nameOf(d.receiver)}</b><br>`;
    if (d.giver === d.receiver) return `<b>${nameOf(d.giver)}</b><br><span class="m">a country can't vote for itself</span>`;
    if (!d.value) return `${head}<span class="m">too few shared finals</span>`;
    return `${head}<span class="m">${signed(d.value.fav)} pts vs expected</span><br><span class="m">over ${d.value.finals} finals</span>`;
  };

  // ---------- linking the views: one group in focus, in the matrix, on the map and in the list

  function focusBloc(bloc) {
    d3.select('#matrix').classed('has-focus', !!bloc);
    d3.selectAll('#matrix .cell').classed('in-focus', d => !!bloc && bloc.set.has(d.giver) && bloc.set.has(d.receiver));
    d3.selectAll('#matrix .bloc-box').classed('in-focus', b => b === bloc);
    d3.selectAll('#blocs li').classed('is-on', b => b === bloc);
    map.spotlight(bloc ? bloc.set : null);
  }
  const focusCountry = id => focusBloc(blocOf(id) ?? null);

  // ---------- the list of groups and the headline numbers

  function renderList() {
    d3.select('#blocs').selectAll('li').data(blocs).join('li')
      .html(b => `
        <span class="badge" style="background:${b.colour};color:${b.ink}">${b.letter}</span>
        <span class="name">${b.name}</span>
        ${b.inside == null ? '<span></span>' : `<span class="inside" style="background:${colour(b.inside)};color:${colour.ink(b.inside)}" title="Average favoritism between members">${signed(b.inside)}</span>`}
        <span class="members">${b.members.map(id => `<a href="index.html#${id}">${nameOf(id)}</a>`).join(', ')}</span>`)
      .on('mouseenter', (e, b) => focusBloc(b))
      .on('mouseleave', () => focusBloc(null));
  }

  function renderVerdict() {
    const { ids, fav } = model;
    const pairs = d3.cross(ids, ids).filter(([a, b]) => a !== b && fav(a, b));
    const sameBloc = ([a, b]) => blocOf(a) === blocOf(b);
    const within = d3.mean(pairs.filter(sameBloc), ([a, b]) => fav(a, b).fav);
    const across = d3.mean(pairs.filter(p => !sameBloc(p)), ([a, b]) => fav(a, b).fav);
    $('verdict').innerHTML = within == null || across == null ? '' :
      `Inside a group a country gets <b>${signed(within)} points</b> compared with what was expected. From countries outside its group it gets <b>${signed(across)}</b>.`;
  }

  // ---------- wiring

  function render({ reanalyse = true } = {}) {
    tooltip.hide();
    if (reanalyse) model = analyse();
    blocs = describeBlocs();
    $('matrix-years').textContent = yearsLabel(state.from, state.to);
    $('groups').max = Math.min(SLOTS, model.ids.length);
    renderMatrix();
    renderList();
    renderVerdict();
    map.paint({
      fill: id => blocOf(id)?.colour ?? null,
      ink: id => blocOf(id)?.ink ?? 'var(--muted)',
    });
  }

  $('groups').addEventListener('input', e => {
    state.groups = +e.target.value;
    $('groups-value').textContent = state.groups;
    render({ reanalyse: false });   // same tree, cut somewhere else
  });

  const markPreset = wirePresets($('presets'), (from, to) => { slider.set(from, to); setYears(from, to); });
  let frame = 0;
  function setYears(from, to) {
    state.from = from;
    state.to = to;
    $('years-value').textContent = yearsLabel(from, to);
    markPreset(from, to);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render());
  }
  const slider = createYearRange($('years'), { years: d3.range(FIRST_YEAR, LAST_YEAR + 1), from: state.from, to: state.to, minSteps: 7, onChange: setYears });
  markPreset(state.from, state.to);

  const legend = () => drawFavoritismLegend(d3.select('#legend'), colour);
  onThemeChange(() => { colour = createFavoritismScale(); legend(); render({ reanalyse: false }); });
  legend();
  render();
});
