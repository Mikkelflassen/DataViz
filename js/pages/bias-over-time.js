// Favoritism over time.
//
// Small multiples: one bar chart per country pair, for the 12 pairs with the most 12-point scores
// since 1975. Each bar is the points the first country gave the second in one final. From 2016 the
// jury and the televote award separate scores, so those years have two thin bars side by side.
// Since 1975 the top score is always 12, so every panel shares one 0-12 scale and one time axis.
// Years without a bar: the two countries were not in the same final.
/* global d3 */

import { startPage } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const FIRST = 1975, LAST = 2023, SPLIT = 2016;
const COLS = 3;

startPage(async () => {
  const [{ pairs }, countries] = await Promise.all([d3.json('data/top-pairs.json'), d3.json('data/countries.json')]);
  const name = new Map(countries.map(c => [c.id, c.name]));
  const nameOf = id => name.get(id) ?? id.toUpperCase();
  const tooltip = createTooltip();

  const PW = 280, PH = 96, GX = 30, GY = 52, M = { left: 22, right: 8, top: 30, bottom: 30 };
  const rows = Math.ceil(pairs.length / COLS);
  const W = M.left + COLS * PW + (COLS - 1) * GX + M.right;
  const H = M.top + rows * PH + (rows - 1) * GY + M.bottom;
  const svg = d3.select('#pairs').attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleBand(d3.range(FIRST, LAST + 1), [0, PW]).paddingInner(0.18);
  const y = d3.scaleLinear([0, 12], [PH, 0]);
  const half = x.bandwidth() / 2;

  const panel = svg.selectAll('g.panel').data(pairs).join('g').attr('class', 'panel')
    .attr('transform', (d, i) => `translate(${M.left + (i % COLS) * (PW + GX)},${M.top + Math.floor(i / COLS) * (PH + GY)})`);

  panel.append('text').attr('class', 'panel-title').attr('y', -12).text(d => `${nameOf(d.from)} → ${nameOf(d.to)}`);

  // grid: 0, 6 and 12 points
  const grid = panel.append('g').attr('class', 'grid').selectAll('g').data([0, 6, 12]).join('g');
  grid.append('line').attr('x2', PW).attr('y1', y).attr('y2', y).classed('zero', t => !t);
  grid.append('text').attr('class', 'tick-label').attr('x', -5).attr('y', t => y(t) + 3.5).attr('text-anchor', 'end').text(t => t);

  // a faint band behind the split-vote years
  panel.append('rect').attr('class', 'split-band').attr('x', x(SPLIT) - 2).attr('width', x(LAST) + x.bandwidth() - x(SPLIT) + 4)
    .attr('y', y(12) - 4).attr('height', PH + 4);

  // bars: one per final before 2016, jury and televote side by side from 2016
  const bars = panel.append('g').selectAll('g').data(d => d.votes.map(v => ({ ...v, pair: d }))).join('g').attr('class', 'vote');
  const bar = (sel, key, cls, dx, w) => sel.filter(v => key in v).append('rect').attr('class', `bar ${cls}`)
    .attr('x', v => x(v.y) + dx).attr('width', w)
    .attr('y', v => y(v[key])).attr('height', v => Math.max(0, PH - y(v[key])));
  bar(bars, 'p', 'combined', 0, x.bandwidth());
  bar(bars, 'j', 'jury', -0.5, half + 0.5);
  bar(bars, 't', 'tele', half, half + 0.5);
  // a met-but-0 mark on the baseline, so 0 points differs from "not in the same final"
  bars.filter(v => (v.p ?? Math.max(v.j, v.t)) === 0).append('rect').attr('class', 'zero-mark')
    .attr('x', v => x(v.y)).attr('width', x.bandwidth()).attr('y', PH - 1.5).attr('height', 1.5);

  // a hit area per final for the tooltip
  bars.append('rect').attr('class', 'hit').attr('x', v => x(v.y) - 1).attr('width', x.bandwidth() + 2).attr('y', -4).attr('height', PH + 4)
    .on('mousemove', (event, v) => tooltip.show(event, `<b>${nameOf(v.pair.from)} → ${nameOf(v.pair.to)} · ${v.y}</b><br>`
      + `<span class="m">${'p' in v ? `${v.p} points` : `jury ${v.j} · televote ${v.t} points`}</span>`))
    .on('mouseleave', () => tooltip.hide());

  // year labels under each panel
  panel.append('g').selectAll('text').data([1980, 2000, 2020]).join('text').attr('class', 'tick-label')
    .attr('x', v => x(v) + half).attr('y', PH + 14).attr('text-anchor', 'middle').text(v => v);
});
