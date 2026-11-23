// Favoritism over time.
//
// Chart 1: favoritism in points per year for the real votes, next to the same measure for random
// votes under the same points (each country's points shuffled over the songs). Both lines jump at
// the same moments, when the points system changes, and the random line rises even more. That
// shows the rise comes from the points, without needing a paragraph to say it. Lines are labelled
// directly at their ends instead of with a legend.
//
// Chart 2: the points the strongest 2004-2015 friendships got from jury and televote since 2016.
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
  const [data, systems, friends, countries] = await Promise.all([
    d3.json('data/bias-over-time.json'), d3.json('data/voting-systems.json'), d3.json('data/old-friendships.json'), d3.json('data/countries.json'),
  ]);
  const countryName = new Map(countries.map(c => [c.id, c.name]));
  const tooltip = createTooltip();
  const systemOf = year => systems.find(s => year >= s.from && year <= s.to);

  renderFavoritism();
  renderFriends();

  // ---------- chart 1: real votes against random votes

  function renderFavoritism() {
    const rows = data.years;
    const W = 900, H = 356, M = { left: 44, right: 170, top: 50, bottom: 28 };
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

    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 14).text('↑ favoritism, points');
    const line = key => d3.line().x(d => x(d.y)).y(d => y(d[key]));
    svg.append('path').datum(rows).attr('class', 'line-random').attr('d', line('rnd'));
    svg.append('path').datum(rows).attr('class', 'line-real').attr('d', line('raw'));

    const end = rows.at(-1);
    svg.append('text').attr('class', 'end-label random').attr('x', x(end.y) + 10).attr('y', y(end.rnd) + 4).text('If voting were random');
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
