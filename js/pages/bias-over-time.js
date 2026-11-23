// Favoritism over time.
//
// Chart 1: a heatmap, one row per voting country and one column per final. The colour of a cell is
// that country's mean favoritism in that final (the average gap, in points, between its vote and
// what the other countries gave the same song). A thin strip above the columns gives the points
// each country gave under the voting system of that year. Rows are ordered by first final, so
// countries joining show as the staircase on the left.
//
// Chart 2: two maps side by side, jury and televote. A line joins each of the 15 pairs with the
// highest favoritism in 2004-2015; its width is the average points the giver gave the receiver in
// the 2016-2023 finals, from the jury (left) or the televote (right). Same width scale on both maps.
/* global d3 */

import { startPage, cssVar, onThemeChange } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';
import { createEuropeMap } from '../shared/europe-map.js';

const FIRST = 1957, LAST = 2023;

startPage(async () => {
  const [data, systems, friends, countries, topology] = await Promise.all([
    d3.json('data/bias-over-time.json'), d3.json('data/voting-systems.json'), d3.json('data/old-friendships.json'),
    d3.json('data/countries.json'), d3.json('data/europe.topo.json'),
  ]);
  const name = new Map(countries.map(c => [c.id, c.name]));
  const nameOf = id => name.get(id) ?? id.toUpperCase();
  const tooltip = createTooltip();
  const systemOf = year => systems.find(s => year >= s.from && year <= s.to);
  const yearInfo = new Map(data.years.map(d => [d.y, d]));

  const paintHeatmap = renderHeatmap();
  paintHeatmap();
  onThemeChange(paintHeatmap);
  renderMaps();

  // ---------- chart 1: favoritism per country and final

  function renderHeatmap() {
    const rows = data.countries;
    const years = d3.range(FIRST, LAST + 1).filter(y => yearInfo.has(y));
    const CELL_H = 10, W = 900, M = { left: 132, right: 16, top: 30, bottom: 70 };
    const H = M.top + rows.length * CELL_H + M.bottom;
    const svg = d3.select('#heatmap').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleBand(years, [M.left, W - M.right]).paddingInner(0.08);
    const y = d3.scaleBand(rows.map(r => r.c), [M.top, M.top + rows.length * CELL_H]).paddingInner(0.12);
    const MAX = 4.5;

    // strip above the columns: points each country gave, one block per voting system
    const strip = svg.append('g').attr('class', 'pts-strip');
    for (const s of systems) {
      const ys = years.filter(v => v >= s.from && v <= s.to);
      if (!ys.length) continue;
      const x0 = x(ys[0]), x1 = x(ys.at(-1)) + x.bandwidth();
      const pts = Math.round(d3.mean(ys, v => yearInfo.get(v).ppv));
      strip.append('rect').attr('x', x0).attr('width', x1 - x0).attr('y', 4).attr('height', 16);
      if (x1 - x0 > 26) strip.append('text').attr('x', (x0 + x1) / 2).attr('y', 16).attr('text-anchor', 'middle').text(s.from === 1971 ? `≈${pts}` : pts);
    }
    svg.append('text').attr('class', 'strip-label').attr('x', M.left - 8).attr('y', 16).attr('text-anchor', 'end').text('points per country');

    // country names
    svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'row-label')
      .attr('x', M.left - 8).attr('y', r => y(r.c) + y.bandwidth() / 2 + 3.5).attr('text-anchor', 'end').text(r => nameOf(r.c));

    // cells
    const cells = rows.flatMap(r => Object.entries(r.v).map(([yr, v]) => ({ c: r.c, y: +yr, v })));
    const rects = svg.append('g').selectAll('rect').data(cells).join('rect').attr('class', 'cell')
      .attr('x', d => x(d.y)).attr('width', x.bandwidth()).attr('y', d => y(d.c)).attr('height', y.bandwidth())
      .on('mousemove', (event, d) => tooltip.show(event, `<b>${nameOf(d.c)} · ${d.y}</b><br>`
        + `<span class="m">favoritism ${d.v.toFixed(2)} points</span><br>`
        + `<span class="m">${Math.round(yearInfo.get(d.y).ppv)} points per country · ${systemOf(d.y)?.title ?? ''}</span>`))
      .on('mouseleave', () => tooltip.hide());

    // year axis
    const bottom = M.top + rows.length * CELL_H;
    svg.append('g').selectAll('text').data(years.filter(v => v % 10 === 0)).join('text').attr('class', 'tick-label')
      .attr('x', v => x(v) + x.bandwidth() / 2).attr('y', bottom + 16).attr('text-anchor', 'middle').text(v => v);

    // colour legend
    const LW = 220, lx = W - M.right - LW, ly = bottom + 36;
    const grad = svg.append('defs').append('linearGradient').attr('id', 'heat-grad');
    const legend = svg.append('g').attr('class', 'heat-legend');
    legend.append('rect').attr('x', lx).attr('y', ly).attr('width', LW).attr('height', 10).attr('fill', 'url(#heat-grad)');
    legend.selectAll('text.tick-label').data([0, 1, 2, 3, 4]).join('text').attr('class', 'tick-label')
      .attr('x', v => lx + (v / MAX) * LW).attr('y', ly + 24).attr('text-anchor', 'middle').text(v => (v === 4 ? '4+' : v));
    legend.append('text').attr('class', 'strip-label').attr('x', lx - 10).attr('y', ly + 9).attr('text-anchor', 'end').text('favoritism, points');

    // colours come from the theme, so they are set here and again when the theme changes
    return function paint() {
      const colour = d3.scaleSequential(d3.interpolateLab(cssVar('--heat-lo'), cssVar('--heat-hi'))).domain([0, MAX]).clamp(true);
      rects.attr('fill', d => colour(d.v));
      grad.selectAll('stop').data(d3.range(0, 1.01, 0.1)).join('stop')
        .attr('offset', t => `${t * 100}%`).attr('stop-color', t => colour(t * MAX));
    };
  }

  // ---------- chart 2: the strongest old friendships, jury map and televote map

  function renderMaps() {
    const pairs = friends.pairs;
    const involved = new Set(pairs.flatMap(p => [p.from, p.to]));
    const width = d3.scaleLinear([0, 12], [1, 12]);

    for (const [key, label] of [['jury', 'Jury'], ['tele', 'Televote']]) {
      d3.select(`#avg-${key}`).text(friends.mean[key].toFixed(1));
      const svg = d3.select(`#map-${key}`);
      const map = createEuropeMap(svg, topology, {
        move: (e, id) => involved.has(id) && tooltip.show(e, `<b>${nameOf(id)}</b>`),
        leave: () => tooltip.hide(),
      });
      map.paint({ fill: id => (involved.has(id) ? 'var(--land-strong)' : 'var(--land)'), ink: () => 'var(--fg-2)' });
      map.relabel(id => (involved.has(id) ? id.toUpperCase() : ''), 20);
      svg.select('.map-note').node()?.parentNode.remove();   // the Atlantic boxes: no pair uses them

      // one curved line per pair, bending to the right of its direction, so A→B and B→A separate
      const arc = p => {
        const [x1, y1] = map.position[p.from], [x2, y2] = map.position[p.to];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        const bend = 0.18;
        return `M${x1},${y1}Q${mx - dy * bend},${my + dx * bend} ${x2},${y2}`;
      };
      map.overlay.selectAll('path').data([...pairs].sort((a, b) => b[key] - a[key])).join('path')
        .attr('class', p => `bond ${key}${p[key] === 0 ? ' none' : ''}`)
        .attr('d', arc).attr('stroke-width', p => width(p[key]))
        .on('mousemove', (event, p) => tooltip.show(event, `<b>${nameOf(p.from)} → ${nameOf(p.to)}</b><br>`
          + `<span class="m">${label.toLowerCase()} ${p[key].toFixed(1)} points (${p.n} finals)</span>`))
        .on('mouseleave', () => tooltip.hide());
    }

    // width legend, shared by both maps
    const svg = d3.select('#width-legend').attr('viewBox', '0 0 420 34');
    const g = svg.selectAll('g').data([0, 4, 8, 12]).join('g').attr('transform', (d, i) => `translate(${150 + i * 70},0)`);
    g.append('line').attr('class', d => `bond legend${d === 0 ? ' none' : ''}`).attr('x1', 0).attr('x2', 40).attr('y1', 12).attr('y2', 12)
      .attr('stroke-width', d => width(d));
    g.append('text').attr('class', 'tick-label').attr('x', 20).attr('y', 32).attr('text-anchor', 'middle').text(d => d);
    svg.append('text').attr('class', 'strip-label').attr('x', 136).attr('y', 16).attr('text-anchor', 'end').text('average points');
  }
});
