// Loading the data files and the one calculation every page shares.
/* global d3 */

export const FIRST_YEAR = 1957;
export const LAST_YEAR = 2023;

/** @returns {Promise<{id: string, name: string, region: string}[]>} */
export const loadCountries = () => d3.json('data/countries.json');

/** One row per vote in a final. fav = points minus what the receiver got on average that year. */
export const loadVotes = () => d3.csv('data/votes-finals.csv', d => ({
  giver: d.giver, receiver: d.receiver, year: +d.year, points: +d.points, fav: +d.fav,
}));

/** 2016-2023 finals. jury is null for the rest-of-world televote, which has no jury. */
export const loadJuryTelevote = () => d3.csv('data/jury-televote.csv', d => ({
  giver: d.giver, receiver: d.receiver, year: +d.year, jury: d.jury === '' ? null : +d.jury, tele: +d.tele,
}));

// How many shared finals a pair needs before we trust its average.
// Long ranges can afford to be strict, short ones can't.
export function minSharedFinals(fromYear, toYear) {
  const span = toYear - fromYear + 1;
  return span >= 20 ? 5 : span >= 8 ? 3 : 1;
}

export const pairKey = (giver, receiver) => `${giver}>${receiver}`;

/**
 * Average favoritism for every giver>receiver pair in a year range.
 * Pairs with fewer than `minShared` finals together are left out.
 * @returns {Map<string, {fav: number, finals: number, points: number}>}
 */
export function pairAverages(votes, fromYear, toYear, minShared = minSharedFinals(fromYear, toYear)) {
  const rolled = d3.rollup(
    votes.filter(v => v.year >= fromYear && v.year <= toYear),
    rows => ({ fav: d3.mean(rows, r => r.fav), finals: rows.length, points: d3.mean(rows, r => r.points) }),
    v => pairKey(v.giver, v.receiver),
  );
  for (const [key, pair] of rolled) if (pair.finals < minShared) rolled.delete(key);
  return rolled;
}

export const signed = d3.format('+.1f');
export const yearsLabel = (a, b) => (a === b ? String(a) : `${a}–${b}`);
