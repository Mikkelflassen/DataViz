// Favoritism over time, as arc diagrams (Nagel + Duval 2013, lecture 9).
//
// Countries sit on one line, grouped by region and ordered roughly west to east. An arc joins two
// countries that often gave each other 12 points; its width is the share of possible 12s they
// gave each other (12s in both directions / 2 x shared finals; from 2016 jury and televote each
// count). Only 1975-2023, the years in which the top score is always 12.
//
// Chart 1: one period at a time, chosen with buttons or played in sequence (time mapped to time,
// lecture 9). Arcs are keyed by pair, so an arc that stays from one period to the next changes
// width instead of being redrawn.
// Chart 2: 2016-2023, the jury's 12s above the line and the televote's below (mirrored).
// Hovering a country highlights its arcs (brushing, lecture 4).
/* global d3 */

import { startPage, segmented } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';

// Regions west to east, countries in an order that keeps neighbours close.
const ORDER = [
  ['Nordic', ['is', 'no', 'se', 'fi', 'dk']],
  ['Western', ['de', 'nl', 'be', 'lu', 'fr', 'mc', 'ad', 'gb', 'ie', 'ch', 'at', 'au']],
  ['Southern', ['pt', 'es', 'ma', 'il', 'tr', 'it', 'sm', 'mt', 'cy', 'gr']],
  ['Balkan', ['al', 'mk', 'me', 'rs', 'cs', 'yu', 'ba', 'hr', 'si']],
  ['Central', ['hu', 'cz', 'sk', 'pl', 'bg', 'ro']],
  ['Ex-Soviet', ['md', 'ua', 'by', 'ru', 'lt', 'lv', 'ee', 'ge', 'am', 'az']],
];
const W = 900, M = { left: 16, right: 16 };
const WIDTH = d3.scaleLinear([0.25, 1], [2, 14]);

