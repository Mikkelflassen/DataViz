// Favoritism over time: raw favoritism grows with the points system, standardised favoritism does not;
// and since 2016 the televote follows old voting patterns more closely than the jury.
//
// Two panels on one time axis, raw above and standardised below, each showing the mean for every
// voting system. Underneath, the points a country awarded under each system. Reading down one
// column shows that a jump in the raw panel lines up with more points, not with a jump in the
// standardised panel. Two panels rather than one chart with two y-axes, so neither scale can be
// read against the other.
/* global d3 */

import { startPage } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';
import { NO_CONTEST, NO_CONTEST_TIP, axisYears, drawNoContestBridge } from '../shared/no-contest.js';

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

  const M = { left: 48, right: 20 };
  const PANEL = 150, GAP = 46, STRIP = 62, TOP = 26;
  const panels = [
    { key: 'raw', label: 'Raw', unit: 'points', top: TOP },
    { key: 'z', label: 'Standardised', unit: 'SD units', top: TOP + PANEL + GAP },
  ];
  const stripTop = TOP + 2 * PANEL + 2 * GAP, stripBottom = stripTop + STRIP, H = stripBottom + 26;

  const svg = d3.select('#raw-chart').attr('viewBox', `0 0 ${WIDTH} ${H}`);
  const x = d3.scaleLinear(YEAR_AXIS, [M.left, WIDTH - M.right]);
  const span = s => [x(s.from), x(s.to + 1) - x(s.from)];

  // band behind the hovered voting system, through all three rows
  const band = svg.append('rect').attr('class', 'system-band').attr('y', TOP - 6).attr('height', stripBottom - TOP + 6).attr('visibility', 'hidden');

  // ---------- the two panels: one bar per voting system, from zero to its mean

  const first = systems[0], last = systems.at(-1);
  for (const panel of panels) {
    const bottom = panel.top + PANEL;
    const y = d3.scaleLinear([0, d3.max(systems, s => meanOf(s, panel.key)) * 1.15], [bottom, panel.top]).nice();
    const g = svg.append('g');

    const ticks = g.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
    ticks.append('line').attr('x1', M.left).attr('x2', WIDTH - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    ticks.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d3.format('.1f'));

    const title = g.append('text').attr('class', 'panel-title').attr('x', M.left).attr('y', panel.top - 12).text(panel.label);
    g.append('text').attr('class', 'note').attr('x', M.left + title.node().getComputedTextLength() + 8).attr('y', panel.top - 12).text(panel.unit);
    const ratio = meanOf(last, panel.key) / meanOf(first, panel.key);
    g.append('text').attr('class', 'panel-change').attr('x', WIDTH - M.right).attr('y', panel.top - 12).attr('text-anchor', 'end')
      .text(`${systemLabel(last)} vs ${systemLabel(first)}: ×${ratio.toFixed(2)}`);

    const bars = g.append('g').selectAll('g').data(systems).join('g').attr('class', 'mean-bar');
    bars.append('rect').attr('x', s => span(s)[0] + 1).attr('width', s => span(s)[1] - 2)
      .attr('y', s => y(meanOf(s, panel.key))).attr('height', s => bottom - y(meanOf(s, panel.key)));
    bars.append('line').attr('x1', s => span(s)[0] + 1).attr('x2', s => span(s)[0] + span(s)[1] - 1)
      .attr('y1', s => y(meanOf(s, panel.key))).attr('y2', s => y(meanOf(s, panel.key)));
    bars.filter(wide).append('text').attr('text-anchor', 'middle')
      .attr('x', s => span(s)[0] + span(s)[1] / 2).attr('y', s => y(meanOf(s, panel.key)) - 6)
      .text(s => meanOf(s, panel.key).toFixed(2));
  }

  // ---------- the strip: points a country awarded under each system

  const height = d3.scaleLinear([0, 120], [0, STRIP]).clamp(true);
  const points = s => Math.round(meanOf(s, 'ppv'));
  svg.append('text').attr('class', 'panel-title').attr('x', M.left).attr('y', stripTop - 12).text('Points awarded per country');
  const strip = svg.append('g').selectAll('g').data(systems).join('g').attr('class', 'strip-block');
  strip.append('rect').attr('class', 'block').attr('x', s => span(s)[0] + 1).attr('width', s => span(s)[1] - 2)
    .attr('y', s => stripBottom - height(points(s))).attr('height', s => height(points(s)));
  strip.filter(s => s.to - s.from >= 2).append('text').attr('text-anchor', 'middle')
    .attr('x', s => span(s)[0] + span(s)[1] / 2).attr('y', s => Math.min(stripBottom - 6, stripBottom - height(points(s)) + 15))
    .text(s => points(s));

  svg.append('g').selectAll('text').data(DECADES).join('text').attr('class', 'tick-label')
    .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(d => d);

  // ---------- hover: one column per voting system, through all three rows

  const columns = svg.append('g').selectAll('rect').data(systems).join('rect')
    .attr('class', 'system').attr('tabindex', 0)
    .attr('aria-label', s => `${systemLabel(s)}, ${s.title}: raw ${meanOf(s, 'raw').toFixed(2)}, standardised ${meanOf(s, 'z').toFixed(2)}, ${points(s)} points per country`)
    .attr('x', s => span(s)[0]).attr('width', s => Math.max(span(s)[1], 8))
    .attr('y', TOP - 6).attr('height', stripBottom - TOP + 6).attr('fill', 'transparent');

  function show(system) {
    svg.selectAll('.mean-bar, .strip-block').classed('is-on', s => s === system);
    band.attr('visibility', system ? 'visible' : 'hidden');
    if (system) band.attr('x', span(system)[0]).attr('width', span(system)[1]);
    describe(system);
  }
  columns
    .on('mouseenter focus touchstart', (e, s) => show(s))
    .on('mouseleave blur touchend', () => show(null));

  // Short note for one voting system, placed just above its block in the strip.
  function describe(system) {
    const pop = $('system-pop');
    if (!system) { pop.hidden = true; return; }
    pop.innerHTML = `<b>${systemLabel(system)} · ${system.title}</b><p>${system.text}</p>`;
    pop.hidden = false;
    const block = strip.filter(s => s === system).select('rect').node();
    const at = block.getBoundingClientRect(), size = pop.getBoundingClientRect();
    const left = Math.max(8, Math.min(at.left + at.width / 2 - size.width / 2, innerWidth - size.width - 8));
    const above = at.top - size.height - 8;
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
    // 2020 stays on the axis, as a gap in the data (see no-contest.js)
    const years = axisYears(rows[0].y, rows.at(-1).y);
    const x = d3.scalePoint(years, [M.left + 24, W - M.right]);
    const withGap = years.map(year => rows.find(r => r.y === year) ?? { y: year, jury: null, tele: null });
    const y = d3.scaleLinear([0, 0.8], [H - M.bottom, M.top]);

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
    grid.append('line').attr('x1', M.left).attr('x2', W - M.right + 20).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d3.format('.1f'));
    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('correlation with 2004–2015');
    svg.append('g').selectAll('text').data(years).join('text').attr('class', 'tick-label')
      .classed('no-contest', d => d === NO_CONTEST)
      .attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(d => d);

    for (const [key, label] of [['jury', 'Jury'], ['tele', 'Televote']]) {
      svg.append('path').datum(withGap).attr('fill', 'none').attr('stroke', `var(--${key})`).attr('stroke-width', 2.4).attr('stroke-linejoin', 'round')
        .attr('d', d3.line().defined(d => d[key] != null).x(d => x(d.y)).y(d => y(d[key])));
      const at = year => rows.find(r => r.y === year)?.[key];
      drawNoContestBridge({ svg, parent: svg, x, y, before: at(NO_CONTEST - 1), after: at(NO_CONTEST + 1), colour: `var(--${key})` });
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
        const d = d3.least(withGap, r => Math.abs(x(r.y) - mx));
        guide.attr('x1', x(d.y)).attr('x2', x(d.y)).attr('visibility', 'visible');
        if (d.jury == null) { tooltip.show(event, NO_CONTEST_TIP); return; }
        tooltip.show(event, `<b>${d.y}</b><br><span class="m">jury ${d.jury.toFixed(2)} · televote ${d.tele.toFixed(2)}</span><br><span class="m">${d.n} country pairs</span>`);
      })
      .on('mouseleave', () => { guide.attr('visibility', 'hidden'); tooltip.hide(); });
  }


  $('tele-mean').textContent = patterns.mean.tele.toFixed(2);
  $('jury-mean').textContent = patterns.mean.jury.toFixed(2);
  renderPatterns();
});
