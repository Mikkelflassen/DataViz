// Bias over time: three charts that separate "the points changed" from "the voting changed".
/* global d3 */

import { startPage, segmented } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

const $ = id => document.getElementById(id);
const WIDTH = 900;
const YEAR_AXIS = [1956, 2024];
const DECADES = d3.range(1960, 2030, 10);
const REFORMS = { 1975: '12-point system', 1998: 'Televoting', 2004: 'Semi-finals', 2009: 'Juries return', 2016: 'Jury/televote split' };

startPage(async () => {
  const [data, systems] = await Promise.all([d3.json('data/bias-over-time.json'), d3.json('data/voting-systems.json')]);
  const tooltip = createTooltip();
  const state = { scale: 'raw' };

  // ---------- pieces the three charts share

  function grid(svg, y, x0, x1) {
    const g = svg.append('g').attr('class', 'grid').selectAll('g').data(y.ticks(5)).join('g');
    g.append('line').attr('x1', x0).attr('x2', x1).attr('y1', y).attr('y2', y).classed('zero', t => !t);
    g.append('text').attr('class', 'tick-label').attr('x', x0 - 8).attr('y', t => y(t) + 4).attr('text-anchor', 'end').text(d3.format('.1f'));
  }

  function yearLabels(svg, x, baseline, years) {
    svg.append('g').selectAll('text').data(years).join('text').attr('class', 'tick-label')
      .attr('x', x).attr('y', baseline).attr('text-anchor', 'middle').text(d => d);
  }

  // dashed vertical lines at the rule changes; labels are staggered over a few rows so neighbours don't collide
  function reformLines(svg, x, years, top, bottom, rows = 2) {
    const g = svg.append('g').selectAll('g').data(years).join('g').attr('class', 'reform');
    g.append('line').attr('x1', x).attr('x2', x).attr('y1', top).attr('y2', bottom);
    g.append('text').attr('x', year => x(year) + 4).attr('y', (year, i) => top + 10 + (i % rows) * 13).text(year => REFORMS[year]);
  }

  // Hover anywhere in the plot: a guide line snaps to the nearest year and the tooltip shows its values.
  function hoverByYear(svg, { x, rows, left, right, top, bottom, html }) {
    const guide = svg.append('line').attr('class', 'guide').attr('y1', top).attr('y2', bottom).attr('visibility', 'hidden');
    svg.append('rect').attr('x', left).attr('y', top).attr('width', right - left).attr('height', bottom - top).attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        const nearest = d3.least(rows, d => Math.abs(x(d.y) - mx));
        guide.attr('x1', x(nearest.y)).attr('x2', x(nearest.y)).attr('visibility', 'visible');
        tooltip.show(event, html(nearest));
      })
      .on('mouseleave', () => { guide.attr('visibility', 'hidden'); tooltip.hide(); });
  }

  // ---------- chart 1: average |favoritism| per year, with the voting systems underneath

  const yearsIn = system => data.years.filter(d => d.y >= system.from && d.y <= system.to);
  const systemLabel = s => (s.from === s.to ? String(s.from) : `${s.from}–${s.to}`);

  function renderRaw() {
    const H = 430, M = { left: 48, right: 20, top: 34 }, stripHeight = 62, gap = 30;
    const plotBottom = H - stripHeight - gap - 22, stripTop = plotBottom + gap, stripBottom = stripTop + stripHeight;
    const key = state.scale;
    const svg = d3.select('#raw-chart').attr('viewBox', `0 0 ${WIDTH} ${H}`);
    svg.selectAll('*').remove();

    const x = d3.scaleLinear(YEAR_AXIS, [M.left, WIDTH - M.right]);
    const y = d3.scaleLinear([0, key === 'raw' ? 4 : 1], [plotBottom, M.top]).nice();

    // band over the plot for the hovered voting system
    const band = svg.append('rect').attr('class', 'system-band').attr('y', M.top - 24).attr('height', stripBottom - M.top + 24).attr('visibility', 'hidden');

    grid(svg, y, M.left, WIDTH - M.right);
    reformLines(svg, x, [1975, 2004, 2016], M.top - 24, plotBottom);
    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', M.top - 14).text(key === 'raw' ? 'points' : 'SD units');

    // the average of each voting system, as a faint step with its value
    const means = svg.append('g').selectAll('g').data(systems.filter(s => s.to - s.from >= 2)).join('g').attr('class', 'era-mean');
    means.append('line').attr('x1', s => x(s.from)).attr('x2', s => x(s.to))
      .attr('y1', s => y(d3.mean(yearsIn(s), d => d[key]))).attr('y2', s => y(d3.mean(yearsIn(s), d => d[key])));
    means.filter(s => s.to - s.from >= 5).append('text').attr('x', s => (x(s.from) + x(s.to)) / 2).attr('y', plotBottom - 10)
      .attr('text-anchor', 'middle').text(s => d3.mean(yearsIn(s), d => d[key]).toFixed(2));

    // no 2020 in the data, so the line runs from 2019 to 2021
    svg.append('path').datum(data.years).attr('class', 'series').attr('d', d3.line().x(d => x(d.y)).y(d => y(d[key])));

    hoverByYear(svg, {
      x, rows: data.years, left: M.left, right: WIDTH - M.right, top: M.top - 24, bottom: plotBottom,
      html: d => `<b>${d.y}</b><br><span class="m">raw ${d.raw.toFixed(2)}</span><br><span class="m">standardised ${d.z.toFixed(2)}</span><br><span class="m">${d.ppv} pts per country</span>`,
    });

    // The strip: one block per voting system, as tall as the points a country handed out.
    // Hovering a block (or focusing it with the keyboard) pops up a short note on its rules.
    const height = d3.scaleLinear([0, 120], [0, stripHeight]).clamp(true);
    const points = s => Math.round(d3.mean(yearsIn(s), d => d.ppv));
    svg.append('text').attr('class', 'note').attr('x', M.left).attr('y', stripTop - 8).text('points awarded per country');
    const blocks = svg.append('g').selectAll('g').data(systems).join('g')
      .attr('class', 'system').attr('tabindex', 0)
      .attr('aria-label', s => `${systemLabel(s)}: ${s.title}, ${points(s)} points per country`);
    blocks.append('rect').attr('x', s => x(s.from)).attr('width', s => x(s.to + 1) - x(s.from)).attr('y', stripTop - 14).attr('height', stripHeight + 14).attr('fill', 'transparent');   // easy to hit, even for the 6-point year
    blocks.append('rect').attr('class', 'block').attr('x', s => x(s.from)).attr('width', s => x(s.to + 1) - x(s.from))
      .attr('y', s => stripBottom - height(points(s))).attr('height', s => height(points(s)));
    blocks.append('line').attr('class', 'top').attr('x1', s => x(s.from)).attr('x2', s => x(s.to + 1))
      .attr('y1', s => stripBottom - height(points(s))).attr('y2', s => stripBottom - height(points(s)));
    blocks.filter(s => s.to - s.from >= 2).append('text').attr('text-anchor', 'middle')
      .attr('x', s => (x(s.from) + x(s.to + 1)) / 2).attr('y', s => Math.min(stripBottom - 6, stripBottom - height(points(s)) + 15))
      .text(s => (points(s) > 80 ? `≈${points(s)}` : points(s)));

    function show(system, block) {
      blocks.classed('is-on', s => s === system);
      band.attr('visibility', system ? 'visible' : 'hidden');
      if (system) band.attr('x', x(system.from)).attr('width', x(system.to + 1) - x(system.from));
      describe(system, block);
    }
    // the note is there while the pointer (or keyboard focus, or a finger) is on the block, and gone after
    blocks
      .on('mouseenter focus touchstart', function (e, s) { show(s, this); })
      .on('mouseleave blur touchend', () => show(null));

    yearLabels(svg, x, H - 4, DECADES);
    $('raw-title').textContent = key === 'raw' ? 'Mean favoritism per year' : 'Mean favoritism per year, standardised';
  }

  // Short note for one voting system, placed just above its block.
  function describe(system, block) {
    const pop = $('system-pop');
    if (!system) { pop.hidden = true; return; }
    pop.innerHTML = `<b>${systemLabel(system)} · ${system.title}</b><p>${system.text}</p>`;
    pop.hidden = false;
    const at = block.getBoundingClientRect(), size = pop.getBoundingClientRect();
    const left = Math.max(8, Math.min(at.left + at.width / 2 - size.width / 2, innerWidth - size.width - 8));
    const above = at.top - size.height - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${above > 8 ? above : at.bottom + 8}px`;
  }

  // ---------- chart 2: do countries vote the way they did in the previous five contests?

  function renderPersistence() {
    const H = 390, M = { left: 48, right: 70, top: 52, bottom: 28 };
    const svg = d3.select('#persist-chart').attr('viewBox', `0 0 ${WIDTH} ${H}`);
    svg.selectAll('*').remove();
    const x = d3.scaleLinear(YEAR_AXIS, [M.left, WIDTH - M.right]);
    const y = d3.scaleLinear([-0.1, 0.8], [H - M.bottom, M.top]);
    const rows = data.persist;
    const line = key => d3.line().x(d => x(d.y)).y(d => y(d[key]));

    grid(svg, y, M.left, WIDTH - M.right);
    reformLines(svg, x, [1975, 1998, 2004, 2009, 2016], M.top - 30, H - M.bottom, 3);
    svg.append('text').attr('class', 'note').attr('x', WIDTH - M.right + 6).attr('y', y(0) + 4).text('random');
    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', M.top - 34).text('correlation with previous five contests');

    svg.append('path').datum(rows).attr('class', 'series dashed').attr('d', line('stable'));
    svg.append('path').datum(rows).attr('class', 'series').attr('stroke-width', 2.4).attr('d', line('all'));

    const peak = d3.greatest(rows, d => d.all), last = rows.at(-1);
    svg.append('circle').attr('cx', x(peak.y)).attr('cy', y(peak.all)).attr('r', 5).attr('fill', 'var(--fg)').attr('stroke', 'var(--surface)').attr('stroke-width', 2);
    svg.append('text').attr('class', 'value-label').attr('x', x(peak.y) - 8).attr('y', y(peak.all) - 10).attr('text-anchor', 'end').text(`${peak.y}: ${peak.all.toFixed(2)}`);
    svg.append('text').attr('class', 'value-label').attr('x', x(last.y) + 8).attr('y', y(last.all) + 4).text(last.all.toFixed(2));

    yearLabels(svg, x, H - 6, DECADES);
    hoverByYear(svg, {
      x, rows, left: M.left, right: WIDTH - M.right, top: M.top - 30, bottom: H - M.bottom,
      html: d => `<b>${d.y}</b><br><span class="m">all countries ${d.all.toFixed(2)}</span><br><span class="m">all eras ${d.stable.toFixed(2)}</span>`,
    });
  }

  // ---------- chart 3: jury and televote since 2016, against the 2004-2015 pattern

  function renderSplit() {
    const H = 310, M = { left: 48, right: 96, top: 30, bottom: 28 };
    const svg = d3.select('#split-chart').attr('viewBox', `0 0 ${WIDTH} ${H}`);
    svg.selectAll('*').remove();
    const rows = data.jt;
    const x = d3.scalePoint(rows.map(d => d.y), [M.left + 24, WIDTH - M.right]);
    const y = d3.scaleLinear([0, 0.8], [H - M.bottom, M.top]);

    grid(svg, y, M.left, WIDTH - M.right + 20);
    svg.append('text').attr('class', 'note').attr('x', 4).attr('y', 12).text('correlation with 2004–2015');
    for (const [key, label] of [['jury', 'Jury'], ['tele', 'Televote']]) {
      svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', `var(--${key})`).attr('stroke-width', 2.4)
        .attr('d', d3.line().x(d => x(d.y)).y(d => y(d[key])));
      svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', d => x(d.y)).attr('cy', d => y(d[key])).attr('r', 4.5)
        .attr('fill', `var(--${key})`).attr('stroke', 'var(--surface)').attr('stroke-width', 2);
      svg.append('text').attr('class', 'value-label').attr('x', x(rows.at(-1).y) + 10).attr('y', y(rows.at(-1)[key]) + 4).text(`${label} ${rows.at(-1)[key].toFixed(2)}`);
    }
    yearLabels(svg, x, H - 6, rows.map(d => d.y));
    hoverByYear(svg, {
      x, rows, left: M.left, right: WIDTH - M.right, top: M.top, bottom: H - M.bottom,
      html: d => `<b>${d.y}</b><br><span class="m">jury ${d.jury.toFixed(2)}</span><br><span class="m">televote ${d.tele.toFixed(2)}</span><br><span class="m">${d.n} country pairs</span>`,
    });
  }

  // numbers quoted in the help texts come from the data file, so they can't drift apart
  $('stable-count').textContent = data.stableCount;
  $('shuffled').textContent = data.shuffled.toFixed(2);
  $('tele-mean').textContent = data.jtMean.tele.toFixed(2);
  $('jury-mean').textContent = data.jtMean.jury.toFixed(2);

  segmented($('scale'), value => { state.scale = value; renderRaw(); });
  renderRaw();
  renderPersistence();
  renderSplit();
});
