// Jury vs televote: do juries and viewers like the same countries?
/* global d3 */

import { startPage, onThemeChange } from '../shared/page.js';
import { loadCountries, loadJuryTelevote, signed, yearsLabel } from '../shared/data.js';
import { createYearRange } from '../shared/year-range.js';
import { createTooltip } from '../shared/tooltip.js';
import { createLabelPlacer } from '../shared/label-placement.js';

const $ = id => document.getElementById(id);
const CONTESTS = [2016, 2017, 2018, 2019, 2021, 2022, 2023];   // no contest in 2020
const OUTLIER_SD = 1.25;       // a gap this many standard deviations from the mean gets a bold name
const two = d3.format('.2f');

startPage(async () => {
  const [countries, votes, patterns] = await Promise.all([loadCountries(), loadJuryTelevote(), d3.json('data/jury-televote-patterns.json')]);
  const nameOf = id => names.get(id);
  const names = new Map(countries.map(c => [c.id, c.name]));
  // a country can't vote for itself, so that row would only pull its average down
  const rows = votes.filter(v => v.giver !== v.receiver);

  const state = { focus: 'se', from: 2016, to: 2023 };
  const tooltip = createTooltip();

  // ---------- aggregation

  const meanJury = group => d3.mean(group, v => v.jury);   // d3.mean skips the nulls (rest of world has no jury)
  const meanTele = group => d3.mean(group, v => v.tele);

  /** One row per country that reached a final in the selected years. */
  function perCountry() {
    const inRange = rows.filter(v => v.year >= state.from && v.year <= state.to);
    return Array.from(d3.group(inRange, v => v.receiver), ([id, group]) => {
      const jury = meanJury(group), tele = meanTele(group);
      return { id, jury, tele, gap: jury - tele, finals: new Set(group.map(v => v.year)).size };
    });
  }

  /** The selected country, contest by contest. Years it missed keep a row with nulls. */
  function perYear(id) {
    const mine = d3.group(rows.filter(v => v.receiver === id), v => v.year);
    return CONTESTS.map(year => {
      const group = mine.get(year);
      return { year, jury: group ? meanJury(group) : null, tele: group ? meanTele(group) : null };
    });
  }

  const side = d => (d.gap >= 0 ? 'jury' : 'tele');   // below the diagonal, juries give more
  const sideColour = d => `var(--${side(d)})`;
  const countryTip = d => `<b>${nameOf(d.id)}</b><br><span class="m">jury ${two(d.jury)} · televote ${two(d.tele)}</span><br>` +
    `<span class="m">gap ${signed(d.gap)}</span><br>` +
    `<span class="m">${d.finals} final${d.finals > 1 ? 's' : ''}</span>`;

  // ---------- scatterplot
  //
  // Both axes share one scale and the plot is square, so the jury = televote line runs at
  // exactly 45 degrees and the distance from it is the gap. Colour only says which side a dot is on.

  // Drawn at its real pixel size (the CSS decides how big the square is, see .jt-panel), so dots,
  // names and axis numbers keep the same size whether the plot is 400 or 700 px wide.
  const MARGIN = { left: 58, right: 22, top: 22, bottom: 52 }, RADIUS = 8;
  let SIZE = 620;
  const scatter = d3.select('#scatter');
  const tint = scatter.append('defs').append('linearGradient').attr('id', 'sides').attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 1);
  tint.selectAll('stop').data([[0, 'tele', 0.16], [0.5, 'tele', 0], [0.5, 'jury', 0], [1, 'jury', 0.16]]).join('stop')
    .attr('offset', d => d[0]).attr('stop-color', d => `var(--${d[1]})`).attr('stop-opacity', d => d[2]);
  const layer = Object.fromEntries(['back', 'grid', 'diagonal', 'leaders', 'dots', 'labels'].map(name => [name, scatter.append('g').attr('class', name)]));
  layer.labels.attr('pointer-events', 'none');
  layer.leaders.attr('pointer-events', 'none');
  const xTitle = scatter.append('text').attr('class', 'axis-title').attr('text-anchor', 'middle').text('Mean jury points');
  const yTitle = scatter.append('text').attr('class', 'axis-title').attr('text-anchor', 'middle').text('Mean televote points');

  function sizeScatter() {
    SIZE = Math.round(document.querySelector('.scatter-box').getBoundingClientRect().width) || 620;
    scatter.attr('viewBox', `0 0 ${SIZE} ${SIZE}`).attr('height', SIZE);
    xTitle.attr('x', (MARGIN.left + SIZE - MARGIN.right) / 2).attr('y', SIZE - 10);
    yTitle.attr('transform', `translate(16,${(MARGIN.top + SIZE - MARGIN.bottom) / 2}) rotate(-90)`);
  }

  function renderScatter(data) {
    const max = Math.max(6, Math.ceil(d3.max(data, d => Math.max(d.jury, d.tele)) || 6));
    const x = d3.scaleLinear([0, max], [MARGIN.left, SIZE - MARGIN.right]);
    const y = d3.scaleLinear([0, max], [SIZE - MARGIN.bottom, MARGIN.top]);
    const ticks = d3.range(0, max + 1, max > 8 ? 2 : 1);

    layer.back.selectAll('rect').data([max]).join('rect')
      .attr('x', x(0)).attr('y', y(max)).attr('width', x(max) - x(0)).attr('height', y(0) - y(max)).attr('fill', 'url(#sides)');

    layer.grid.attr('class', 'grid').selectAll('g').data(ticks).join(enter => {
      const g = enter.append('g');
      g.append('line').attr('class', 'v');
      g.append('line').attr('class', 'h');
      g.append('text').attr('class', 'tick-label tx').attr('text-anchor', 'middle');
      g.append('text').attr('class', 'tick-label ty').attr('text-anchor', 'end');
      return g;
    }).call(g => {
      g.select('.v').attr('x1', x).attr('x2', x).attr('y1', y(0)).attr('y2', y(max)).classed('zero', v => !v);
      g.select('.h').attr('y1', y).attr('y2', y).attr('x1', x(0)).attr('x2', x(max)).classed('zero', v => !v);
      g.select('.tx').attr('x', x).attr('y', y(0) + 18).text(v => v);
      g.select('.ty').attr('x', x(0) - 10).attr('y', v => y(v) + 4).text(v => v);
    });

    layer.diagonal.selectAll('line').data([max]).join('line')
      .attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(max)).attr('y2', y(max))
      .attr('stroke', 'var(--line-strong)').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
    const noteAt = max * 0.92, shift = 8 / Math.SQRT2;
    layer.diagonal.selectAll('text').data([max]).join('text').attr('class', 'plot-label')
      .attr('transform', `translate(${x(noteAt) - shift},${y(noteAt) - shift}) rotate(-45)`)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--muted)').text('jury = televote');

    // Dots are keyed by country, so moving the year slider slides each dot to its new place
    // instead of redrawing the plot. That makes it possible to follow one country.
    const single = d => d.finals === 1;
    layer.dots.selectAll('circle').data(data, d => d.id).join(
      enter => enter.append('circle').attr('class', 'dot').attr('cx', d => x(d.jury)).attr('cy', d => y(d.tele)).attr('opacity', 0),
    )
      .on('mousemove', (e, d) => tooltip.show(e, countryTip(d)))
      .on('mouseleave', () => tooltip.hide())
      .on('click', (e, d) => setFocus(d.id))
      .attr('fill', d => (single(d) ? 'var(--surface)' : sideColour(d)))
      .attr('stroke', d => (d.id === state.focus ? 'var(--fg)' : single(d) ? sideColour(d) : 'var(--surface)'))
      .attr('stroke-width', d => (d.id === state.focus ? 3 : 2))
      .attr('r', d => (d.id === state.focus ? RADIUS + 2 : RADIUS))
      .transition().duration(350)
      .attr('cx', d => x(d.jury)).attr('cy', d => y(d.tele)).attr('opacity', 1);
    layer.dots.selectAll('circle').filter(d => d.id === state.focus).raise();

    renderLabels(data.map(d => ({ ...d, x: x(d.jury), y: y(d.tele) })), y(0));
  }

  // Which dots get a name.
  //  1. Outliers and the selected country (bold). The name goes beside the dot, or further out
  //     on a leader line when the dot is crowded.
  //  2. Any other dot gets a grey name when that is free: it is clear of the diagonal, no
  //     other dot is close, and the name fits right beside it.
  // In both cases the name must stay well away from every other dot, so there is no doubt
  // which dot it belongs to. If that can't be done the dot stays unnamed (see label-placement.js).
  function renderLabels(dots, floor) {
    const CLEAR_OF_DIAGONAL = 24;   // px, measured at right angles to the line
    const NO_NEIGHBOUR_WITHIN = 30; // px between dot centres
    const BESIDE = RADIUS + 4, FURTHER_OUT = [RADIUS + 20, RADIUS + 36, RADIUS + 54];
    const fromDiagonal = d => Math.abs((d.x - MARGIN.left) - (floor - d.y)) / Math.SQRT2;
    // a name may not sit across the diagonal either
    const onDiagonal = box => {
      const s = (px, py) => Math.sign((px - MARGIN.left) - (floor - py));
      return s(box.x0, box.y0) !== s(box.x1, box.y1) || s(box.x0, box.y1) !== s(box.x1, box.y0);
    };
    const placer = createLabelPlacer({
      dots, radius: RADIUS,
      bounds: { x0: MARGIN.left + 2, x1: SIZE - MARGIN.right - 2, y0: MARGIN.top - 4, y1: floor - 2 },
    });

    const meanGap = d3.mean(dots, d => d.gap), sdGap = d3.deviation(dots, d => d.gap) || 1;
    const isOutlier = d => Math.abs(d.gap - meanGap) / sdGap > OUTLIER_SD;
    const isFocus = d => d.id === state.focus;
    const fontFor = (d, strong) => ({ size: isFocus(d) ? 13 : strong ? 12.5 : 11.5, weight: isFocus(d) ? 700 : strong ? 600 : 400 });

    const placed = [];
    const required = dots.filter(d => isFocus(d) || isOutlier(d))
      .sort((a, b) => isFocus(b) - isFocus(a) || Math.abs(b.gap - meanGap) - Math.abs(a.gap - meanGap));
    for (const d of required) {
      const spot = placer.place(d, nameOf(d.id), fontFor(d, true), [BESIDE, ...FURTHER_OUT], 7);
      if (spot) placed.push({ d, strong: true, spot });
    }

    const optional = dots.filter(d => !required.includes(d) && fromDiagonal(d) >= CLEAR_OF_DIAGONAL &&
      !dots.some(o => o !== d && Math.hypot(o.x - d.x, o.y - d.y) < NO_NEIGHBOUR_WITHIN))
      .sort((a, b) => fromDiagonal(b) - fromDiagonal(a));
    for (const d of optional) {
      const spot = placer.place(d, nameOf(d.id), fontFor(d, false), [BESIDE], 10);
      if (spot && !onDiagonal(spot.box)) placed.push({ d, strong: false, spot });
    }

    layer.leaders.selectAll('line').data(placed.filter(p => p.spot.leaderEnd), p => p.d.id).join('line')
      .attr('x1', p => p.d.x).attr('y1', p => p.d.y).attr('x2', p => p.spot.leaderEnd[0]).attr('y2', p => p.spot.leaderEnd[1])
      .attr('stroke', 'var(--fg-2)').attr('stroke-width', 1);
    layer.labels.selectAll('text').data(placed, p => p.d.id).join('text').attr('class', 'plot-label')
      .attr('x', p => p.spot.x).attr('y', p => p.spot.y).attr('text-anchor', p => p.spot.anchor)
      .attr('font-size', p => fontFor(p.d, p.strong).size).attr('font-weight', p => fontFor(p.d, p.strong).weight)
      .attr('fill', p => (p.strong ? 'var(--fg)' : 'var(--muted)'))
      .text(p => nameOf(p.d.id));
    // names appear once the dots have arrived
    d3.selectAll([layer.labels.node(), layer.leaders.node()]).interrupt().attr('opacity', 0).transition().delay(300).duration(150).attr('opacity', 1);
  }

  // ---------- ranked lists

  function renderLists(data) {
    const sorted = d3.sort(data, d => -d.gap);
    const fill = (id, list, cls) => d3.select(id).selectAll('li').data(list.length ? list : [null]).join('li')
      .classed('is-selected', d => d && d.id === state.focus)
      .html(d => (d
        ? `<button type="button" data-id="${d.id}">${nameOf(d.id)}${d.finals === 1 ? ' <i class="swatch ring single" title="Single final" aria-label="single final"></i>' : ''}</button>` +
          `<span class="pill ${cls}">${signed(Math.abs(d.gap))}</span>`
        : '<span class="empty">None</span><span></span>'));
    fill('#jury-list', sorted.filter(d => d.gap > 0).slice(0, 5), 'jury');
    fill('#tele-list', sorted.filter(d => d.gap < 0).slice(-5).reverse(), 'tele');
  }

  // ---------- year by year

  function renderYearly() {
    const data = perYear(state.focus);
    // Drawn at its real pixel size, so the text stays the same size as elsewhere. When the chart sits
    // beside the scatterplot it grows to end level with it; on narrow screens it keeps a fixed shape.
    const svg = d3.select('#yearly');
    const W = Math.round(svg.node().getBoundingClientRect().width) || 560;
    const stage = document.querySelector('.panel > .stage').getBoundingClientRect();
    const top = svg.node().getBoundingClientRect().top;
    const besideScatter = top < stage.bottom - 200;
    const H = besideScatter ? Math.max(200, Math.round(stage.bottom - top - 17)) : Math.round(Math.min(320, W * 0.55));
    const M = { left: 34, right: 92, top: 14, bottom: 30 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    svg.selectAll('*').remove();

    const x = d3.scalePoint(CONTESTS, [M.left + 20, W - M.right]);
    const y = d3.scaleLinear([0, Math.max(6, Math.ceil(d3.max(data, d => Math.max(d.jury ?? 0, d.tele ?? 0))))], [H - M.bottom, M.top]).nice();

    // band behind the years picked with the slider
    const picked = CONTESTS.filter(year => year >= state.from && year <= state.to);
    if (picked.length < CONTESTS.length) {
      svg.append('rect').attr('x', x(picked[0]) - x.step() / 2).attr('width', x(picked.at(-1)) - x(picked[0]) + x.step())
        .attr('y', M.top - 6).attr('height', H - M.bottom - M.top + 6).attr('rx', 6).attr('fill', 'var(--surface-2)');
    }

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(5)).join('g');
    grid.append('line').attr('x1', M.left).attr('x2', W - M.right + 10).attr('y1', y).attr('y2', y);
    grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(t => t);
    svg.append('g').selectAll('text').data(CONTESTS).join('text').attr('class', 'tick-label')
      .attr('x', x).attr('y', H - 10).attr('text-anchor', 'middle').text(d => d);
    svg.append('g').selectAll('text').data(data.filter(d => d.jury == null)).join('text')
      .attr('x', d => x(d.year)).attr('y', y(0) - 8).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('fill', 'var(--muted)').text('not in final');

    const yearTip = d => `<b>${nameOf(state.focus)} ${d.year}</b><br><span class="m">jury ${two(d.jury)} · televote ${two(d.tele)}</span><br><span class="m">gap ${signed(d.jury - d.tele)}</span>`;
    for (const key of ['jury', 'tele']) {
      const line = d3.line().defined(d => d[key] != null).x(d => x(d.year)).y(d => y(d[key]));
      svg.append('path').datum(data).attr('d', line).attr('fill', 'none').attr('stroke', `var(--${key})`).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round');
      svg.append('g').selectAll('circle').data(data.filter(d => d[key] != null)).join('circle')
        .attr('cx', d => x(d.year)).attr('cy', d => y(d[key])).attr('r', 4.5)
        .attr('fill', `var(--${key})`).attr('stroke', 'var(--surface)').attr('stroke-width', 2)
        .on('mousemove', (e, d) => tooltip.show(e, yearTip(d))).on('mouseleave', () => tooltip.hide());
    }

    // name the lines at their last point; nudge the two apart if they would overlap
    const last = data.findLast(d => d.jury != null);
    if (last) {
      let yJury = y(last.jury), yTele = y(last.tele);
      if (Math.abs(yJury - yTele) < 14) {
        const middle = (yJury + yTele) / 2, up = yJury < yTele ? -7 : 7;
        yJury = middle + up;
        yTele = middle - up;
      }
      svg.append('text').attr('class', 'end-label').attr('x', x(last.year) + 10).attr('y', yJury + 4).text(`Jury ${last.jury.toFixed(1)}`);
      svg.append('text').attr('class', 'end-label').attr('x', x(last.year) + 10).attr('y', yTele + 4).text(`Televote ${last.tele.toFixed(1)}`);
    }
    $('years-title').textContent = `${nameOf(state.focus)} by year`;
  }

  // ---------- agreement with the 2004-2015 pattern
  //
  // For every year since the split: the correlation between each pair's jury (or televote)
  // favoritism that year and the pair's mean favoritism in 2004-2015, when both were combined.
  // Calculated in scripts/build_data.py. Shares the jury and televote colours with the charts above.

  function renderPatterns() {
    const rows = patterns.years;
    const W = 1180, H = 250, M = { left: 48, right: 120, top: 30, bottom: 30 };
    const svg = d3.select('#patterns').attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();
    const x = d3.scalePoint(rows.map(d => d.y), [M.left + 24, W - M.right]);
    const y = d3.scaleLinear([0, 0.8], [H - M.bottom, M.top]);

    // the years picked with the slider, as on the year chart
    const picked = rows.map(d => d.y).filter(year => year >= state.from && year <= state.to);
    if (picked.length < rows.length) {
      svg.append('rect').attr('x', x(picked[0]) - x.step() / 2).attr('width', x(picked.at(-1)) - x(picked[0]) + x.step())
        .attr('y', M.top - 6).attr('height', H - M.bottom - M.top + 6).attr('rx', 6).attr('fill', 'var(--surface-2)');
    }

    const grid = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(4)).join('g');
    grid.append('line').attr('x1', M.left).attr('x2', W - M.right + 20).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    grid.append('text').attr('class', 'tick-label').attr('x', M.left - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d3.format('.1f'));
    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('correlation with 2004–2015');
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

  // ---------- wiring

  function render() {
    tooltip.hide();
    sizeScatter();
    const data = perCountry();
    $('scatter-years').textContent = yearsLabel(state.from, state.to);
    $('years-value').textContent = yearsLabel(state.from, state.to);
    renderScatter(data);
    renderLists(data);
    renderYearly();
    renderPatterns();
  }

  function setFocus(id) {
    state.focus = id;
    select.value = id;
    render();
  }

  const select = $('country');
  const finalists = new Set(rows.map(v => v.receiver));
  countries.filter(c => finalists.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => select.add(new Option(c.name, c.id)));
  select.value = state.focus;
  select.addEventListener('change', () => setFocus(select.value));

  document.querySelector('.side').addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if (btn) setFocus(btn.dataset.id);
  });

  let frame = 0;
  createYearRange($('years'), {
    years: CONTESTS, from: state.from, to: state.to, minSteps: 1,   // always at least two contests
    onChange(from, to) {
      state.from = from;
      state.to = to;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    },
  });

  onThemeChange(render);
  // both charts beside each other are sized from the layout, so redraw when the layout changes
  let resizeFrame = 0;
  // Only a change of width matters: phones change the height while scrolling, and redrawing then
  // would make the names flicker.
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(render);
  });
  document.fonts?.ready.then(render);
  render();
});
