// Favoritism over time: how often a vote is far above what the other countries gave the same song.
//
// Favoritism of a vote = its points minus the average the other voting countries gave the same
// song that year, standardised to the 12-point scale as on the other pages (each year scaled to the
// spread of an average 1975-2015 final; scripts/build_data.py). A slider sets how many points above
// that average a vote must be (5 to 12); the bar chart shows, per year, how many votes reach it, as
// a number or as a share of all votes that year. From 2016 the jury and the televote each give a
// set of points, so those years have two bars side by side.
// A line through the bars is the average of the five nearest contests (two before, two after), so
// the direction over time can be read through the year-to-year ups and downs. In 2016-2023 it uses
// the mean of the jury and televote bars. 2020 had no contest and is left empty.
/* global d3 */

import { startPage, segmented } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';
import { renderRegions } from './bias-regions.js';

const W = 900, H = 340, M = { left: 48, right: 16, top: 16, bottom: 28 };
const FIRST = 1957, LAST = 2023, WINDOW = 2;   // two contests either side
const LABEL = { all: 'All votes', jury: 'Jury', tele: 'Televote' };

startPage(async () => {
  const [{ years }, countries] = await Promise.all([d3.json('data/favoritism-years.json'), d3.json('data/countries.json')]);
  const name = new Map(countries.map(c => [c.id, c.name]));
  const nameOf = id => name.get(id) ?? id.toUpperCase();
  const tooltip = createTooltip();
  renderRegions(tooltip);
  const state = { t: 5, share: false };   // threshold in standardised points: 5 to 12

  const svg = d3.select('#bars').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand(d3.range(FIRST, LAST + 1), [M.left, W - M.right]).paddingInner(0.2);
  const y = d3.scaleLinear().range([H - M.bottom, M.top]);
  const half = x.bandwidth() / 2;

  // one bar per year before 2016, jury and televote side by side from 2016
  const bars = years.flatMap(d => Object.keys(LABEL).filter(k => d[k]).map(k => ({ y: d.y, key: k, ...d[k] })));
  const xOf = b => x(b.y) + (b.key === 'tele' ? half : 0);
  const wOf = b => (b.key === 'all' ? x.bandwidth() : half);
  const value = b => (state.share ? b.c[state.t] / b.n : b.c[state.t]);

  // the trend: per contest the bar (or the mean of jury and televote), then a centred 5-contest average
  function trend() {
    const perYear = years.map(d => ({ y: d.y, v: d3.mean(bars.filter(b => b.y === d.y), value) }));
    return perYear.map((d, i) => ({
      y: d.y, v: d3.mean(perYear.slice(Math.max(0, i - WINDOW), i + WINDOW + 1), e => e.v),
    }));
  }

  const gridG = svg.append('g').attr('class', 'grid');
  svg.append('g').selectAll('text').data(d3.range(1960, 2030, 10)).join('text').attr('class', 'tick-label')
    .attr('x', v => x(v) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(v => v);

  const rects = svg.append('g').selectAll('rect').data(bars).join('rect')
    .attr('class', b => `bar ${b.key}`).attr('x', xOf).attr('width', wOf).attr('y', y(0)).attr('height', 0)
    .on('mousemove', (event, b) => tooltip.show(event, tip(b)))
    .on('mouseleave', () => tooltip.hide());
  const trendLine = svg.append('path').attr('class', 'trend');

  function tip(b) {
    const big = b.top.filter(([, , f]) => f >= state.t).slice(0, 3)
      .map(([g, r, f, p]) => `${nameOf(g)} → ${nameOf(r)}: ${p} pts (+${f.toFixed(1)})`).join('<br>');
    return `<b>${b.y}${b.key === 'all' ? '' : ` · ${LABEL[b.key]}`}</b><br>`
      + `<span class="m">${b.c[state.t]} of ${b.n} votes (${d3.format('.1%')(b.c[state.t] / b.n)})</span>`
      + (big ? `<br><span class="m">${big}</span>` : '');
  }

  function render() {
    const fmt = state.share ? d3.format('.0%') : d3.format('d');
    y.domain([0, d3.max(bars, value) || 1]).nice();
    gridG.selectAll('g').data(y.ticks(4).filter(t => state.share || Number.isInteger(t)), d => d).join(
      enter => { const g = enter.append('g'); g.append('line'); g.append('text').attr('class', 'tick-label'); return g; },
    ).call(g => {
      g.select('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
      g.select('text').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(fmt);
    });
    rects.transition().duration(350).attr('y', b => y(value(b))).attr('height', b => y(0) - y(value(b)));
    trendLine.datum(trend()).transition().duration(350)
      .attr('d', d3.line().x(d => x(d.y) + x.bandwidth() / 2).y(d => y(d.v)).curve(d3.curveMonotoneX));
    d3.select('#t-value').text(state.t);
  }

  const slider = document.getElementById('threshold');
  slider.value = state.t;
  slider.addEventListener('input', () => { state.t = +slider.value; render(); });
  segmented(document.getElementById('measure'), v => { state.share = v === 'share'; render(); });
  render();
});
