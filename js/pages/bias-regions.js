// Extra points to countries in the same region (bias page, first two charts).
//
// "Extra points" = favoritism: the points a country gave a song minus the average the other
// countries gave that same song, standardised to the 12-point scale (scripts/build_data.py).
// Averaged over the votes a country gave to a country in its own region (regions as on the blocs
// page, in the same colours).
//
// Chart 1, over time: one line per region, one meaning for every year. From 2016 it uses the
// total of jury and televote, as the other pages do, so the line continues across the split
// (checked: no jump between 2015 and 2016). Each point pools all votes from the two contests before
// and after, so a year in which two countries of a region met counts for little; a point needs at
// least MIN_POOLED votes (with fewer, a region like Central jumps on a handful of votes). A dashed line is all votes between two different regions. Bands behind
// the lines show how the votes were cast.
//
// Chart 2, since 2016 only: per region, the same measure for the jury votes and for the televotes,
// each pooled over 2016-2023, as two dots on one axis (only those years have both votes apart).
/* global d3 */

const FIRST = 1957, LAST = 2023, WINDOW = 2, MIN_RUN = 3, MIN_POOLED = 25;   // votes a point needs; fewer gives jumps on a handful of votes
const ORDER = ['Nordic', 'Western', 'Southern', 'Balkan', 'Central', 'Ex-Soviet'];
const COLOUR = { Nordic: 'var(--bloc-1)', Balkan: 'var(--bloc-2)', 'Ex-Soviet': 'var(--bloc-3)', Southern: 'var(--bloc-4)', Western: 'var(--bloc-5)', Central: 'var(--bloc-6)' };
const METHODS = [
  { from: 1957, to: 1996, label: 'Juries' },
  { from: 1997, to: 2008, label: 'Mostly televote' },
  { from: 2009, to: 2023, label: 'Jury + televote' },
];
const signed = v => (Math.abs(v) < 0.05 ? '0.0' : d3.format('+.1f')(v));

export async function renderRegions(tooltip) {
  const [data, countries] = await Promise.all([d3.json('data/region-favoritism.json'), d3.json('data/countries.json')]);
  const members = d3.group(countries, c => c.region);
  const memberList = r => (members.get(r) ?? []).map(c => c.name).sort().join(', ');
  overTime(data, memberList, tooltip);
  sinceSplit(data, memberList, tooltip);
}

function overTime(data, memberList, tooltip) {
  const W = 900, H = 400, M = { left: 44, right: 120, top: 34, bottom: 28 };
  const series = [...ORDER, 'other'];
  const label = s => (s === 'other' ? 'Other regions' : s);

  // pooled 5-contest value per region and year
  const raw = s => data.years.map(d => ({ y: d.y, mean: d.all[s]?.[0] ?? 0, n: d.all[s]?.[1] ?? 0 }));
  const lines = Object.fromEntries(series.map(s => {
    const rows = raw(s), active = rows.filter(d => d.n > 0);
    const pts = rows.map((d, i) => {
      const near = rows.slice(Math.max(0, i - WINDOW), i + WINDOW + 1);
      const n = d3.sum(near, e => e.n);
      const inside = d.y >= active[0].y && d.y <= active.at(-1).y;
      return { y: d.y, n, v: inside && n >= MIN_POOLED ? d3.sum(near, e => e.mean * e.n) / n : null };
    });
    // drop pieces of line shorter than MIN_RUN contests: on their own they read as stray marks
    let start = 0;
    for (let i = 0; i <= pts.length; i++) {
      if (i < pts.length && pts[i].v !== null) continue;
      if (i - start < MIN_RUN) for (let j = start; j < i; j++) pts[j].v = null;
      start = i + 1;
    }
    return [s, pts];
  }));

  const svg = d3.select('#regions').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear([FIRST, LAST], [M.left, W - M.right]);
  const all = series.flatMap(s => lines[s].map(d => d.v)).filter(v => v !== null);
  const y = d3.scaleLinear(d3.extent([...all, 0]), [H - M.bottom, M.top]).nice();

  // how the votes were cast
  const band = svg.append('g').selectAll('g').data(METHODS).join('g').attr('class', (d, i) => `method m${i}`);
  band.append('rect').attr('x', d => x(d.from - 0.5)).attr('width', d => x(d.to + 0.5) - x(d.from - 0.5)).attr('y', M.top - 22).attr('height', H - M.bottom - M.top + 22);
  band.append('text').attr('x', d => (x(d.from - 0.5) + x(d.to + 0.5)) / 2).attr('y', M.top - 7).attr('text-anchor', 'middle').text(d => d.label);

  const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(5)).join('g');
  grid.append('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
  grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(t => (t ? d3.format('+d')(t) : '0'));
  svg.append('g').selectAll('text').data(d3.range(1960, 2030, 10)).join('text').attr('class', 'tick-label')
    .attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(d => d);
  svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('↑ extra points');

  const line = d3.line().defined(d => d.v !== null).x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX);
  const paths = svg.append('g').selectAll('path').data(series).join('path')
    .attr('class', s => `rline${s === 'other' ? ' other' : ''}`).attr('stroke', s => COLOUR[s] ?? 'var(--fg-2)').attr('d', s => line(lines[s]));

  // end labels, nudged apart
  const ends = series.map(s => { const d = lines[s].filter(e => e.v !== null).at(-1); return { s, y: y(d.v), x: x(d.y) }; }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
  const labels = svg.append('g').selectAll('text').data(ends).join('text')
    .attr('class', d => `rlabel${d.s === 'other' ? ' other' : ''}`).attr('fill', d => COLOUR[d.s] ?? 'var(--fg-2)')
    .attr('x', d => d.x + 8).attr('y', d => d.y + 4).text(d => label(d.s));

  // focus one region from its line or label; the label also lists its countries
  const focus = s => {
    paths.classed('is-dim', d => s !== null && d !== s).classed('is-focus', d => d === s);
    labels.classed('is-dim', d => s !== null && d.s !== s);
  };
  paths.on('mouseenter', (e, s) => focus(s)).on('mouseleave', () => focus(null));
  labels.on('mouseenter', (e, d) => { focus(d.s); if (d.s !== 'other') tooltip.show(e, `<b>${d.s}</b><br><span class="m">${memberList(d.s)}</span>`); })
    .on('mousemove', (e, d) => { if (d.s !== 'other') tooltip.show(e, `<b>${d.s}</b><br><span class="m">${memberList(d.s)}</span>`); })
    .on('mouseleave', () => { focus(null); tooltip.hide(); });

  // guide with every value for the year under the mouse
  const guide = svg.append('line').attr('class', 'guide').attr('y1', M.top).attr('y2', H - M.bottom).attr('visibility', 'hidden');
  svg.insert('rect', () => paths.node().parentNode).attr('x', M.left).attr('y', M.top).attr('width', W - M.left - M.right).attr('height', H - M.top - M.bottom)
    .attr('fill', 'transparent')
    .on('mousemove', function (event) {
      const year = Math.round(x.invert(d3.pointer(event, this)[0]));
      guide.attr('x1', x(year)).attr('x2', x(year)).attr('visibility', 'visible');
      const rows = series.map(s => ({ s, d: lines[s].find(e => e.y === year) })).filter(r => r.d && r.d.v !== null).sort((a, b) => b.d.v - a.d.v);
      const method = METHODS.find(m => year >= m.from && year <= m.to)?.label ?? '';
      tooltip.show(event, year === 2020 ? '<b>2020</b><br><span class="m">No contest</span>'
        : `<b>${year}</b> · ${method}<br>` + rows.map(r => `<span class="m">${label(r.s)} ${signed(r.d.v)}</span>`).join('<br>'));
    })
    .on('mouseleave', () => { guide.attr('visibility', 'hidden'); tooltip.hide(); });
}

