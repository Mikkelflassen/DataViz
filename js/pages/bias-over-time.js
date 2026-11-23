// Favoritism over time.
//
// Chart 1: favoritism in points per year for the real votes, next to the same measure for random
// votes under the same points (each country's points shuffled over the songs). Both lines jump at
// the same moments, when the points system changes, and the random line rises even more. That
// shows the rise comes from the points, without needing a paragraph to say it. Lines are labelled
// directly at their ends instead of with a legend.
//
// Chart 2: since 2016, how closely jury and televote favoritism follow each pair's 2004-2015 mean.
/* global d3 */

import { startPage } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const $ = id => document.getElementById(id);

// Where the number of points each country gives changes for good, with the new number.
const STEPS = [
  { from: 1957, label: '10 points per country' },
  { from: 1975, label: '58 points' },
  { from: 2016, label: '116 points' },
];

startPage(async () => {
  const [data, systems, patterns] = await Promise.all([
    d3.json('data/bias-over-time.json'), d3.json('data/voting-systems.json'), d3.json('data/jury-televote-patterns.json'),
  ]);
  const tooltip = createTooltip();
  const systemOf = year => systems.find(s => year >= s.from && year <= s.to);

  renderFavoritism();
  renderPatterns();

  // ---------- chart 1: real votes against random votes

  function renderFavoritism() {
    const rows = data.years;
    const W = 900, H = 340, M = { left: 44, right: 120, top: 34, bottom: 28 };
    const svg = d3.select('#fav-chart').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([1957, 2023], [M.left, W - M.right]);
    const y = d3.scaleLinear([0, d3.max(rows, d => d.rnd)], [H - M.bottom, M.top]).nice();

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
    grid.append('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d => d);
    svg.append('g').selectAll('text').data(d3.range(1960, 2030, 10)).join('text').attr('class', 'tick-label')
      .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(d => d);

    // the two lasting changes in the points system
    const step = svg.append('g').selectAll('g').data(STEPS).join('g').attr('class', 'step');
    step.filter((d, i) => i > 0).append('line').attr('x1', d => x(d.from - 0.5)).attr('x2', d => x(d.from - 0.5)).attr('y1', M.top - 18).attr('y2', H - M.bottom);
    step.append('text').attr('x', (d, i) => (i ? x(d.from - 0.5) + 6 : M.left)).attr('y', M.top - 8).text(d => d.label);

    const line = key => d3.line().x(d => x(d.y)).y(d => y(d[key]));
    svg.append('path').datum(rows).attr('class', 'line-random').attr('d', line('rnd'));
    svg.append('path').datum(rows).attr('class', 'line-real').attr('d', line('raw'));

    const end = rows.at(-1);
    svg.append('text').attr('class', 'end-label random').attr('x', x(end.y) + 10).attr('y', y(end.rnd) + 4).text('Random votes');
    svg.append('text').attr('class', 'end-label real').attr('x', x(end.y) + 10).attr('y', y(end.raw) + 4).text('Real votes');

    // hover: a guide snaps to the nearest year
    const guide = svg.append('line').attr('class', 'guide').attr('y1', M.top).attr('y2', H - M.bottom).attr('visibility', 'hidden');
    const dots = svg.append('g').attr('visibility', 'hidden');
    const dotReal = dots.append('circle').attr('class', 'dot-real').attr('r', 4);
    const dotRandom = dots.append('circle').attr('class', 'dot-random').attr('r', 4);
    svg.append('rect').attr('x', M.left).attr('y', M.top).attr('width', W - M.right - M.left).attr('height', H - M.bottom - M.top).attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        const d = d3.least(rows, r => Math.abs(x(r.y) - mx));
        guide.attr('x1', x(d.y)).attr('x2', x(d.y)).attr('visibility', 'visible');
        dots.attr('visibility', 'visible');
        dotReal.attr('cx', x(d.y)).attr('cy', y(d.raw));
        dotRandom.attr('cx', x(d.y)).attr('cy', y(d.rnd));
        tooltip.show(event, `<b>${d.y}</b> · ${Math.round(d.ppv)} points per country<br>`
          + `<span class="m">real ${d.raw.toFixed(2)} · random ${d.rnd.toFixed(2)}</span><br>`
          + `<span class="m">${systemOf(d.y)?.title ?? ''}</span>`);
      })
      .on('mouseleave', () => { guide.attr('visibility', 'hidden'); dots.attr('visibility', 'hidden'); tooltip.hide(); });
  }

  // ---------- chart 2: jury and televote against the 2004-2015 pattern
  //
  // For every year since the split: the correlation between each pair's jury (or televote)
  // favoritism that year and the pair's mean favoritism in 2004-2015, when both were combined.
  // Calculated in scripts/build_data.py. Jury and televote colours as on the jury page.

  function renderPatterns() {
    const rows = patterns.years;
    const W = 900, H = 260, M = { left: 44, right: 120, top: 30, bottom: 28 };
    const svg = d3.select('#patterns').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scalePoint(rows.map(d => d.y), [M.left + 24, W - M.right]);
    const y = d3.scaleLinear([0, 0.8], [H - M.bottom, M.top]);

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
    grid.append('line').attr('x1', M.left).attr('x2', W - M.right + 20).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d3.format('.1f'));
    svg.append('text').attr('class', 'note').attr('x', M.left).attr('y', 14).text('↑ follows the 2004–2015 friendships');
    svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'tick-label')
      .attr('x', d => x(d.y)).attr('y', H - 6).attr('text-anchor', 'middle').text(d => d.y);

    // the gap between the two lines, shaded, with the ratio of the means
    svg.append('path').datum(rows).attr('class', 'gap-band')
      .attr('d', d3.area().x(d => x(d.y)).y0(d => y(d.jury)).y1(d => y(d.tele)));
    const a = rows[Math.floor(rows.length / 2) - 1], b = rows[Math.floor(rows.length / 2)];
    svg.append('text').attr('class', 'gap-label').attr('text-anchor', 'middle')
      .attr('x', (x(a.y) + x(b.y)) / 2).attr('y', y((a.jury + a.tele + b.jury + b.tele) / 4) + 6)
      .text(`×${(patterns.mean.tele / patterns.mean.jury).toFixed(1)}`);

    for (const [key, label] of [['jury', 'Jury'], ['tele', 'Televote']]) {
      svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', `var(--${key})`).attr('stroke-width', 2.4).attr('stroke-linejoin', 'round')
        .attr('d', d3.line().x(d => x(d.y)).y(d => y(d[key])));
      svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', d => x(d.y)).attr('cy', d => y(d[key])).attr('r', 4.5)
        .attr('fill', `var(--${key})`).attr('stroke', 'var(--surface)').attr('stroke-width', 2);
      svg.append('text').attr('class', `end-label ${key}`).attr('x', x(rows.at(-1).y) + 10).attr('y', y(rows.at(-1)[key]) + 4).text(label);
    }

    const guide = svg.append('line').attr('class', 'guide').attr('y1', M.top).attr('y2', H - M.bottom).attr('visibility', 'hidden');
    svg.append('rect').attr('x', M.left).attr('y', M.top).attr('width', W - M.right - M.left + 20).attr('height', H - M.bottom - M.top).attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        const d = d3.least(rows, r => Math.abs(x(r.y) - mx));
        guide.attr('x1', x(d.y)).attr('x2', x(d.y)).attr('visibility', 'visible');
        tooltip.show(event, `<b>${d.y}</b><br><span class="m">televote ${d.tele.toFixed(2)} · jury ${d.jury.toFixed(2)}</span>`);
      })
      .on('mouseleave', () => { guide.attr('visibility', 'hidden'); tooltip.hide(); });
  }
});
