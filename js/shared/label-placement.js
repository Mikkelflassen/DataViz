// Putting names next to dots without covering other dots or names.
//
// A label is tried in eight directions around its dot, close first and then further out.
// The first spot that touches nothing wins. Spots further out get a leader line, and a
// leader line may not pass another dot, or the name could be read as belonging to that one.

const DIRECTIONS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * @param {object} options
 * @param {{x: number, y: number}[]} options.dots  every dot in the plot, in pixels
 * @param {number} options.radius                  dot radius
 * @param {{x0, x1, y0, y1}} options.bounds        labels must stay inside this box
 * @param {(box) => boolean} [options.blocked]     extra areas a label may not cover
 */
export function createLabelPlacer({ dots, radius, bounds, blocked = () => false }) {
  const taken = dots.map(d => ({ x0: d.x - radius, x1: d.x + radius, y0: d.y - radius, y1: d.y + radius }));

  const outside = box => box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1;
  const grow = (box, by) => ({ x0: box.x0 - by, x1: box.x1 + by, y0: box.y0 - by, y1: box.y1 + by });
  const free = (box, margin) => !outside(box) && !blocked(box) && !taken.some(t => overlap(grow(box, margin), t));

  function candidate(dot, text, fontSize, [dx, dy], distance) {
    const width = text.length * fontSize * 0.56;   // close enough for a sans-serif at these sizes
    const ax = dot.x + dx * distance, ay = dot.y + dy * distance;
    const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle';
    const x0 = anchor === 'start' ? ax : anchor === 'end' ? ax - width : ax - width / 2;
    const baseline = dy < 0 ? ay - 2 : dy > 0 ? ay + fontSize - 1 : ay + fontSize * 0.35;
    const box = { x0, x1: x0 + width, y0: baseline - fontSize + 1, y1: baseline + 3 };
    const leaderEnd = distance > radius + 6
      ? [anchor === 'start' ? box.x0 - 2 : anchor === 'end' ? box.x1 + 2 : ax, (box.y0 + box.y1) / 2]
      : null;
    return { x: ax, y: baseline, anchor, box, leaderEnd };
  }

  function leaderHitsDot(dot, end) {
    const vx = end[0] - dot.x, vy = end[1] - dot.y, len2 = vx * vx + vy * vy || 1;
    return dots.some(other => {
      if (other === dot) return false;
      const t = Math.max(0, Math.min(1, ((other.x - dot.x) * vx + (other.y - dot.y) * vy) / len2));
      return Math.hypot(dot.x + t * vx - other.x, dot.y + t * vy - other.y) < radius + 2;
    });
  }

  /**
   * Find a spot for one label and reserve it.
   * @param {number[]} distances  how far from the dot to try, nearest first
   * @param {boolean} must        true: fall back to a spot that may overlap. false: give up and return null.
   * @param {number} margin       extra air the label needs around it, in px
   */
  function place(dot, text, fontSize, distances, must, margin = 0) {
    for (const distance of distances) {
      for (const direction of DIRECTIONS) {
        const c = candidate(dot, text, fontSize, direction, distance);
        if (free(c.box, margin) && !(c.leaderEnd && leaderHitsDot(dot, c.leaderEnd))) { taken.push(c.box); return c; }
      }
    }
    if (!must) return null;
    const fallback = DIRECTIONS.map(d => candidate(dot, text, fontSize, d, radius + 20)).find(c => !outside(c.box))
      ?? candidate(dot, text, fontSize, [-1, 0], radius + 5);
    taken.push(fallback.box);
    return fallback;
  }

  return { place };
}
