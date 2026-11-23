// The base map of Europe, drawn once per page. The country map and the voting-blocs page
// both use it and only repaint the fills afterwards.
/* global d3, topojson */

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 760;

// Label positions where the centroid of the shape lands badly (Norway's is in Sweden, and so on).
const LABEL_AT = {
  ru: [40, 56.5], no: [9.3, 61.3], se: [15.2, 62.6], fi: [26, 62.6], fr: [2.4, 46.8], gb: [-1.9, 52.7],
  hr: [15.6, 45.6], gr: [22, 39.5], it: [12.8, 42.9], pt: [-8, 39.8], es: [-3.7, 40.1], tr: [34.5, 39],
  dk: [9.2, 56.1], nl: [5.6, 52.3], il: [34.9, 31.2], ma: [-6.2, 32.2], az: [47.8, 40.4], ua: [31.5, 49.2],
  de: [10.3, 51], ie: [-8.1, 53.2], is: [-18.6, 64.9], cy: [33.1, 35],
};
// Too small to click as shapes, so they are drawn as dots.
const MICRO_STATES = { ad: [1.55, 42.55], mc: [7.42, 43.74], sm: [12.45, 43.94], mt: [14.42, 35.9], lu: [6.12, 49.78] };
// Small countries that still get a label.
const ALWAYS_LABEL = new Set(['ie', 'pt', 'cy', 'me', 'mk', 'si', 'il', 'am', 'ge', 'az', 'md', 'ee', 'lv', 'lt', 'al', 'ba', 'be', 'nl', 'ch', 'dk']);
const BIG_ENOUGH = 2200;   // px² on the 960-wide drawing

/**
 * @param svg      d3 selection of an empty <svg>
 * @param topology data/europe.topo.json
 * @param handlers {enter, move, leave, click}, each called with (event, countryId)
 */
