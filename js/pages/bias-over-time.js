// Favoritism over time: how often a vote is far above what the other countries gave the same song.
//
// Favoritism of a vote = its points minus the average the other voting countries gave the same
// song that year (scripts/build_data.py). A slider sets how many points above that average a vote
// must be; the bar chart shows, per year, how many votes reach it, as a number or as a share of
// the votes in question. A country picker narrows it to the votes one country gave or received.
// From 2016 the jury and the televote each give a set of points, so those years have two bars
// side by side, each counted against the other juries or the other televotes.
// Only 1975-2023: from 1975 the top score is always 12, so a threshold means the same every year.
/* global d3 */

import { startPage, segmented } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const W = 900, H = 340, M = { left: 48, right: 16, top: 28, bottom: 28 };
const LABEL = { all: 'All votes', jury: 'Jury', tele: 'Televote' };

startPage(async () => {
  const [data, countries] = await Promise.all([d3.json('data/favoritism-votes.json'), d3.json('data/countries.json')]);
  const name = new Map(countries.map(c => [c.id, c.name]));
  const nameOf = id => name.get(id) ?? id.toUpperCase();
  const ids = data.countries;
  const tooltip = createTooltip();
  const state = { t: 6, share: false, country: null, dir: 'g' };

  // the stored votes, grouped per year and set: [giver index, receiver index, favoritism]
  const groups = d3.group(data.votes, v => v[0], v => data.sets[v[1]]);
  const votesIn = (y, set) => groups.get(y)?.get(set) ?? [];

  // one bar per year before 2016, jury and televote side by side from 2016
  const bars = Object.entries(data.n).flatMap(([y, sets]) => Object.keys(sets).map(set => ({ y: +y, set })));

  const svg = d3.select('#bars').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand(d3.range(1975, 2024), [M.left, W - M.right]).paddingInner(0.2);
  const y = d3.scaleLinear().range([H - M.bottom, M.top]);
  const half = x.bandwidth() / 2;
  const xOf = b => x(b.y) + (b.set === 'tele' ? half : 0);
  const wOf = b => (b.set === 'all' ? x.bandwidth() : half);

  // count and total for one bar, under the current threshold and country
  function measure(b) {
    const ci = state.country === null ? -1 : ids.indexOf(state.country);
    const counts = data.n[b.y][b.set];
    const total = ci < 0 ? d3.sum(counts.g) : counts[state.dir][ci];
    if (!total) return null;   // the country was not in that final
    const side = state.dir === 'g' ? 1 : 2;   // position of the country in a stored vote (after the year/set fields)
    const hits = votesIn(b.y, b.set).filter(v => v[4] >= state.t * 10 && (ci < 0 || v[side + 1] === ci));
    return { count: hits.length, total, hits };
  }
  const valueOf = m => (m === null ? 0 : state.share ? m.count / m.total : m.count);

  const gridG = svg.append('g').attr('class', 'grid');
  const note = svg.append('text').attr('class', 'note').attr('x', M.left).attr('y', 12);
  svg.append('g').selectAll('text').data(d3.range(1980, 2024, 5)).join('text').attr('class', 'tick-label')
    .attr('x', v => x(v) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(v => v);

  const rects = svg.append('g').selectAll('rect').data(bars).join('rect')
    .attr('class', b => `bar ${b.set}`).attr('x', xOf).attr('width', wOf).attr('y', y(0)).attr('height', 0)
    .on('mousemove', (event, b) => tooltip.show(event, tip(b)))
    .on('mouseleave', () => tooltip.hide());

  function tip(b) {
    const m = measure(b);
    const head = `<b>${b.y}${b.set === 'all' ? '' : ` · ${LABEL[b.set]}`}</b><br>`;
    if (!m) return `${head}<span class="m">${nameOf(state.country)} was not in this final</span>`;
    const big = [...m.hits].sort((a, c) => c[4] - a[4]).slice(0, 3)
      .map(v => `${nameOf(ids[v[2]])} → ${nameOf(ids[v[3]])} +${(v[4] / 10).toFixed(1)}`).join('<br>');
    return `${head}<span class="m">${m.count} of ${m.total} votes (${d3.format('.1%')(m.count / m.total)})</span>`
      + (big ? `<br><span class="m">${big}</span>` : '');
  }

  function render() {
    const fmt = state.share ? d3.format('.0%') : d3.format('d');
    const values = new Map(bars.map(b => [b, valueOf(measure(b))]));
    y.domain([0, d3.max(values.values()) || 1]).nice();
    gridG.selectAll('g').data(y.ticks(4).filter(t => state.share || Number.isInteger(t)), d => d).join(
      enter => { const g = enter.append('g'); g.append('line'); g.append('text').attr('class', 'tick-label'); return g; },
    ).call(g => {
      g.select('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
      g.select('text').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(fmt);
    });
    rects.transition().duration(350).attr('y', b => y(values.get(b))).attr('height', b => y(0) - y(values.get(b)));
    note.text(state.country === null ? 'Votes from all countries'
      : `Votes ${state.dir === 'g' ? 'given by' : 'received by'} ${nameOf(state.country)}`);
    d3.select('#t-value').text(state.t);
    d3.select('#t-unit').text(state.t === 1 ? 'point' : 'points');
    d3.select('#direction').classed('is-off', state.country === null)
      .selectAll('button').property('disabled', state.country === null);
  }

  // controls
  const slider = document.getElementById('threshold');
  slider.value = state.t;
  slider.addEventListener('input', () => { state.t = +slider.value; render(); });
  segmented(document.getElementById('measure'), v => { state.share = v === 'share'; render(); });
  segmented(document.getElementById('direction'), v => { state.dir = v; render(); });
  d3.select('#country').selectAll('option.c').data([...ids].sort((a, b) => d3.ascending(nameOf(a), nameOf(b)))).join('option')
    .attr('class', 'c').attr('value', d => d).text(nameOf);
  document.getElementById('country').addEventListener('change', e => { state.country = e.target.value || null; render(); });
  render();
});