startPage(async () => {
  const [data, countries] = await Promise.all([d3.json('data/twelve-arcs.json'), d3.json('data/countries.json')]);
  const name = new Map(countries.map(c => [c.id, c.name]));
  const nameOf = id => name.get(id) ?? id.toUpperCase();
  const tooltip = createTooltip();

  // x position per country, with a small gap between regions
  const ids = ORDER.flatMap(([, list]) => list);
  const GAP = 1.2;
  const slots = [];
  let at = 0;
  ORDER.forEach(([, list], i) => { if (i) at += GAP; list.forEach(id => slots.push([id, at++])); });
  const x = d3.scaleLinear([0, at - 1], [M.left + 8, W - M.right - 8]);
  const X = Object.fromEntries(slots.map(([id, s]) => [id, x(s)]));

  const arcPath = (d, baseY, up, maxH) => {
    const x1 = Math.min(X[d.a], X[d.b]), x2 = Math.max(X[d.a], X[d.b]);
    const rx = (x2 - x1) / 2, ry = Math.min(rx, maxH);
    return `M${x1},${baseY}A${rx},${ry} 0 0,${up ? 1 : 0} ${x2},${baseY}`;
  };
  const arcTip = (d, label) => `<b>${nameOf(d.a)} ↔ ${nameOf(d.b)}</b> · ${label}<br>`
    + `<span class="m">${nameOf(d.a)} → ${nameOf(d.b)}: 12 points ${d.ab}×</span><br>`
    + `<span class="m">${nameOf(d.b)} → ${nameOf(d.a)}: 12 points ${d.ba}×</span><br>`
    + `<span class="m">${d.n} shared finals</span>`;

  // the line of countries with region brackets; returns the code labels for hover highlighting
  function axis(svg, axisY, labelY, regionY = null) {
    svg.append('line').attr('class', 'axis-line').attr('x1', M.left).attr('x2', W - M.right).attr('y1', axisY).attr('y2', axisY);
    svg.append('g').selectAll('circle').data(ids).join('circle').attr('class', 'node').attr('cx', id => X[id]).attr('cy', axisY).attr('r', 2.5);
    const codes = svg.append('g').selectAll('text').data(ids).join('text').attr('class', 'code')
      .attr('x', id => X[id]).attr('y', labelY).attr('text-anchor', 'middle').text(id => id.toUpperCase());
    if (regionY === null) return codes;
    const region = svg.append('g').selectAll('g').data(ORDER).join('g').attr('class', 'region');
    region.append('line').attr('x1', ([, l]) => X[l[0]] - 4).attr('x2', ([, l]) => X[l.at(-1)] + 4).attr('y1', regionY).attr('y2', regionY);
    region.append('text').attr('x', ([, l]) => (X[l[0]] + X[l.at(-1)]) / 2).attr('y', regionY + 13).attr('text-anchor', 'middle').text(([r]) => r);
    return codes;
  }

  // hovering a country code fades every arc that does not touch it
  function brush(codes, svg) {
    codes.on('mouseenter', (e, id) => {
      svg.selectAll('.arc').classed('is-dim', d => d.a !== id && d.b !== id);
      codes.classed('is-on', c => c === id);
      tooltip.show(e, `<b>${nameOf(id)}</b>`);
    }).on('mousemove', (e, id) => tooltip.show(e, `<b>${nameOf(id)}</b>`))
      .on('mouseleave', () => { svg.selectAll('.arc').classed('is-dim', false); codes.classed('is-on', false); tooltip.hide(); });
  }

  // ---------- chart 1: one period at a time

  {
    const H = 330, axisY = 270, maxH = 250;
    const svg = d3.select('#arcs').attr('viewBox', `0 0 ${W} ${H}`);
    const layer = svg.append('g');
    const codes = axis(svg, axisY, axisY + 16, axisY + 30);
    brush(codes, svg);

    const label = p => `${p.from}–${p.to}`;
    const buttons = d3.select('#periods').selectAll('button').data(data.periods).join('button')
      .attr('type', 'button').attr('data-value', (p, i) => i).attr('aria-pressed', (p, i) => String(i === 0)).text(label);

    function show(i) {
      const p = data.periods[i];
      buttons.attr('aria-pressed', (d, j) => String(j === i));
      layer.selectAll('path').data(p.arcs, d => `${d.a}-${d.b}`).join(
        enter => enter.append('path').attr('class', 'arc all').attr('stroke-width', 0).attr('d', d => arcPath(d, axisY, true, maxH)),
        update => update,
        exit => exit.transition().duration(400).attr('stroke-width', 0).remove(),
      ).on('mousemove', (e, d) => tooltip.show(e, arcTip(d, label(p)))).on('mouseleave', () => tooltip.hide())
        .sort((a, b) => b.w - a.w)
        .transition().duration(600).attr('stroke-width', d => WIDTH(d.w));
      current = i;
    }

    let current = 0, timer = null;
    segmented(document.getElementById('periods'), v => { stop(); show(+v); });
    const play = document.getElementById('play');
    function stop() { clearInterval(timer); timer = null; play.textContent = '▶ Play'; }
    play.addEventListener('click', () => {
      if (timer) return stop();
      play.textContent = '❚❚ Pause';
      show(0);
      timer = setInterval(() => (current === data.periods.length - 1 ? stop() : show(current + 1)), 1600);
    });
    show(0);
  }

  // ---------- chart 2: 2016-2023, jury above and televote below

  {
    const H = 400, axisY = 196, maxH = 170;
    const svg = d3.select('#split').attr('viewBox', `0 0 ${W} ${H}`);
    for (const [key, up, label] of [['jury', true, 'jury'], ['tele', false, 'televote']]) {
      svg.append('g').selectAll('path').data([...data[key]].sort((a, b) => b.w - a.w)).join('path')
        .attr('class', `arc ${key}`).attr('stroke-width', d => WIDTH(d.w)).attr('d', d => arcPath(d, axisY + (up ? -9 : 9), up, maxH))
        .on('mousemove', (e, d) => tooltip.show(e, arcTip(d, `2016–2023, ${label}`))).on('mouseleave', () => tooltip.hide());
    }
    svg.append('text').attr('class', 'side-label jury').attr('x', M.left).attr('y', 18).text('Jury');
    svg.append('text').attr('class', 'side-label tele').attr('x', M.left).attr('y', H - 8).text('Televote');
    // the codes sit between the two sets of arcs: jury arcs start just above them, televote just below
    const codes = axis(svg, axisY, axisY + 4);
    svg.selectAll('.axis-line, .node').remove();
    brush(codes, svg);
  }

  // width legend, shared by both charts
  const leg = d3.select('#arc-legend').attr('viewBox', '0 0 460 34');
  const g = leg.selectAll('g').data([0.25, 0.5, 0.75, 1]).join('g').attr('transform', (d, i) => `translate(${200 + i * 66},0)`);
  g.append('line').attr('class', 'arc legend').attr('x1', 0).attr('x2', 40).attr('y1', 12).attr('y2', 12).attr('stroke-width', d => WIDTH(d));
  g.append('text').attr('class', 'tick-label').attr('x', 20).attr('y', 32).attr('text-anchor', 'middle').text(d3.format('.0%'));
  leg.append('text').attr('class', 'legend-label').attr('x', 186).attr('y', 16).attr('text-anchor', 'end').text('share of possible 12s');
});