export function createEuropeMap(svg, topology, handlers = {}) {
  const features = topojson.feature(topology, topology.objects.c).features;
  const projection = d3.geoConicConformal().parallels([35, 65]).rotate([-14, 0])
    .fitExtent([[8, 8], [MAP_WIDTH - 8, MAP_HEIGHT - 8]],
      { type: 'MultiPoint', coordinates: [[-25, 64.5], [30, 71.5], [50.5, 40.5], [-12, 36], [36, 30.5], [-10, 29.5], [46, 67]] });
  const path = d3.geoPath(projection);

  const idOf = f => f.properties.c;
  const participants = features.filter(f => idOf(f) && idOf(f) !== 'au');
  const others = features.filter(f => !idOf(f));
  // Australia without Macquarie Island, which lies far to the south and would shrink the inset.
  const australiaFull = features.find(f => idOf(f) === 'au');
  const australia = { ...australiaFull, geometry: { type: 'MultiPolygon',
    coordinates: australiaFull.geometry.coordinates.filter(poly => d3.min(poly[0], p => p[1]) > -50) } };

  /** Where lines and labels attach, per country id. */
  const position = {};
  const labelSize = {};

  function anchor(feature) {
    if (LABEL_AT[idOf(feature)]) return projection(LABEL_AT[idOf(feature)]);
    let geometry = feature.geometry;
    if (geometry.type === 'MultiPolygon') {   // use the mainland, not the islands
      const largest = d3.greatest(geometry.coordinates, rings => d3.geoArea({ type: 'Polygon', coordinates: rings }));
      geometry = { type: 'Polygon', coordinates: largest };
    }
    return path.centroid(geometry);
  }

  // The outline of a hovered or picked-out country is a copy of its shape drawn above all
  // countries. A stroke on the shape itself gets half covered by whichever neighbour is drawn later.
  let hovered = null, pickedOut = null;
  function drawOutlines() {
    const ids = new Set(pickedOut ?? []);
    if (hovered) ids.add(hovered);
    outlines.selectAll('*').remove();
    countries.filter(id => ids.has(id)).each(function () {
      const copy = this.cloneNode(false);
      copy.removeAttribute('data-c');
      copy.setAttribute('class', 'country-outline');
      outlines.node().append(copy);
    });
  }

  const listen = selection => selection
    .on('mouseenter', (e, id) => { hovered = id; drawOutlines(); handlers.enter?.(e, id); })
    .on('mousemove', (e, id) => handlers.move?.(e, id))
    .on('mouseleave', (e, id) => { hovered = null; drawOutlines(); handlers.leave?.(e, id); })
    .on('click', (e, id) => handlers.click?.(e, id));

  svg.attr('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  const defs = svg.append('defs');
  defs.append('clipPath').attr('id', 'map-clip').append('rect').attr('width', MAP_WIDTH).attr('height', MAP_HEIGHT);
  const hatch = defs.append('pattern').attr('id', 'hatch').attr('width', 6).attr('height', 6)
    .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
  hatch.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'var(--surface)');
  hatch.append('line').attr('y2', 6).attr('stroke', 'var(--line-strong)').attr('stroke-width', 2);

  const root = svg.append('g').attr('clip-path', 'url(#map-clip)');
  root.append('rect').attr('width', MAP_WIDTH).attr('height', MAP_HEIGHT).attr('fill', 'var(--sea)');
  root.append('g').attr('class', 'map-context').selectAll('path').data(others).join('path').attr('d', path);

  // Shapes are bound to the country id, so every handler gets the id whatever the element is.
  const shapes = root.append('g').selectAll('path').data(participants.map(idOf)).join('path')
    .attr('class', 'country').attr('data-c', id => id)
    .attr('d', (id, i) => path(participants[i]))
    .call(listen);

  participants.forEach(f => {
    position[idOf(f)] = anchor(f);
    const area = path.area(f);
    if (area > BIG_ENOUGH || ALWAYS_LABEL.has(idOf(f))) labelSize[idOf(f)] = area < BIG_ENOUGH ? 9 : 11;
  });

  root.append('g').selectAll('circle').data(Object.keys(MICRO_STATES)).join('circle')
    .attr('class', 'country micro').attr('data-c', id => id)
    .attr('cx', id => (position[id] = projection(MICRO_STATES[id]))[0]).attr('cy', id => position[id][1]).attr('r', 5.5)
    .call(listen);

  // Boxes in the Atlantic: two countries that no longer exist, and Australia.
  const boxX = 18, boxY = 190;
  const boxes = svg.append('g');
  boxes.append('text').attr('class', 'map-note').attr('x', boxX).attr('y', boxY - 8).text('historical');
  const past = boxes.selectAll('g').data(['yu', 'cs']).join('g')
    .attr('transform', (id, i) => `translate(${boxX + i * 66},${boxY})`);
  past.append('rect').attr('class', 'country boxed').attr('data-c', id => id).attr('width', 58).attr('height', 50).attr('rx', 5).call(listen);
  past.each((id, i) => { position[id] = [boxX + i * 66 + 29, boxY + 25]; });

  const auX = boxX, auY = boxY + 80, auW = 150, auH = 128;
  boxes.append('text').attr('class', 'map-note').attr('x', auX).attr('y', auY - 8).text('Australia, since 2015');
  boxes.append('rect').attr('class', 'map-frame').attr('x', auX).attr('y', auY).attr('width', auW).attr('height', auH).attr('rx', 5);
  const auPath = d3.geoPath(d3.geoMercator().fitExtent([[auX + 8, auY + 8], [auX + auW - 8, auY + auH - 8]], australia));
  boxes.append('path').datum('au').attr('class', 'country').attr('data-c', 'au').attr('d', auPath(australia)).call(listen);
  position.au = auPath.centroid(australia);

  // Labels: two-letter codes, on top of everything and never in the way of the pointer.
  const labelled = [...Object.keys(labelSize), 'yu', 'cs', 'au'];
  const labels = svg.append('g').attr('class', 'map-labels').selectAll('text').data(labelled).join('text')
    .attr('data-label', id => id).attr('text-anchor', 'middle')
    .attr('font-size', id => labelSize[id] ?? 10.5)
    .attr('x', id => position[id][0]).attr('y', id => position[id][1] + 4)
    .text(id => id.toUpperCase());

  const countries = svg.selectAll('[data-c]');
  const outlines = svg.append('g').attr('class', 'map-outlines');
  const overlay = svg.append('g').attr('class', 'map-overlay');

  return {
    position,
    /** Layer above the countries, for bond lines. */
    overlay,
    /**
     * Repaint. fill(id) returns a colour or null for "no data" (hatched);
     * ink(id) returns the label colour.
     */
    paint({ fill, ink }) {
      countries.attr('fill', id => fill(id) ?? 'url(#hatch)');
      labels.attr('fill', id => ink(id));
    },
    /** Replace the two-letter codes with other text, e.g. a group letter. text(id) may return ''. */
    relabel(text, fontSize) {
      labels.text(id => text(id));
      if (fontSize) labels.attr('font-size', fontSize);
    },
    /** Push some labels down so a line can start at the centre of the country. */
    lowerLabels(ids) {
      labels.attr('y', id => position[id][1] + (ids.has(id) ? 16 : 4));
    },
    /** Outline a set of countries, or pass null to clear. */
    outline(ids) {
      pickedOut = ids;
      drawOutlines();
    },
    /** Dim every country outside the set, or pass null to clear. */
    spotlight(ids) {
      countries.classed('is-dim', id => !!ids && !ids.has(id));
    },
    /** Mark countries that have no data at all, e.g. were in no final in the selected years. */
    markAbsent(isAbsent) {
      countries.classed('is-absent', id => !!isAbsent?.(id));
    },
    markSelected(selected) {
      countries.classed('is-selected', id => id === selected);
    },
  };
}
