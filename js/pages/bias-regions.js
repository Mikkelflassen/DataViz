// Extra points to countries in the same region, by who voted (bias page, first chart).
//
// "Extra points" = favoritism: the points a country gave a song minus the average the other
// countries gave that same song, standardised to the 12-point scale, over the votes a country gave
// to a country in its own region (regions as on the blocs page). Four kinds of vote, each only from
// years in which every country voted that way (source: "Voting at the Eurovision Song Contest",
// Wikipedia): juries 1957-1996, televote 2004-2008, and the jury and televote sets of 2016-2023.
//
// Regions that were barely in the contest in a period (before 1997 the Balkan, Central and
// Ex-Soviet countries met in one to four finals) are handled in scripts/build_data.py with partial
// pooling: each bar is the region's average pulled towards the average of all regions for that kind
// of vote, the more so the fewer votes it rests on. The thin line through a bar is its 95% interval
// (contests resampled, so a region seen in few finals gets a long line).
//
// Colours: the Okabe-Ito colour-blind-safe palette, used as given (no tints), the same in light and
// dark mode: blues for juries, orange and vermillion for televote. Every bar also carries its value,
// so nothing depends on colour alone. Hovering or focusing a region's name lists its countries; the
// bars have no hover box.
/* global d3 */

const KINDS = [
  { key: 'jury-old', label: 'Juries 1957–1996' },
  { key: 'jury-new', label: 'Jury 2016–2023' },
  { key: 'tele-old', label: 'Televote 2004–2008' },
  { key: 'tele-new', label: 'Televote 2016–2023' },
];
const NAME = s => (s === 'other' ? 'Between regions' : s);
const signed = v => (Math.abs(v) < 0.05 ? '0.0' : d3.format('+.1f')(v));

export async function renderRegions(tooltip) {
  const [data, countries] = await Promise.all([d3.json('data/region-bars.json'), d3.json('data/countries.json')]);
  const members = d3.group(countries, c => c.region);
  const memberList = r => (members.get(r) ?? []).map(c => c.name).sort().join(', ');

  const groups = Object.keys(data).filter(k => !k.startsWith('_'))
    .map(s => ({ s, bars: KINDS.map(k => ({ s, k, ...data[s][k.key] })) }));
  // regions by their largest estimate, "between regions" last
  groups.sort((a, b) => (a.s === 'other') - (b.s === 'other') || d3.max(b.bars, d => d.est) - d3.max(a.bars, d => d.est));

  const W = 900, H = 400, M = { left: 44, right: 12, top: 24, bottom: 46 };
  const svg = d3.select('#regions').attr('viewBox', `0 0 ${W} ${H}`);
  const x0 = d3.scaleBand(groups.map(g => g.s), [M.left, W - M.right]).paddingInner(0.22).paddingOuter(0.05);
  const x1 = d3.scaleBand(KINDS.map(k => k.key), [0, x0.bandwidth()]).paddingInner(0.14);
  const all = groups.flatMap(g => g.bars.flatMap(b => [b.lo, b.hi]));
  const y = d3.scaleLinear(d3.extent([...all, 0]), [H - M.bottom, M.top]).nice();

  const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(6)).join('g');
  grid.append('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
  grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(t => (t ? d3.format('+d')(t) : '0'));
  svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('↑ extra points');

  const group = svg.append('g').selectAll('g').data(groups).join('g').attr('transform', g => `translate(${x0(g.s)},0)`);

  // region names: the only hover target, also reachable with the keyboard
  const tipFor = g => (g.s === 'other' ? '<b>Between regions</b><br><span class="m">Votes to a country in another region</span>'
    : `<b>${g.s}</b><br><span class="m">${memberList(g.s)}</span>`);
  group.append('text').attr('class', g => `glabel${g.s === 'other' ? ' other' : ''}`).attr('x', x0.bandwidth() / 2).attr('y', H - M.bottom + 22)
    .attr('text-anchor', 'middle').attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', g => `${NAME(g.s)}: ${g.s === 'other' ? 'votes between regions' : memberList(g.s)}`)
    .text(g => NAME(g.s))
    .on('mousemove', (e, g) => tooltip.show(e, tipFor(g)))
    .on('mouseleave', () => tooltip.hide())
    .on('focus', function (e, g) { const r = this.getBoundingClientRect(); tooltip.show({ clientX: r.left + r.width / 2, clientY: r.bottom }, tipFor(g)); })
    .on('blur', () => tooltip.hide());

  // bars, 95% intervals and values
  const bar = group.selectAll('g.vbar').data(g => g.bars).join('g').attr('class', b => `vbar ${b.k.key}`)
    .attr('transform', b => `translate(${x1(b.k.key)},0)`);
  const bw = x1.bandwidth(), mid = bw / 2;
  bar.append('rect').attr('class', 'fill').attr('width', bw)
    .attr('y', b => Math.min(y(b.est), y(0))).attr('height', b => Math.abs(y(b.est) - y(0)));
  const ci = bar.append('g').attr('class', 'ci');
  ci.append('line').attr('x1', mid).attr('x2', mid).attr('y1', b => y(b.lo)).attr('y2', b => y(b.hi));
  ci.append('line').attr('x1', mid - 3).attr('x2', mid + 3).attr('y1', b => y(b.lo)).attr('y2', b => y(b.lo));
  ci.append('line').attr('x1', mid - 3).attr('x2', mid + 3).attr('y1', b => y(b.hi)).attr('y2', b => y(b.hi));
  bar.append('text').attr('class', 'bval').attr('x', mid).attr('text-anchor', 'middle')
    .attr('y', b => (b.est >= 0 ? y(b.hi) - 5 : y(b.lo) + 12)).text(b => signed(b.est));
}