function sinceSplit(data, memberList, tooltip) {
  // pool 2016-2023 per region: sum of mean x n over the years, divided by the total n
  const split = data.years.filter(d => d.jury);
  const pooled = (key, s) => {
    const n = d3.sum(split, d => d[key][s]?.[1] ?? 0);
    return { v: d3.sum(split, d => (d[key][s]?.[0] ?? 0) * (d[key][s]?.[1] ?? 0)) / n, n };
  };
  const rows = [...ORDER, 'other'].map(s => ({ s, jury: pooled('jury', s), tele: pooled('tele', s) }))
    .sort((a, b) => (a.s === 'other') - (b.s === 'other') || b.tele.v - a.tele.v);

  const ROW = 30, W = 900, M = { left: 130, right: 60, top: 28, bottom: 30 };
  const H = M.top + rows.length * ROW + M.bottom;
  const svg = d3.select('#split-regions').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear(d3.extent([0, ...rows.flatMap(r => [r.jury.v, r.tele.v])]), [M.left, W - M.right]).nice();
  const yAt = i => M.top + (i + 0.5) * ROW;

  const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(x.ticks(6)).join('g');
  grid.append('line').attr('x1', x).attr('x2', x).attr('y1', M.top - 6).attr('y2', H - M.bottom).classed('zero', t => !t);
  grid.append('text').attr('class', 'tick-label').attr('x', x).attr('y', H - 10).attr('text-anchor', 'middle').text(t => (t ? d3.format('+d')(t) : '0'));
  svg.append('text').attr('class', 'note').attr('x', W - M.right + 10).attr('y', H - 10).text('extra points');

  const row = svg.append('g').selectAll('g').data(rows).join('g').attr('class', d => `drow${d.s === 'other' ? ' other' : ''}`)
    .attr('transform', (d, i) => `translate(0,${yAt(i)})`);
  row.append('rect').attr('class', 'hit').attr('x', 0).attr('width', W).attr('y', -ROW / 2).attr('height', ROW);
  row.append('text').attr('class', 'dlabel').attr('x', M.left - 14).attr('y', 4).attr('text-anchor', 'end')
    .attr('fill', d => COLOUR[d.s] ?? 'var(--fg-2)').text(d => (d.s === 'other' ? 'Other regions' : d.s));
  row.append('line').attr('class', 'dbar').attr('x1', d => x(d.jury.v)).attr('x2', d => x(d.tele.v));
  row.append('circle').attr('class', 'ddot jury').attr('cx', d => x(d.jury.v)).attr('r', 6);
  row.append('circle').attr('class', 'ddot tele').attr('cx', d => x(d.tele.v)).attr('r', 6);
  row.on('mousemove', (e, d) => tooltip.show(e, `<b>${d.s === 'other' ? 'Votes between regions' : d.s}</b> · 2016–2023<br>`
      + `<span class="m">televote ${signed(d.tele.v)} · jury ${signed(d.jury.v)}</span><br><span class="m">${d.tele.n} votes each</span>`
      + (d.s === 'other' ? '' : `<br><span class="m">${memberList(d.s)}</span>`)))
    .on('mouseleave', () => tooltip.hide());
}
