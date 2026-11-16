// Putting names next to dots so that it is always clear which dot a name belongs to.
//
// A label is tried right beside its dot first (right, left, above, below) and then further out.
// A spot is only accepted when
//   - the name touches no dot and no other name,
//   - no other dot is within `clearance` px of the name (otherwise it could be read as that dot's name),
//   - a leader line, used for spots further out, does not pass another dot.
// If no spot passes, the dot gets no name. An unnamed dot can still be hovered; a name on the
// wrong dot is worse than none.

// Right and left first: a name beside its dot is the easiest to read. The diagonal spots are
// only used further out, where a leader line ties the name to its dot. Right next to a dot,
// a name sitting off a corner looks like it could belong to a neighbour.
const STRAIGHT = [[1, 0], [-1, 0], [0, -1], [0, 1]];
const DIAGONAL = [[1, -1], [-1, -1], [1, 1], [-1, 1]];

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const grow = (box, by) => ({ x0: box.x0 - by, x1: box.x1 + by, y0: box.y0 - by, y1: box.y1 + by });

// real text widths, measured on a canvas in the page's font
const canvas = document.createElement('canvas').getContext('2d');
function textWidth(text, fontSize, fontWeight) {
  canvas.font = `${fontWeight} ${fontSize}px "IBM Plex Sans", system-ui, sans-serif`;
  return canvas.measureText(text).width;
}

/**
 * @param {object} options
 * @param {{x: number, y: number}[]} options.dots  every dot in the plot, in pixels
 * @param {number} options.radius                  dot radius
 * @param {{x0, x1, y0, y1}} options.bounds        labels must stay inside this box
 */
export function createLabelPlacer({ dots, radius, bounds }) {
  const dotBoxes = dots.map(d => ({ owner: d, x0: d.x - radius, x1: d.x + radius, y0: d.y - radius, y1: d.y + radius }));
  const labelBoxes = [];

  const outside = box => box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1;

  function free(dot, box, clearance) {
    if (outside(box)) return false;
    if (labelBoxes.some(other => overlap(grow(box, 2), other))) return false;
    return !dotBoxes.some(other => overlap(other.owner === dot ? box : grow(box, clearance), other));
  }

  function candidate(dot, text, font, [dx, dy], distance) {
    const width = textWidth(text, font.size, font.weight);
    const ax = dot.x + dx * distance, ay = dot.y + dy * distance;
    const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle';
    const x0 = anchor === 'start' ? ax : anchor === 'end' ? ax - width : ax - width / 2;
    const baseline = dy < 0 ? ay - 2 : dy > 0 ? ay + font.size - 1 : ay + font.size * 0.35;
    const box = { x0, x1: x0 + width, y0: baseline - font.size + 1, y1: baseline + 3 };
    const leaderEnd = distance > radius + 6
      ? [anchor === 'start' ? box.x0 - 2 : anchor === 'end' ? box.x1 + 2 : ax, dy < 0 ? box.y1 : dy > 0 ? box.y0 : (box.y0 + box.y1) / 2]
      : null;
    return { x: ax, y: baseline, anchor, box, leaderEnd };
  }

  function leaderHitsDot(dot, end) {
    const vx = end[0] - dot.x, vy = end[1] - dot.y, len2 = vx * vx + vy * vy || 1;
    return dots.some(other => {
      if (other === dot) return false;
      const t = Math.max(0, Math.min(1, ((other.x - dot.x) * vx + (other.y - dot.y) * vy) / len2));
      return Math.hypot(dot.x + t * vx - other.x, dot.y + t * vy - other.y) < radius + 3;
    });
  }

  /**
   * Find a spot for one label and reserve it. Returns null when no clear spot exists.
   * @param {{size: number, weight: number}} font
   * @param {number[]} distances  how far from the dot to try, nearest first
   * @param {number} clearance    how far the name must stay from every other dot, in px
   */
  function place(dot, text, font, distances, clearance) {
    for (const distance of distances) {
      const withLeader = distance > radius + 6;
      for (const direction of withLeader ? [...STRAIGHT, ...DIAGONAL] : STRAIGHT) {
        const c = candidate(dot, text, font, direction, distance);
        if (free(dot, c.box, clearance) && !(c.leaderEnd && leaderHitsDot(dot, c.leaderEnd))) {
          labelBoxes.push(c.box);
          return c;
        }
      }
    }
    return null;
  }

  return { place };
}
