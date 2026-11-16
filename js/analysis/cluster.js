// Finding voting blocs: agglomerative clustering with average linkage.
//
// Start with every country on its own. Keep merging the two groups whose members favour each
// other most on average, until one group is left. That gives a tree. Its leaf order sorts the
// matrix, which puts countries that vote alike next to each other.
//
// Blocs are then read off the tree with a strength threshold. Most countries do not belong to
// any bloc, and that is a result too: they are left on their own.

/**
 * @param {string[]} ids
 * @param {(a: string, b: string) => number|null} similarity  symmetric; null when unknown
 * @returns {{order: string[], strongGroups: (threshold: number) => string[][]}}
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

  // a node of the tree: its members in display order, the score of the merge that made it, and its two halves
  let nodes = ids.map(id => ({ members: [id], score: Infinity, halves: [] }));

  while (nodes.length > 1) {
    let best = { score: -Infinity, i: 0, j: 1 };
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const score = between(nodes[i].members, nodes[j].members);
        if (score > best.score) best = { score, i, j };
      }
    }
    // Each node keeps its members in a line. When two lines are joined, flip them so the two
    // countries that meet in the middle are the most similar of the four possible end pairs.
    const a = nodes[best.i], b = nodes[best.j];
    const flipped = list => [...list].reverse();
    const options = [
      [a.members, b.members], [a.members, flipped(b.members)], [flipped(a.members), b.members], [flipped(a.members), flipped(b.members)],
    ];
    const [left, right] = options.reduce((x, y) => (endsMatch(y[0].at(-1), y[1][0]) > endsMatch(x[0].at(-1), x[1][0]) ? y : x));
    const merged = { members: [...left, ...right], score: best.score, halves: [a, b] };
    nodes = [...nodes.filter((node, index) => index !== best.i && index !== best.j), merged];
  }

  const root = nodes[0];
  const order = root.members;
  const rank = new Map(order.map((id, i) => [id, i]));

  // how much one member and the rest of its group favour each other, on average
  const tieToGroup = (id, group) => between([id], group.filter(other => other !== id));

  return {
    order,
    /**
     * Groups whose members favour each other by at least `threshold` points on average.
     * Walk down the tree and keep the biggest branches that clear the threshold. Then drop
     * members whose own tie to the rest of the group is below it, weakest first, so a country
     * that only hangs on through one friend does not count as part of the bloc.
     */
    strongGroups(threshold) {
      const found = [];
      (function walk(node) {
        if (node.members.length < 2) return;
        if (node.score >= threshold) found.push([...node.members]);
        else node.halves.forEach(walk);
      })(root);

      return found.map(group => {
        let core = group;
        while (core.length > 2) {
          const weakest = core.reduce((x, y) => (tieToGroup(y, core) < tieToGroup(x, core) ? y : x));
          if (tieToGroup(weakest, core) >= threshold) break;
          core = core.filter(id => id !== weakest);
        }
        return core;
      })
        .filter(core => core.length >= 2 && between([core[0]], core.slice(1)) >= threshold)
        .map(core => core.sort((x, y) => rank.get(x) - rank.get(y)))
        .sort((x, y) => rank.get(x[0]) - rank.get(y[0]));
    },
  };
}
