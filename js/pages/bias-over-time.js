// Favoritism over time: raw favoritism grows with the points system, standardised favoritism does not;
// and since 2016 the televote follows old voting patterns more closely than the jury.
//
// Three rows on one time axis, one bar per voting system: points handed out, favoritism in points,
// favoritism adjusted for the points. Reading down one column shows that a jump in favoritism lines
// up with more points, and that the adjusted row stays level. Separate rows rather than one chart
// with several y-axes, so no scale can be read against another.
/* global d3 */

import { startPage } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const $ = id => document.getElementById(id);
const WIDTH = 900;
const YEAR_AXIS = [1956, 2024];
const DECADES = d3.range(1960, 2030, 10);

startPage(async () => {
  const [data, systems, patterns] = await Promise.all([
    d3.json('data/bias-over-time.json'), d3.json('data/voting-systems.json'), d3.json('data/jury-televote-patterns.json'),
  ]);
  const tooltip = createTooltip();

  const yearsIn = system => data.years.filter(d => d.y >= system.from && d.y <= system.to);
  const meanOf = (system, key) => d3.mean(yearsIn(system), d => d[key]);
  const systemLabel = s => (s.from === s.to ? String(s.from) : `${s.from}–${s.to}`);
  const wide = s => s.to - s.from >= 4;   // wide enough for a value label

  // Three rows on one time axis, read top to bottom: the points handed out, favoritism in points,
  // and favoritism adjusted for the points. The column on the right gives each row's change from
  // the first to the last voting system, so the reader can compare ×11.6, ×3.5 and ×0.9 directly.
  const M = { left: 48, right: 150 };
  const ROW = 118, GAP = 64, TOP = 58;
  const rows = [
    { key: 'ppv', title: 'Points each country hands out', sub: 'more points to give → bigger gaps automatically', kind: 'points', max: 120 },
    { key: 'raw', title: 'Favoritism, in points', sub: 'rises in step with the points', kind: 'fav', digits: 2 },
    { key: 'z', title: 'Favoritism, adjusted for the points system', sub: 'flat: no real growth', kind: 'fav', digits: 2 },
  ].map((r, i) => ({ ...r, top: TOP + i * (ROW + GAP) }));
  const lastBottom = rows.at(-1).top + ROW, H = lastBottom + 28;

  const svg = d3.select('#raw-chart').attr('viewBox', `0 0 ${WIDTH} ${H}`);
  const x = d3.scaleLinear(YEAR_AXIS, [M.left, WIDTH - M.right]);
  const span = s => [x(s.from), x(s.to + 1) - x(s.from)];
  const value = (s, key) => (key === 'ppv' ? Math.round(meanOf(s, key)) : meanOf(s, key));
  const fmt = (row, v) => (row.kind === 'points' ? String(v) : v.toFixed(row.digits));

  // band behind the hovered voting system, through all three rows
  const band = svg.append('rect').attr('class', 'system-band').attr('y', TOP - 6).attr('height', lastBottom - TOP + 6).attr('visibility', 'hidden');

  const first = systems[0], last = systems.at(-1);
  const colX = WIDTH - M.right + 34;
  svg.append('text').attr('class', 'change-head').attr('x', colX).attr('y', TOP - 40).text(`${systemLabel(last)}`);
  svg.append('text').attr('class', 'change-head').attr('x', colX).attr('y', TOP - 26).text(`vs ${systemLabel(first)}`);

  for (const row of rows) {
    const bottom = row.top + ROW;
    const y = d3.scaleLinear([0, row.max ?? d3.max(systems, s => value(s, row.key)) * 1.2], [bottom, row.top]).nice();
    const g = svg.append('g').attr('class', `row row-${row.kind}`);

    g.append('text').attr('class', 'panel-title').attr('x', M.left).attr('y', row.top - 24).text(row.title);
    g.append('text').attr('class', 'panel-sub').attr('x', M.left).attr('y', row.top - 9).text(row.sub);

    const ticks = g.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(3)).join('g');
    ticks.append('line').attr('x1', M.left).attr('x2', WIDTH - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    ticks.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end')
      .text(row.kind === 'points' ? d3.format('d') : d3.format('.1f'));

    const bars = g.append('g').selectAll('g').data(systems).join('g').attr('class', row.kind === 'points' ? 'strip-block' : 'mean-bar');
    bars.append('rect').attr('class', 'block').attr('x', s => span(s)[0] + 1).attr('width', s => span(s)[1] - 2)
      .attr('y', s => y(value(s, row.key))).attr('height', s => bottom - y(value(s, row.key)));
    bars.append('line').attr('x1', s => span(s)[0] + 1).attr('x2', s => span(s)[0] + span(s)[1] - 1)
      .attr('y1', s => y(value(s, row.key))).attr('y2', s => y(value(s, row.key)));
    bars.filter(s => wide(s) || (row.kind === 'points' && s.to - s.from >= 2)).append('text').attr('text-anchor', 'middle')
      .attr('x', s => span(s)[0] + span(s)[1] / 2).attr('y', s => y(value(s, row.key)) - 6)
      .text(s => fmt(row, value(s, row.key)));

    // the change from the first to the last voting system, in the right-hand column
    const ratio = value(last, row.key) / value(first, row.key);
    const flat = Math.abs(ratio - 1) < 0.15;
    const c = g.append('g').attr('class', `change ${flat ? 'is-flat' : 'is-up'}`).attr('transform', `translate(${colX},${row.top + ROW / 2})`);
    c.append('text').attr('class', 'change-value').attr('y', 4).text(`×${ratio.toFixed(ratio >= 10 ? 1 : 2)}`);
    c.append('text').attr('class', 'change-word').attr('y', 22).text(flat ? 'about the same' : `${fmt(row, value(first, row.key))} → ${fmt(row, value(last, row.key))}`);
  }

  svg.append('g').selectAll('text').data(DECADES).join('text').attr('class', 'tick-label')
    .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(d => d);

  const strip = svg.selectAll('.strip-block');

  // ---------- hover: one column per voting system, through all three rows

  const columns = svg.append('g').selectAll('rect').data(systems).join('rect')
    .attr('class', 'system').attr('tabindex', 0)
    .attr('aria-label', s => `${systemLabel(s)}, ${s.title}: raw ${meanOf(s, 'raw').toFixed(2)}, standardised ${meanOf(s, 'z').toFixed(2)}, ${Math.round(meanOf(s, 'ppv'))} points per country`)
    .attr('x', s => span(s)[0]).attr('width', s => Math.max(span(s)[1], 8))
    .attr('y', TOP - 6).attr('height', lastBottom - TOP + 6).attr('fill', 'transparent');

  function show(system) {
    svg.selectAll('.mean-bar, .strip-block').classed('is-on', s => s === system);
    band.attr('visibility', system ? 'visible' : 'hidden');
    if (system) band.attr('x', span(system)[0]).attr('width', span(system)[1]);
    describe(system);
  }
  columns
    .on('mouseenter focus touchstart', (e, s) => show(s))
    .on('mouseleave blur touchend', () => show(null));

  // Short note for one voting system, placed just above its bar in the points row.
  function describe(system) {
    const pop = $('system-pop');
    if (!system) { pop.hidden = true; return; }
    pop.innerHTML = `<b>${systemLabel(system)} · ${system.title}</b><p>${system.text}</p>`;
    pop.hidden = false;
    const block = svg.selectAll('.strip-block').filter(s => s === system).select('rect').node();
    const at = block.getBoundingClientRect(), size = pop.getBoundingClientRect();
    const left = Math.max(8, Math.min(at.left + at.width / 2 - size.width / 2, innerWidth - size.width - 8));
    const above = at.top - size.height - 24;   // clear of the value label on the bar
    pop.style.left = `${left}px`;
    pop.style.top = `${above > 8 ? above : at.bottom + 8}px`;
  }

  // ---------- chart 2: jury and televote against the 2004-2015 pattern
  //
  // For every year since the split: the correlation between each pair's jury (or televote)
  // favoritism that year and the pair's mean favoritism in 2004-2015, when both were combined.
  // Calculated in scripts/build_data.py. Jury and televote colours as on the jury page.

  function renderPatterns() {
    const rows = patterns.years;
    const W = 900, H = 260, M = { left: 48, right: 110, top: 30, bottom: 30 };
    const svg = d3.select('#patterns').attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();
    const x = d3.scalePoint(rows.map(d => d.y), [M.left + 24, W - M.right]);
    const y = d3.scaleLinear([0, 0.8], [H - M.bottom, M.top]);

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
    grid.append('line').attr('x1', M.left).attr('x2', W - M.right + 20).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d3.format('.1f'));
    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('↑ how closely the votes follow the 2004–2015 friendships   (1 = same pattern, 0 = no link)');

    // the gap between the two lines, shaded, with how many times closer the televote follows them
    svg.append('path').datum(rows).attr('class', 'gap-band')
      .attr('d', d3.area().x(d => x(d.y)).y0(d => y(d.jury)).y1(d => y(d.tele)));
    const mid = rows[Math.floor(rows.length / 2)];
    svg.append('text').attr('class', 'gap-label').attr('text-anchor', 'middle')
      .attr('x', (x(mid.y) + x(rows[Math.floor(rows.length / 2) - 1].y)) / 2).attr('y', y((mid.jury + mid.tele) / 2) + 5)
      .text(`televote follows them ×${(patterns.mean.tele / patterns.mean.jury).toFixed(1)} as closely`);
    svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'tick-label')
      .attr('x', d => x(d.y)).attr('y', H - 8).attr('text-anchor', 'middle').text(d => d.y);

    for (const [key, label] of [['jury', 'Jury'], ['tele', 'Televote']]) {
      svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', `var(--${key})`).attr('stroke-width', 2.4).attr('stroke-linejoin', 'round')
        .attr('d', d3.line().x(d => x(d.y)).y(d => y(d[key])));
      svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', d => x(d.y)).attr('cy', d => y(d[key])).attr('r', 4.5)
        .attr('fill', `var(--${key})`).attr('stroke', 'var(--surface)').attr('stroke-width', 2);
      svg.append('text').attr('class', 'end-label').attr('x', x(rows.at(-1).y) + 10).attr('y', y(rows.at(-1)[key]) + 4)
        .text(`${label} ${rows.at(-1)[key].toFixed(2)}`);
    }

    // hover anywhere: a guide snaps to the nearest year
    const guide = svg.append('line').attr('class', 'guide').attr('y1', M.top).attr('y2', H - M.bottom).attr('visibility', 'hidden');
    svg.append('rect').attr('x', M.left).attr('y', M.top).attr('width', W - M.right - M.left + 20).attr('height', H - M.bottom - M.top).attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        const d = d3.least(rows, r => Math.abs(x(r.y) - mx));
        guide.attr('x1', x(d.y)).attr('x2', x(d.y)).attr('visibility', 'visible');
        tooltip.show(event, `<b>${d.y}</b><br><span class="m">jury ${d.jury.toFixed(2)} · televote ${d.tele.toFixed(2)}</span><br><span class="m">${d.n} country pairs</span>`);
      })
      .on('mouseleave', () => { guide.attr('visibility', 'hidden'); tooltip.hide(); });
  }


  $('tele-mean').textContent = patterns.mean.tele.toFixed(2);
  $('jury-mean').textContent = patterns.mean.jury.toFixed(2);
  renderPatterns();
});
