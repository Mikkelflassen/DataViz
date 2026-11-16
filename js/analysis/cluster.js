// Finding voting blocs: agglomerative clustering with average linkage.
//
// Start with every country on its own. Keep merging the two groups whose members favour each
// other most on average, until one group is left. Stopping early, with k groups remaining,
// gives the blocs. The order in which the tree lists the countries is also used to sort the
// matrix, which puts countries that vote alike next to each other.

/**
 * @param {string[]} ids
 * @param {(a: string, b: string) => number|null} similarity  symmetric; null when unknown
 * @returns {{order: string[], cut: (k: number) => string[][]}}
 */
export function clusterBySimilarity(ids, similarity) {
  // similarity between two groups = mean over all known member pairs
  const between = (groupA, groupB) => {
    let sum = 0, count = 0;
    for (const a of groupA) for (const b of groupB) {
      const s = similarity(a, b);
      if (s != null) { sum += s; count++; }
    }
    return count ? sum / count : -Infinity;
  };
  const endsMatch = (a, b) => similarity(a, b) ?? -Infinity;

  let groups = ids.map(id => [id]);
  const history = [groups];   // history[i] holds the grouping with ids.length - i groups

  while (groups.length > 1) {
    let best = { score: -Infinity, i: 0, j: 1 };
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const score = between(groups[i], groups[j]);
        if (score > best.score) best = { score, i, j };
      }
    }
    // Each group keeps its members in a line. When two lines are joined, flip them so the two
    // countries that meet in the middle are the most similar of the four possible end pairs.
    const a = groups[best.i], b = groups[best.j];
    const options = [
      [a, b], [a, [...b].reverse()], [[...a].reverse(), b], [[...a].reverse(), [...b].reverse()],
    ];
    const [left, right] = options.reduce((x, y) => (endsMatch(y[0].at(-1), y[1][0]) > endsMatch(x[0].at(-1), x[1][0]) ? y : x));
    groups = [...groups.filter((g, index) => index !== best.i && index !== best.j), [...left, ...right]];
    history.push(groups);
  }

  const order = groups[0];
  const rank = new Map(order.map((id, i) => [id, i]));
  return {
    order,
    /** The grouping with k groups, each listed in matrix order. */
    cut(k) {
      const wanted = Math.max(1, Math.min(k, ids.length));
      return history[ids.length - wanted]
        .map(group => [...group].sort((x, y) => rank.get(x) - rank.get(y)))
        .sort((x, y) => rank.get(x[0]) - rank.get(y[0]));
    },
  };
}
