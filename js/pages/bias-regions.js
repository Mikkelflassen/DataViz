// Favoritism towards countries in the voter's own region, per year (bias page, first chart).
//
// One line per region: the average standardised favoritism of the votes its countries gave to a
// country in the same region (regions as on the blocs page, in the same colours). A dashed line is
// every vote between two different regions. Calculated in scripts/build_data.py.
// Switches: a centred 5-contest average or each contest; and for 2016-2023 the total of jury and
// televote, the jury alone or the televote alone. Gaps in a line are years with too few votes
// inside the region (see values()). Hovering a line or its label
// fades the others (lecture 4, brushing); a guide shows every value for the year under the mouse.
/* global d3 */

import { segmented } from '../shared/page.js';

const W = 900, H = 400, M = { left: 48, right: 120, top: 20, bottom: 28 };
const FIRST = 1957, LAST = 2023, WINDOW = 2, MIN_VOTES = 4, MIN_POOLED = 12;
// same slots as REGION_SLOT on the blocs page, so a region keeps its colour across pages
const COLOUR = { Nordic: 'var(--bloc-1)', Balkan: 'var(--bloc-2)', 'Ex-Soviet': 'var(--bloc-3)', Southern: 'var(--bloc-4)', Western: 'var(--bloc-5)', Central: 'var(--bloc-6)' };
const SPLIT = { all: 'Jury + televote', jury: 'Jury', tele: 'Televote' };

export async function renderRegions(tooltip) {
  const data = await d3.json('data/region-favoritism.json');
  const series = [...data.regions, 'other'];
  const label = s => (s === 'other' ? 'Other regions' : s);
  const state = { smooth: true, split: 'all', focus: null };

  const svg = d3.select('#regions').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear([FIRST, LAST], [M.left, W - M.right]);
  const y = d3.scaleLinear().range([H - M.bottom, M.top]);
  const gridG = svg.append('g').attr('class', 'grid');
  svg.append('g').selectAll('text').data(d3.range(1960, 2030, 10)).join('text').attr('class', 'tick-label')
    .attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(d => d);
  svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('↑ points above the average');
  const linesG = svg.append('g');
  const lines = linesG.selectAll('path').data(series).join('path')
    .attr('class', s => `region-line${s === 'other' ? ' other' : ''}`).attr('stroke', s => COLOUR[s] ?? 'var(--fg-2)');
  const ends = svg.append('g').selectAll('text').data(series).join('text')
    .attr('class', s => `region-label${s === 'other' ? ' other' : ''}`).attr('fill', s => COLOUR[s] ?? 'var(--fg-2)').text(label);

  // values per series for the current switches: [{y, v, n}] with v null where there is too little data.
  // Each contest: the year's own average (at least MIN_VOTES votes). 5-contest average: all votes
  // in the two contests before and after pooled, so years with few votes count for little, and a
  // value is drawn when the window holds at least MIN_POOLED votes, within the years the region
  // took part in.
  function values() {
    const raw = Object.fromEntries(series.map(s => [s, data.years.map(d => {
      const cell = (d[state.split] ?? d.all)[s];
      return { y: d.y, mean: cell ? cell[0] : 0, n: cell ? cell[1] : 0 };
    })]));
    return Object.fromEntries(series.map(s => {
      const rows = raw[s];
      const active = rows.filter(d => d.n > 0);
      const [first, last] = [active[0]?.y, active.at(-1)?.y];
      return [s, rows.map((d, i) => {
        if (!state.smooth) return { y: d.y, n: d.n, v: d.n >= MIN_VOTES ? d.mean : null };
        // with jury or televote picked, the window stays on one side of 2016 so it never mixes the
        // combined votes before the split with one half of the votes after it
        const near = rows.slice(Math.max(0, i - WINDOW), i + WINDOW + 1)
          .filter(e => state.split === 'all' || (e.y >= 2016) === (d.y >= 2016));
        const n = d3.sum(near, e => e.n);
        const inside = d.y >= first && d.y <= last;
        return { y: d.y, n, v: inside && n >= MIN_POOLED ? d3.sum(near, e => e.mean * e.n) / n : null };
      })];
    }));
  }

  function render() {
    const vals = values();
    const all = series.flatMap(s => vals[s].map(d => d.v)).filter(v => v !== null);
    y.domain(d3.extent([...all, 0])).nice();
    gridG.selectAll('g').data(y.ticks(5), d => d).join(
      enter => { const g = enter.append('g'); g.append('line'); g.append('text').attr('class', 'tick-label'); return g; },
    ).call(g => {
      g.select('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
      g.select('text').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(t => (t ? d3.format('+d')(t) : '0'));
    });
    const line = d3.line().defined(d => d.v !== null).x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    lines.transition().duration(350).attr('d', s => line(vals[s]));

    // end labels at each line's last value, nudged apart so they never overlap
    const last = series.map(s => { const d = vals[s].filter(e => e.v !== null).at(-1); return { s, x: x(d.y), y: y(d.v) }; })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < last.length; i++) last[i].y = Math.max(last[i].y, last[i - 1].y + 14);
    const at = new Map(last.map(d => [d.s, d]));
    ends.transition().duration(350).attr('x', s => at.get(s).x + 8).attr('y', s => at.get(s).y + 4);
    return vals;
  }

  // focus one series: from its line or its label
  function focus(s) {
    state.focus = s;
    lines.classed('is-dim', d => s !== null && d !== s).classed('is-focus', d => d === s);
    ends.classed('is-dim', d => s !== null && d !== s);
  }
  lines.on('mouseenter', (e, s) => focus(s)).on('mouseleave', () => focus(null));
  ends.on('mouseenter', (e, s) => focus(s)).on('mouseleave', () => focus(null));

  // hover guide with every value for that year
  let vals = render();
  const guide = svg.insert('line', () => linesG.node()).attr('class', 'guide').attr('y1', M.top).attr('y2', H - M.bottom).attr('visibility', 'hidden');
  svg.insert('rect', () => linesG.node()).attr('x', M.left).attr('y', M.top).attr('width', W - M.left - M.right).attr('height', H - M.top - M.bottom)
    .attr('fill', 'transparent')
    .on('mousemove', function (event) {
      const year = Math.round(x.invert(d3.pointer(event, this)[0]));
      const rows = series.map(s => ({ s, d: vals[s].find(e => e.y === year) })).filter(r => r.d && r.d.v !== null)
        .sort((a, b) => b.d.v - a.d.v);
      guide.attr('x1', x(year)).attr('x2', x(year)).attr('visibility', 'visible');
      const split = year >= 2016 && state.split !== 'all' ? ` · ${SPLIT[state.split]}` : '';
      tooltip.show(event, rows.length
        ? `<b>${year}${split}</b><br>` + rows.map(r => `<span class="m">${label(r.s)} ${d3.format('+.1f')(r.d.v)}</span>`).join('<br>')
        : `<b>${year}</b><br><span class="m">${year === 2020 ? 'No contest' : 'Too few votes'}</span>`);
    })
    .on('mouseleave', () => { guide.attr('visibility', 'hidden'); tooltip.hide(); });

  segmented(document.getElementById('smooth'), v => { state.smooth = v === 'avg'; vals = render(); });
  segmented(document.getElementById('split'), v => { state.split = v; vals = render(); });
}
