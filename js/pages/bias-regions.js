// Favoritism towards countries in the voter's own region (bias page, first chart).
//
// Small multiples (lecture 9): one panel per region, all on the same scales. A line is the average
// standardised favoritism of the votes the region's countries gave to a country in the same region
// (regions as on the blocs page). Up to 2015 that is one line for all votes. From 2016 the jury and
// the televote give separate sets of points, so the panel has a jury line and a televote line
// there, in the jury page's colours. A dashed line in every panel is all votes between two
// different regions, as a reference. Shading marks the mostly-televote years (1997-2008) and the
// 50/50 years (2009-2015); before that juries voted, after it the two lines show jury and televote.
// Values are pooled over five contests (the two before and after; never across 2016), so a year in
// which only two countries of a region met counts for little. Calculated in scripts/build_data.py.
/* global d3 */

const FIRST = 1957, LAST = 2023, SPLIT = 2016, WINDOW = 2, MIN_POOLED = 12;
const ORDER = ['Nordic', 'Western', 'Southern', 'Balkan', 'Central', 'Ex-Soviet'];
const COLOUR = { Nordic: 'var(--bloc-1)', Balkan: 'var(--bloc-2)', 'Ex-Soviet': 'var(--bloc-3)', Southern: 'var(--bloc-4)', Western: 'var(--bloc-5)', Central: 'var(--bloc-6)' };
// how the votes were cast (data/voting-systems.json has the points systems)
export const METHODS = [
  { from: 1957, to: 1996, label: 'Juries' },
  { from: 1997, to: 2008, label: 'Mostly televote' },
  { from: 2009, to: 2015, label: 'Jury + televote, 50/50' },
  { from: 2016, to: 2023, label: 'Jury and televote apart' },
];
const COLS = 3, PW = 270, PH = 150, GX = 36, GY = 50, M = { left: 40, right: 12, top: 30, bottom: 26 };

export async function renderRegions(tooltip) {
  const data = await d3.json('data/region-favoritism.json');

  // pooled 5-contest average for one region (or 'other') and one set of votes
  function series(region, set) {
    const rows = data.years.map(d => {
      const cell = (d[set] ?? (set === 'all' ? null : undefined))?.[region];
      return { y: d.y, mean: cell ? cell[0] : 0, n: cell ? cell[1] : 0, has: d[set] !== undefined };
    }).filter(d => d.has && (set === 'all' ? d.y < SPLIT : d.y >= SPLIT));
    const active = rows.filter(d => d.n > 0);
    if (!active.length) return [];
    return rows.map((d, i) => {
      const near = rows.slice(Math.max(0, i - WINDOW), i + WINDOW + 1);
      const n = d3.sum(near, e => e.n);
      const inside = d.y >= active[0].y && d.y <= active.at(-1).y;
      return { y: d.y, n, v: inside && n >= MIN_POOLED ? d3.sum(near, e => e.mean * e.n) / n : null };
    });
  }
  const lines = Object.fromEntries([...ORDER, 'other'].map(r => [r, { all: series(r, 'all'), jury: series(r, 'jury'), tele: series(r, 'tele') }]));

  const rows = Math.ceil(ORDER.length / COLS);
  const W = M.left + COLS * PW + (COLS - 1) * GX + M.right;
  const H = M.top + rows * PH + (rows - 1) * GY + M.bottom;
  const svg = d3.select('#regions').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear([FIRST, LAST], [0, PW]);
  const values = Object.values(lines).flatMap(l => [...l.all, ...l.jury, ...l.tele]).map(d => d.v).filter(v => v !== null);
  const y = d3.scaleLinear(d3.extent([...values, 0]), [PH, 0]).nice();
  const line = d3.line().defined(d => d.v !== null).x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX);

  const panel = svg.selectAll('g.panel').data(ORDER).join('g').attr('class', 'panel')
    .attr('transform', (d, i) => `translate(${M.left + (i % COLS) * (PW + GX)},${M.top + Math.floor(i / COLS) * (PH + GY)})`);

  // shading per voting method, grid, title
  panel.append('g').selectAll('rect').data(METHODS).join('rect').attr('class', (d, i) => `band b${i}`)
    .attr('x', d => x(d.from - 0.5)).attr('width', d => x(d.to + 0.5) - x(d.from - 0.5)).attr('y', 0).attr('height', PH);
  const grid = panel.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
  grid.append('line').attr('x2', PW).attr('y1', y).attr('y2', y).classed('zero', t => !t);
  grid.append('text').attr('class', 'tick-label').attr('x', -6).attr('y', t => y(t) + 3.5).attr('text-anchor', 'end')
    .text(t => (t ? d3.format('+d')(t) : '0'));
  panel.append('g').selectAll('text').data([1960, 1980, 2000, 2020]).join('text').attr('class', 'tick-label')
    .attr('x', x).attr('y', PH + 14).attr('text-anchor', 'middle').text(d => d);
  const title = panel.append('g').attr('transform', 'translate(0,-10)');
  title.append('rect').attr('width', 10).attr('height', 10).attr('y', -9).attr('rx', 2).attr('fill', r => COLOUR[r]);
  title.append('text').attr('class', 'panel-title').attr('x', 15).text(r => r);

  // lines: other regions (reference), all votes up to 2015, jury and televote from 2016
  panel.append('path').attr('class', 'rl other').attr('d', () => line(lines.other.all) + line(lines.other.jury.map((d, i) => ({ ...d, v: d.v === null ? null : (d.v + lines.other.tele[i].v) / 2 }))));
  panel.append('path').attr('class', 'rl all').attr('d', r => line(lines[r].all));
  panel.append('path').attr('class', 'rl jury').attr('d', r => line(lines[r].jury));
  panel.append('path').attr('class', 'rl tele').attr('d', r => line(lines[r].tele));

  // hover: a guide and the values for that year in the panel under the mouse
  const guide = panel.append('line').attr('class', 'guide').attr('y1', 0).attr('y2', PH).attr('visibility', 'hidden');
  panel.append('rect').attr('width', PW).attr('height', PH).attr('fill', 'transparent')
    .on('mousemove', function (event, r) {
      const year = Math.max(FIRST, Math.min(LAST, Math.round(x.invert(d3.pointer(event, this)[0]))));
      d3.select(this.parentNode).select('.guide').attr('x1', x(year)).attr('x2', x(year)).attr('visibility', 'visible');
      const at = (list) => list.find(d => d.y === year);
      const fmt = d => (d && d.v !== null ? d3.format('+.1f')(d.v) : '–');
      const method = METHODS.find(m => year >= m.from && year <= m.to).label;
      const body = year === 2020 ? '<span class="m">No contest</span>'
        : year >= SPLIT
          ? `<span class="m">jury ${fmt(at(lines[r].jury))} · televote ${fmt(at(lines[r].tele))}</span>`
          : `<span class="m">${fmt(at(lines[r].all))} points</span>`;
      tooltip.show(event, `<b>${r} · ${year}</b><br>${body}<br><span class="m">other regions ${fmt(at(year >= SPLIT ? lines.other.tele : lines.other.all))}</span><br><span class="m">${method}</span>`);
    })
    .on('mouseleave', function () { d3.select(this.parentNode).select('.guide').attr('visibility', 'hidden'); tooltip.hide(); });
  void guide;
}
