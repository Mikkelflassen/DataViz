// Voting blocs: which countries keep giving each other more points than expected?
//
// Two linked views of the same blocs: a matrix sorted by the clustering, and the map.
// Only strong blocs are marked. Countries that favour nobody in particular stay unmarked.
/* global d3 */

import { startPage, onThemeChange } from '../shared/page.js';
import { loadCountries, loadVotes, pairAverages, pairKey, signed, yearsLabel, FIRST_YEAR, LAST_YEAR } from '../shared/data.js';
import { createEuropeMap } from '../shared/europe-map.js';
import { createFavoritismScale, drawFavoritismLegend } from '../shared/favoritism-scale.js';
import { createYearRange, wirePresets } from '../shared/year-range.js';
import { createTooltip } from '../shared/tooltip.js';
import { clusterBySimilarity } from '../analysis/cluster.js';

const $ = id => document.getElementById(id);

// Each region has a colour it gets first, so "the Nordic bloc" keeps its colour when the slider moves.
const REGION_SLOT = { Nordic: 1, Balkan: 2, 'Ex-Soviet': 3, Southern: 4, Western: 5, Central: 6 };
const MAX_BLOCS = 8;                            // one per colour in css/site.css
const DARK_INK_SLOTS = new Set([2, 4, 5, 8]);   // amber, green, pink and olive need dark text

