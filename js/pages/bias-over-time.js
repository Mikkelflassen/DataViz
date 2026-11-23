// Favoritism over time.
//
// Chart 1: two panels on one time axis. Above, the points each country gives in the final; below,
// favoritism in points per year. Dotted lines through both panels mark the two lasting changes in
// the points system, and one hover guide runs through both, so the reader can compare the two
// shapes directly. Two panels rather than one chart with two y-axes, so neither scale can be read
// against the other.
//
// Chart 2: the points the strongest 2004-2015 friendships got from jury and televote since 2016.
/* global d3 */

import { startPage } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const CHANGES = [1975, 2016];   // the points per country go from 10 to 58, and from 58 to 116

startPage(async () => {
  const [data, systems, friends, countries] = await Promise.all([
    d3.json('data/bias-over-time.json'), d3.json('data/voting-systems.json'), d3.json('data/old-friendships.json'), d3.json('data/countries.json'),
  ]);
  const countryName = new Map(countries.map(c => [c.id, c.name]));
  const tooltip = createTooltip();
  const systemOf = year => systems.find(s => year >= s.from && year <= s.to);

  renderFavoritism();
  renderFriends();

  // ---------- chart 1: points per country above, favoritism below

  function renderFavoritism() {
    const rows = data.years;
    const W = 900, M = { left: 48, right: 40 };
    const P = { top: 30, height: 90 };                 // points panel
    const F = { top: P.top + P.height + 56, height: 200 }; // favoritism panel
    const H = F.top + F.height + 28;
    const svg = d3.select('#fav-chart').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([1956.5, 2023.5], [M.left, W - M.right]);
    const yP = d3.scaleLinear([0, 120], [P.top + P.height, P.top]);
    const yF = d3.scaleLinear([0, d3.max(rows, d => d.raw)], [F.top + F.height, F.top]).nice();

    // panel titles and grids
    svg.append('text').attr('class', 'panel-title').attr('x', M.left).attr('y', P.top - 14).text('Points each country gives in the final');
    svg.append('text').attr('class', 'panel-title').attr('x', M.left).attr('y', F.top - 14).text('Favoritism, points');
    for (const [y, ticks, panel] of [[yP, [0, 50, 100], P], [yF, yF.ticks(4), F]]) {
      const g = svg.append('g').attr('class', 'grid').selectAll('g').data(ticks).join('g');
      g.append('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
      g.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d => d);
    }
    svg.append('g').selectAll('text').data(d3.range(1960, 2030, 10)).join('text').attr('class', 'tick-label')
      .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(d => d);

    // the two lasting changes, through both panels
    svg.append('g').selectAll('line').data(CHANGES).join('line').attr('class', 'change-line')
      .attr('x1', d => x(d - 0.5)).attr('x2', d => x(d - 0.5)).attr('y1', P.top - 4).attr('y2', F.top + F.height);

    // points per country: a step area, one step per contest
    const step = d3.area().x(d => x(d.y)).y0(yP(0)).y1(d => yP(d.ppv)).curve(d3.curveStep);
    svg.append('path').datum(rows).attr('class', 'points-area').attr('d', step);
    svg.append('path').datum(rows).attr('class', 'points-line').attr('d', step.lineY1());
    const labels = [[1965, 10], [1972, 86, '≈86'], [1995, 58], [2019.5, 116]];
    svg.append('g').selectAll('text').data(labels).join('text').attr('class', 'points-label').attr('text-anchor', 'middle')
      .attr('x', d => x(d[0])).attr('y', d => yP(d[1]) - 6).text(d => d[2] ?? d[1]);

    // favoritism per contest
    svg.append('path').datum(rows).attr('class', 'line-real').attr('d', d3.line().x(d => x(d.y)).y(d => yF(d.raw)));

    // hover: one guide through both panels, snapping to the nearest contest
    const guide = svg.append('line').attr('class', 'guide').attr('y1', P.top).attr('y2', F.top + F.height).attr('visibility', 'hidden');
    const dots = svg.append('g').attr('visibility', 'hidden');
    const dotP = dots.append('circle').attr('class', 'dot-points').attr('r', 4);
    const dotF = dots.append('circle').attr('class', 'dot-real').attr('r', 4);
    svg.append('rect').attr('x', M.left).attr('y', P.top).attr('width', W - M.left - M.right).attr('height', F.top + F.height - P.top).attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        const d = d3.least(rows, r => Math.abs(x(r.y) - mx));
        guide.attr('x1', x(d.y)).attr('x2', x(d.y)).attr('visibility', 'visible');
        dots.attr('visibility', 'visible');
        dotP.attr('cx', x(d.y)).attr('cy', yP(d.ppv));
        dotF.attr('cx', x(d.y)).attr('cy', yF(d.raw));
        tooltip.show(event, `<b>${d.y}</b> · ${systemOf(d.y)?.title ?? ''}<br>`
          + `<span class="m">${Math.round(d.ppv)} points per country · favoritism ${d.raw.toFixed(2)}</span>`);
      })
      .on('mouseleave', () => { guide.attr('visibility', 'hidden'); dots.attr('visibility', 'hidden'); tooltip.hide(); });
  }

  // ---------- chart 2: points from jury and televote to the strongest old friendships
  //
  // One row per pair, strongest 2004-2015 friendship first: the average jury and televote points
  // the giver gave the receiver in the 2016-2023 finals, as two dots on one 0-12 axis (a dumbbell).
  // A dashed line marks what any pair gets on average. Calculated in scripts/build_data.py.

  function renderFriends() {
    const rows = friends.pairs;
    const ROW = 24, W = 900, M = { left: 210, right: 70, top: 30, bottom: 30 };
    const H = M.top + (rows.length + 2) * ROW + M.bottom;
    const svg = d3.select('#friends').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([0, 12], [M.left, W - M.right]);
    const rowY = i => M.top + (i + 0.5) * ROW;
    const avgY = M.top + (rows.length + 1.5) * ROW;
    const name = id => countryName.get(id) ?? id.toUpperCase();

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(d3.range(0, 13, 2)).join('g');
    grid.append('line').attr('x1', x).attr('x2', x).attr('y1', M.top - 6).attr('y2', H - M.bottom).classed('zero', t => !t);
    grid.append('text').attr('class', 'tick-label').attr('x', x).attr('y', H - 10).attr('text-anchor', 'middle').text(d => d);
    svg.append('text').attr('class', 'note').attr('x', W - M.right).attr('y', H - 10).attr('text-anchor', 'start').attr('dx', 10).text('points');

    // what any pair gets on average
    const any = (friends.anyPair.jury + friends.anyPair.tele) / 2;
    svg.append('line').attr('class', 'any-pair').attr('x1', x(any)).attr('x2', x(any)).attr('y1', M.top - 6).attr('y2', H - M.bottom);
    svg.append('text').attr('class', 'any-label').attr('x', x(any)).attr('y', M.top - 12).attr('text-anchor', 'middle').text(`any pair ${any.toFixed(1)}`);

    function dumbbell(g, d, y, r) {
      g.append('line').attr('class', 'bar').attr('x1', x(d.jury)).attr('x2', x(d.tele)).attr('y1', y).attr('y2', y);
      g.append('circle').attr('class', 'dot jury').attr('cx', x(d.jury)).attr('cy', y).attr('r', r);
      g.append('circle').attr('class', 'dot tele').attr('cx', x(d.tele)).attr('cy', y).attr('r', r);
    }

    const pair = svg.append('g').selectAll('g').data(rows).join('g').attr('class', 'pair');
    pair.append('rect').attr('class', 'row-hit').attr('x', 0).attr('width', W).attr('y', (d, i) => rowY(i) - ROW / 2).attr('height', ROW);
    pair.append('text').attr('class', 'pair-label').attr('x', M.left - 14).attr('y', (d, i) => rowY(i) + 4).attr('text-anchor', 'end')
      .text(d => `${name(d.from)} → ${name(d.to)}`);
    pair.each(function (d, i) { dumbbell(d3.select(this), d, rowY(i), 5.5); });
    pair.on('mousemove', (event, d) => tooltip.show(event, `<b>${name(d.from)} → ${name(d.to)}</b><br>`
        + `<span class="m">televote ${d.tele.toFixed(1)} · jury ${d.jury.toFixed(1)} points</span><br>`
        + `<span class="m">${d.n} finals since 2016</span>`))
      .on('mouseleave', () => tooltip.hide());

    // the average of the rows, set apart below them
    svg.append('line').attr('class', 'avg-rule').attr('x1', 20).attr('x2', W - M.right).attr('y1', avgY - ROW * 1.1).attr('y2', avgY - ROW * 1.1);
    const avg = svg.append('g').attr('class', 'pair avg');
    avg.append('text').attr('class', 'pair-label').attr('x', M.left - 14).attr('y', avgY + 4).attr('text-anchor', 'end').text('Average');
    dumbbell(avg, friends.mean, avgY, 7);
    avg.append('text').attr('class', 'avg-value jury').attr('x', x(friends.mean.jury)).attr('y', avgY - 12).attr('text-anchor', 'middle').text(friends.mean.jury.toFixed(1));
    avg.append('text').attr('class', 'avg-value tele').attr('x', x(friends.mean.tele)).attr('y', avgY - 12).attr('text-anchor', 'middle').text(friends.mean.tele.toFixed(1));
  }
});
