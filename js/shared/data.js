// Loading the data files and the one calculation every page shares.
/* global d3 */

export const FIRST_YEAR = 1957;
export const LAST_YEAR = 2023;

/** @returns {Promise<{id: string, name: string, region: string}[]>} */
export const loadCountries = () => d3.json('data/countries.json');

export const REFERENCE_YEARS = [1975, 2015];   // the 12-point system before the split vote

/**
 * One row per vote in a final.
 *   points     the points actually given
 *   fav        favoritism: points minus what the receiver got on average that year,
 *              standardised to the 12-point scale (see below)
 *   std        the points, standardised the same way
 *
 * Standardising: the points systems hand out very different amounts (one point per juror in
 * the 1960s, two full sets of 12-point scores since 2016). Each year is scaled so its points
 * have the same spread (standard deviation) as an average 1975-2015 final, the long era of the
 * 12-point system. The values stay in points as people know them, and years can be compared
 * and averaged together. The bias page shows the same correction, divided by the spread.
 */
export async function loadVotes() {
  const votes = await d3.csv('data/votes-finals.csv', d => ({
    giver: d.giver, receiver: d.receiver, year: +d.year, points: +d.points, rawFav: +d.fav,
  }));
  const spread = d3.rollup(votes, rows => d3.deviation(rows, r => r.points), v => v.year);
  const [from, to] = REFERENCE_YEARS;
  const reference = d3.mean([...spread].filter(([year]) => year >= from && year <= to), ([, sd]) => sd);
  for (const v of votes) {
    const k = reference / spread.get(v.year);
    v.fav = v.rawFav * k;
    v.std = v.points * k;
  }
  return votes;
}

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
 * fav is the standardised average, points the total actually given.
 * @returns {Map<string, {fav: number, finals: number, points: number}>}
 */
export function pairAverages(votes, fromYear, toYear, minShared = minSharedFinals(fromYear, toYear)) {
  const rolled = d3.rollup(
    votes.filter(v => v.year >= fromYear && v.year <= toYear),
    rows => ({ fav: d3.mean(rows, r => r.fav), finals: rows.length, points: d3.sum(rows, r => r.points) }),
    v => pairKey(v.giver, v.receiver),
  );
  for (const [key, pair] of rolled) if (pair.finals < minShared) rolled.delete(key);
  return rolled;
}

export const signed = d3.format('+.1f');
export const yearsLabel = (a, b) => (a === b ? String(a) : `${a}–${b}`);
