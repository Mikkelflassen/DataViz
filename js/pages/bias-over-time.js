// Favoritism over time: how often a vote is far above what the other countries gave the same song.
//
// Favoritism of a vote = its points minus the average the other voting countries gave the same
// song that year (scripts/build_data.py). A slider sets how many points above that average a vote
// must be (5 to 12); the bar chart shows, per year, how many votes reach it, as a number or as a share of all
// votes that year. From 2016 the jury and the televote each give a set of points, so those years
// have two bars side by side, each counted against the other juries or the other televotes.
// Only 1975-2023: from 1975 the top score is always 12, so a threshold means the same every year.
/* global d3 */

import { startPage, segmented } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const W = 900, H = 340, M = { left: 48, right: 16, top: 16, bottom: 28 };
const SETS = [['all', 'All votes'], ['jury', 'Jury'], ['tele', 'Televote']];

startPage(async () => {
  const [{ years }, countries] = await Promise.all([d3.json('data/favoritism-years.json'), d3.json('data/countries.json')]);
  const name = new Map(countries.map(c => [c.id, c.name]));
  const nameOf = id => name.get(id) ?? id.toUpperCase();
  const tooltip = createTooltip();
  const state = { t: 5, share: false };   // threshold in points: 5 to 12

  const svg = d3.select('#bars').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand(d3.range(1975, 2024), [M.left, W - M.right]).paddingInner(0.2);
  const y = d3.scaleLinear().range([H - M.bottom, M.top]);
  const half = x.bandwidth() / 2;

  // one bar per year before 2016, jury and televote side by side from 2016
  const bars = years.flatMap(d => SETS.filter(([k]) => d[k]).map(([k, label]) => ({ y: d.y, key: k, label, ...d[k] })));
  const xOf = b => x(b.y) + (b.key === 'tele' ? half : 0);
  const wOf = b => (b.key === 'all' ? x.bandwidth() : half);
  const value = b => (state.share ? b.c[state.t] / b.n : b.c[state.t]);

  const gridG = svg.append('g').attr('class', 'grid');
  svg.append('g').selectAll('text').data(d3.range(1980, 2024, 5)).join('text').attr('class', 'tick-label')
    .attr('x', v => x(v) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(v => v);
  svg.append('text').attr('class', 'tick-label').attr('x', x(2020) + x.bandwidth() / 2).attr('y', H - M.bottom - 4)
    .attr('text-anchor', 'middle').text('–');   // no contest in 2020

  const rects = svg.append('g').selectAll('rect').data(bars).join('rect')
    .attr('class', b => `bar ${b.key}`).attr('x', xOf).attr('width', wOf).attr('y', y(0)).attr('height', 0)
    .on('mousemove', (event, b) => tooltip.show(event, tip(b)))
    .on('mouseleave', () => tooltip.hide());

  function tip(b) {
    const big = b.top.filter(([, , f]) => f >= state.t).slice(0, 3)
      .map(([g, r, f]) => `${nameOf(g)} → ${nameOf(r)} +${f.toFixed(1)}`).join('<br>');
    return `<b>${b.y}${b.key === 'all' ? '' : ` · ${b.label}`}</b><br>`
      + `<span class="m">${b.c[state.t]} of ${b.n} votes (${d3.format('.1%')(b.c[state.t] / b.n)})</span>`
      + (big ? `<br><span class="m">${big}</span>` : '');
  }

  function render() {
    const fmt = state.share ? d3.format('.0%') : d3.format('d');
    y.domain([0, d3.max(bars, value) || 1]).nice();
    gridG.selectAll('g').data(y.ticks(4), d => d).join(
      enter => { const g = enter.append('g'); g.append('line'); g.append('text').attr('class', 'tick-label'); return g; },
    ).call(g => {
      g.select('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
      g.select('text').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(fmt);
    });
    rects.transition().duration(350).attr('y', b => y(value(b))).attr('height', b => y(0) - y(value(b)));
    d3.select('#t-value').text(state.t);
    d3.select('#t-unit').text(state.t === 1 ? 'point' : 'points');
  }

  const slider = document.getElementById('threshold');
  slider.value = state.t;
  slider.addEventListener('input', () => { state.t = +slider.value; render(); });
  segmented(document.getElementById('measure'), v => { state.share = v === 'share'; render(); });
  render();
});
