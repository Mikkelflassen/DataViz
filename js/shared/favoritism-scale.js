// The red/blue favoritism colours, used by the country map and the voting-blocs matrix.
//
// Symmetric log scale: half of all country pairs are within one point of zero, while a few
// reach +13. A straight scale turns the small ones grey and a plain log scale can't take
// zero or negative numbers. Symlog is linear near zero and logarithmic further out.
/* global d3 */

import { cssVar } from './page.js';

export const LIMIT = 14;   // points; anything beyond is clamped to the darkest colour

export function createFavoritismScale() {
  const interpolate = d3.interpolateRgbBasis(['--neg2', '--neg1', '--mid', '--pos1', '--pos2'].map(cssVar));
  const colour = d3.scaleDivergingSymlog([-LIMIT, 0, LIMIT], interpolate).constant(1).clamp(true);
  // dark text on light cells and the other way round
  colour.ink = value => (d3.lab(colour(value)).l < 58 ? '#ffffff' : '#15151b');
  colour.interpolate = interpolate;
  return colour;
}

// Legend: the gradient is sampled through the same scale, and ticks sit where the scale puts them.
export function drawFavoritismLegend(svg, colour, caption = 'points vs expected') {
  const width = 280, x0 = 10, x1 = width - 10;
  const symlog = v => Math.sign(v) * Math.log1p(Math.abs(v));
  const x = v => x0 + (symlog(v) + symlog(LIMIT)) / (2 * symlog(LIMIT)) * (x1 - x0);
  const id = `${svg.attr('id')}-gradient`;

  svg.attr('viewBox', `0 0 ${width} 44`).selectAll('*').remove();
  svg.append('defs').append('linearGradient').attr('id', id)
    .selectAll('stop').data(d3.range(0, 1.0001, 0.05)).join('stop')
    .attr('offset', t => t).attr('stop-color', t => colour.interpolate(t));
  svg.append('rect').attr('x', x0).attr('y', 2).attr('width', x1 - x0).attr('height', 10).attr('rx', 3).attr('fill', `url(#${id})`);

  const ticks = svg.append('g').selectAll('g').data([-10, -3, -1, 0, 1, 3, 10]).join('g')
    .attr('transform', v => `translate(${x(v)},0)`);
  ticks.append('line').attr('y1', 12).attr('y2', 16).attr('stroke', 'var(--muted)');
  ticks.append('text').attr('class', 'tick-label').attr('y', 27).attr('text-anchor', 'middle')
    .text(v => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'));
  svg.append('text').attr('class', 'tick-label').attr('x', width / 2).attr('y', 41).attr('text-anchor', 'middle').text(caption);
}