startPage(async () => {
  const [countries, votes, topology] = await Promise.all([loadCountries(), loadVotes(), d3.json('data/europe.topo.json')]);
  const byId = new Map(countries.map(c => [c.id, c]));
  const nameOf = id => byId.get(id).name;

  const state = { from: FIRST_YEAR, to: LAST_YEAR, threshold: 2.5 };   // threshold: points of mutual favoritism a bloc needs
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

  /**
   * The blocs for the current threshold. Most countries end up in none, which is fine:
   * they vote differently from year to year. If more blocs clear the threshold than there
   * are colours, the strongest ones are kept.
   */
  function describeBlocs() {
    const { tree, fav } = model;
    const all = tree.strongGroups(state.threshold).map(members => {
      const regions = d3.rollups(members, group => group.length, id => byId.get(id).region).sort((a, b) => b[1] - a[1]);
      const inside = d3.mean(d3.cross(members, members).filter(([a, b]) => a !== b && fav(a, b)), ([a, b]) => fav(a, b).fav);
      // what a member gets from the rest of its bloc in one final: bigger blocs and closer blocs both count
      return { members, regions, inside, pull: inside * (members.length - 1), set: new Set(members) };
    });
    const kept = new Set(d3.sort(all, b => -b.pull).slice(0, MAX_BLOCS));
    const blocs = all.filter(b => kept.has(b));
    hiddenBlocs = all.length - blocs.length;

    // colours: biggest blocs choose first, each takes its main region's colour if it is still free
    const used = new Set();
    for (const bloc of d3.sort(blocs, b => -b.members.length)) {
      const preferred = bloc.regions.map(([region]) => REGION_SLOT[region]);
      bloc.slot = [...preferred, ...d3.range(1, MAX_BLOCS + 1)].find(slot => !used.has(slot));
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
  let hiddenBlocs = 0;   // blocs that cleared the threshold but were left out because of MAX_BLOCS
  const blocOf = id => blocs.find(b => b.set.has(id));
  const countryTip = id => {
    const bloc = blocOf(id);
    return `<b>${nameOf(id)}</b><br><span class="m">${bloc ? `bloc ${bloc.letter}: ${bloc.name}` : model.included.has(id) ? 'in no bloc' : 'too few shared finals in these years'}</span>`;
  };

  // ---------- the matrix

  const SIZE = 760, LEFT = 122, TOP = 58, GAP = 5;

  function renderMatrix() {
    const { tree, fav } = model;
    // Display order: the tree's order, with the members of a bloc pulled together where its
    // first member stands. Countries in no bloc keep their place between the blocs.
    const segments = [];        // runs of loose countries and whole blocs, in display order
    const placed = new Set();
    for (const id of tree.order) {
      if (placed.has(id)) continue;
      const bloc = blocOf(id);
      if (bloc) {
        segments.push({ ids: bloc.members, bloc });
        bloc.members.forEach(member => placed.add(member));
      } else {
        if (!segments.length || segments.at(-1).bloc) segments.push({ ids: [] });
        segments.at(-1).ids.push(id);
        placed.add(id);
      }
    }
    const order = segments.flatMap(segment => segment.ids);
    const n = order.length;
    const cell = (SIZE - LEFT - 6 - GAP * (segments.length - 1)) / n;

    // position of each country along the axis, with a small gap around every bloc
    const offset = new Map();
    let cursor = 0;
    segments.forEach(segment => {
      if (segment.bloc) segment.bloc.start = cursor;
      segment.ids.forEach(id => { offset.set(id, cursor); cursor += cell; });
      if (segment.bloc) segment.bloc.size = cursor - segment.bloc.start;
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
  const focusCountry = id => focusBloc(blocOf(id) ?? null);   // a country in no bloc puts nothing in focus

  // ---------- the list of groups and the headline numbers

  function renderList() {
    d3.select('#blocs').selectAll('li').data(blocs.length ? blocs : [null]).join('li')
      .html(b => (!b ? '<span></span><span class="members">No blocs at this strength.</span>' : `
        <span class="badge" style="background:${b.colour};color:${b.ink}">${b.letter}</span>
        <span class="name">${b.name}</span>
        ${b.inside == null ? '<span></span>' : `<span class="inside" style="background:${colour(b.inside)};color:${colour.ink(b.inside)}" title="Average favoritism between members">${signed(b.inside)}</span>`}
        <span class="members">${b.members.map(id => `<a href="index.html#${id}">${nameOf(id)}</a>`).join(', ')}</span>`))
      .on('mouseenter', (e, b) => focusBloc(b ?? null))
      .on('mouseleave', () => focusBloc(null));
  }

  function renderVerdict() {
    const { ids, fav } = model;
    const pairs = d3.cross(ids, ids).filter(([a, b]) => a !== b && fav(a, b));
    const sameBloc = ([a, b]) => blocOf(a) && blocOf(a) === blocOf(b);
    const within = d3.mean(pairs.filter(sameBloc), ([a, b]) => fav(a, b).fav);
    const others = d3.mean(pairs.filter(p => !sameBloc(p)), ([a, b]) => fav(a, b).fav);
    const members = d3.sum(blocs, b => b.members.length);
    $('verdict').innerHTML = !blocs.length
      ? 'No group of countries favours each other this strongly in these years. Lower the bar to see the weaker blocs.'
      : `<b>${members} of ${ids.length}</b> countries are in a bloc. Inside a bloc a country gets <b>${signed(within)} points</b> more than expected; all other pairs average ${signed(others)}.` +
        (hiddenBlocs ? ` ${hiddenBlocs} weaker bloc${hiddenBlocs > 1 ? 's are' : ' is'} not shown.` : '');
  }

  // ---------- wiring

  function render({ reanalyse = true } = {}) {
    tooltip.hide();
    if (reanalyse) model = analyse();
    blocs = describeBlocs();
    $('matrix-years').textContent = yearsLabel(state.from, state.to);
    renderMatrix();
    renderList();
    renderVerdict();
    map.paint({
      fill: id => blocOf(id)?.colour ?? (model.included.has(id) ? 'var(--no-bloc)' : null),
      ink: id => blocOf(id)?.ink ?? 'var(--muted)',
    });
    map.relabel(id => blocOf(id)?.letter ?? '', 22);   // the letter says which bloc, so colour is not the only cue
  }

  $('strength').addEventListener('input', e => {
    state.threshold = +e.target.value;
    $('strength-value').textContent = `+${state.threshold.toFixed(1)}`;
    render({ reanalyse: false });   // same tree, read at another threshold
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
