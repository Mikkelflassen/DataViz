// 2020: the contest was cancelled, so there is no value for that year.
//
// Line charts over years still keep 2020 on the axis, so the spacing between years is honest.
// The line from 2019 to 2021 is drawn straight and fades out toward 2020 and back in toward
// 2021, with a hollow point on it at 2020. The fade and the empty point say "no data here"
// without the line simply jumping a year.
/* global d3 */

export const NO_CONTEST = 2020;
export const NO_CONTEST_TIP = '<b>2020</b><br><span class="m">no contest (cancelled)</span>';

let gradientCount = 0;

/**
 * Draw the 2019–2021 bridge for one series.
 * @param svg     d3 selection of the chart's <svg> (the gradient goes in its <defs>)
 * @param parent  d3 selection to draw the line and point into
 * @param x       year -> px; must have a position for 2019, 2020 and 2021
 * @param y       value -> px
 * @param before  value in 2019, or null
 * @param after   value in 2021, or null
 * @param colour  CSS colour of the series, e.g. 'var(--jury)'
 * @returns the hollow point, or null when either side is missing
 */
export function drawNoContestBridge({ svg, parent, x, y, before, after, colour, width = 2.4, radius = 4.5 }) {
  if (before == null || after == null) return null;
  const x0 = x(NO_CONTEST - 1), x1 = x(NO_CONTEST + 1);
  const y0 = y(before), y1 = y(after);

  // Gradient along x in the chart's own coordinates: a straight horizontal line has a
  // bounding box of zero height, where a box-relative gradient would not show.
  const defs = svg.select('defs').empty() ? svg.insert('defs', ':first-child') : svg.select('defs');
  const id = `no-contest-${++gradientCount}`;
  const gradient = defs.append('linearGradient').attr('id', id)
    .attr('gradientUnits', 'userSpaceOnUse').attr('x1', x0).attr('x2', x1).attr('y1', 0).attr('y2', 0);
  gradient.selectAll('stop').data([[0, 1], [0.5, 0], [1, 1]]).join('stop')
    .attr('offset', d => d[0]).style('stop-color', colour).style('stop-opacity', d => d[1]);

  parent.append('path').attr('class', 'no-contest-line')
    .attr('d', `M${x0},${y0}L${x1},${y1}`)
    .attr('fill', 'none').attr('stroke', `url(#${id})`).attr('stroke-width', width).attr('stroke-linecap', 'round');

  return parent.append('circle').attr('class', 'no-contest-point')
    .attr('cx', x(NO_CONTEST)).attr('cy', (y0 + y1) / 2).attr('r', radius - 0.5)
    .attr('fill', 'var(--surface)').attr('stroke', colour).attr('stroke-width', 2);
}

/** All years from first to last, 2020 included. */
export const axisYears = (first, last) => d3.range(first, last + 1);
