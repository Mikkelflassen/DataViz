// Extra points to countries in the same region, by who voted (bias page, first chart).
//
// "Extra points" = favoritism: the points a country gave a song minus the average the other
// countries gave that same song, standardised to the 12-point scale (scripts/build_data.py),
// averaged over the votes a country gave to a country in its own region (regions as on the blocs
// page). A grouped bar chart (lecture 3): per region four bars, one per kind of vote, taken only
// from years in which that rule applied in every country (source: "Voting at the Eurovision Song
// Contest", Wikipedia):
//   juries 1957-1996 (all juries), televote 2004-2008 (every country televoted),
//   jury 2016-2023 and televote 2016-2023 (separate sets of points).
// Mixed years (1997-2003: some juries; 2009-2015: jury and televote combined) are left out, since
// their votes cannot be put down to either. Every bar is one 12-point set measured the same way.
// A bar needs MIN_VOTES votes; with fewer it is an outline marked "–".
// Colour says who voted (jury blue, televote orange, as on the jury page; the pair passes the
// colour-blindness checks of the dataviz palette validator in light and dark mode). The period is
// a texture, not a shade: the older periods are striped at 45°, 2016-2023 is solid, so no reader
// has to tell two tints of one hue apart. Hovering or focusing a region's name shows its countries;
// the bars carry their values as labels and have no hover box.
/* global d3 */

const MIN_VOTES = 25;
const KINDS = [
  { key: 'all', from: 1957, to: 1996, label: 'Juries 1957–1996', cls: 'jury-old', rule: 'National juries in every country' },
  { key: 'jury', from: 2016, to: 2023, label: 'Jury 2016–2023', cls: 'jury-new', rule: 'Jury half of the 50/50 vote, its own set of points' },
  { key: 'all', from: 2004, to: 2008, label: 'Televote 2004–2008', cls: 'tele-old', rule: 'Televote in every country' },
  { key: 'tele', from: 2016, to: 2023, label: 'Televote 2016–2023', cls: 'tele-new', rule: 'Televote half of the 50/50 vote, its own set of points' },
];
const NAME = s => (s === 'other' ? 'Between regions' : s);
const signed = v => (Math.abs(v) < 0.05 ? '0.0' : d3.format('+.1f')(v));

export async function renderRegions(tooltip) {
  const [data, countries] = await Promise.all([d3.json('data/region-favoritism.json'), d3.json('data/countries.json')]);
  const members = d3.group(countries, c => c.region);
  const memberList = r => (members.get(r) ?? []).map(c => c.name).sort().join(', ');

  // pooled value per region and kind of vote: all votes in those years together
  const pooled = (s, k) => {
    const cells = data.years.filter(d => d.y >= k.from && d.y <= k.to && d[k.key]?.[s]).map(d => d[k.key][s]);
    const n = d3.sum(cells, c => c[1]);
    return { n, v: n ? d3.sum(cells, c => c[0] * c[1]) / n : 0, ok: n >= MIN_VOTES };
  };
  const groups = [...data.regions, 'other'].map(s => ({ s, bars: KINDS.map(k => ({ s, k, ...pooled(s, k) })) }));
  // regions by their largest bar, "between regions" last
  groups.sort((a, b) => (a.s === 'other') - (b.s === 'other') || d3.max(b.bars, d => (d.ok ? d.v : 0)) - d3.max(a.bars, d => (d.ok ? d.v : 0)));

  const W = 900, H = 380, M = { left: 44, right: 12, top: 24, bottom: 46 };
  const svg = d3.select('#regions').attr('viewBox', `0 0 ${W} ${H}`);
  const x0 = d3.scaleBand(groups.map(g => g.s), [M.left, W - M.right]).paddingInner(0.22).paddingOuter(0.05);
  const x1 = d3.scaleBand(KINDS.map(k => k.cls), [0, x0.bandwidth()]).paddingInner(0.12);
  const vals = groups.flatMap(g => g.bars.filter(b => b.ok).map(b => b.v));
  const y = d3.scaleLinear(d3.extent([...vals, 0]), [H - M.bottom, M.top]).nice();

  // 45° stripes in the bar's own colour with thin surface-coloured gaps, for the older periods
  const defs = svg.append('defs');
  for (const hue of ['jury', 'tele']) {
    const pat = defs.append('pattern').attr('id', `stripes-${hue}`).attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
    pat.append('rect').attr('class', `stripe-base ${hue}`).attr('width', 6).attr('height', 6);
    pat.append('rect').attr('class', 'stripe-gap').attr('width', 2).attr('height', 6);
  }

  const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(6)).join('g');
  grid.append('line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y).classed('zero', t => !t);
  grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(t => (t ? d3.format('+d')(t) : '0'));
  svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('↑ extra points');

  const group = svg.append('g').selectAll('g').data(groups).join('g').attr('transform', g => `translate(${x0(g.s)},0)`);
  const tipFor = g => (g.s === 'other' ? '<b>Between regions</b><br><span class="m">Votes to a country in another region</span>'
    : `<b>${g.s}</b><br><span class="m">${memberList(g.s)}</span>`);
  group.append('text').attr('class', g => `glabel${g.s === 'other' ? ' other' : ''}`).attr('x', x0.bandwidth() / 2).attr('y', H - M.bottom + 20)
    .attr('text-anchor', 'middle').attr('tabindex', 0).attr('role', 'button').attr('aria-label', g => `${NAME(g.s)}: ${g.s === 'other' ? 'votes between regions' : memberList(g.s)}`)
    .text(g => NAME(g.s))
    .on('mousemove', (e, g) => tooltip.show(e, tipFor(g)))
    .on('mouseleave', () => tooltip.hide())
    .on('focus', function (e, g) {
      const r = this.getBoundingClientRect();
      tooltip.show({ clientX: r.left + r.width / 2, clientY: r.bottom }, tipFor(g));
    })
    .on('blur', () => tooltip.hide());

  const bar = group.selectAll('g.vbar').data(g => g.bars).join('g').attr('class', b => `vbar ${b.k.cls}${b.ok ? '' : ' thin'}`);
  bar.append('rect').attr('class', 'fill').attr('x', b => x1(b.k.cls)).attr('width', x1.bandwidth())
    .attr('fill', b => (b.ok && b.k.cls.endsWith('old') ? `url(#stripes-${b.k.cls.startsWith('jury') ? 'jury' : 'tele'})` : null))
    .attr('y', b => (b.ok ? Math.min(y(b.v), y(0)) : y(0) - 4)).attr('height', b => (b.ok ? Math.abs(y(b.v) - y(0)) : 4));
  bar.filter(b => b.ok).append('text').attr('class', 'bval').attr('x', b => x1(b.k.cls) + x1.bandwidth() / 2)
    .attr('y', b => (b.v >= 0 ? y(b.v) - 5 : y(b.v) + 13)).attr('text-anchor', 'middle').text(b => signed(b.v));
  bar.filter(b => !b.ok).append('text').attr('class', 'bval thin').attr('x', b => x1(b.k.cls) + x1.bandwidth() / 2).attr('y', y(0) - 9)
    .attr('text-anchor', 'middle').text('–');
}
