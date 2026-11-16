# Eurovision favoritism

Website for our Data Visualization project (Aarhus University, fall 2026) on voting in the Eurovision finals, 1957–2023.

The question behind every page is the same: which countries give each other more points than the songs alone would explain?

## Pages

| Page | File | What it shows |
| --- | --- | --- |
| Country map | `index.html` | Pick a country and see who gives it more or fewer points than expected, or who it favours. The teal wedges mark the strongest mutual bonds. |
| Voting blocs | `voting-blocs.html` | All countries at once, in a matrix sorted by clustering, next to a map of the groups that come out. |
| Jury vs televote | `jury-televote.html` | Finding 3.3. Average jury points against average televote points per country for 2016–2023, and one country year by year. |
| Bias over time | `bias-over-time.html` | Finding 3.4. Why the raw favoritism curve jumps, a measure the points system cannot affect, and jury against televote since 2016. |

The logo in the top bar leads back to the country map.

## Run it

The pages load their data with `fetch`, so they have to come from a web server. Opening `index.html` by double-clicking will show an error message.

In VS Code, right-click `index.html` and choose **Open with Live Server**. Without VS Code:

```
python3 -m http.server 8000
```

and open http://localhost:8000. Everything works offline except the web fonts, which fall back to system fonts.

There is no build step and nothing to install. D3 and topojson-client are checked in under `js/vendor/`.

## How the code is organised

```
index.html, voting-blocs.html, ...   markup only: controls, empty <svg>, help texts
css/site.css                         colours, type, top bar, controls, cards
css/<page>.css                       the few rules only one page needs
js/pages/<page>.js                   one ES module per page
js/shared/                           code more than one page uses
  page.js                            start-up, error message, theme helpers
  data.js                            loading the CSV/JSON files, pair averages
  europe-map.js                      the base map (drawn once, then repainted)
  favoritism-scale.js                red/blue symlog colour scale and its legend
  year-range.js                      two-handle year slider and preset buttons
  label-placement.js                 names next to dots without overlaps
  tooltip.js, help.js, nav.js        tooltip, "?" buttons, top bar
  detect-country.js                  which country the map opens on
js/analysis/cluster.js               hierarchical clustering for the blocs page
data/                                what the pages load
data/raw/votes.csv                   the source data, untouched
scripts/build_data.py                turns the raw file into the files in data/
```

Each page script follows the same order: load the data, keep the user's choices in one `state` object, and call `render()` whenever the state changes. Things that never change (the map shapes, axis titles) are drawn once. Things that do change go through D3 data joins, so a dot or a country keeps its element and moves or recolours.

Colours live in CSS custom properties in `css/site.css`, with a second set for dark mode. The SVG refers to them as `var(--name)`, so the charts follow the theme without being redrawn. The exception is the red/blue scale, which D3 has to interpolate from actual colour values.

### Adding a page

1. Copy `jury-televote.html`. It has the top bar, the shared styles and a few "?" buttons to copy from.
2. Add a `js/pages/<name>.js` that calls `startPage(async () => { ... })`.
3. Add one line to `PAGES` at the top of `js/shared/nav.js`.

### Rebuilding the data

```
python3 scripts/build_data.py
```

reads `data/raw/votes.csv` and rewrites `votes-finals.csv`, `jury-televote.csv` and `bias-over-time.json`. It only uses Python's standard library. `countries.json`, `europe.topo.json` and `voting-systems.json` are edited by hand.

## How the numbers work

Favoritism is the points a country gave minus the average the receiver got from all voters that year. It is then averaged over the finals both countries were in. The 2023 "rest of world" televote is left out, a country's own row (always 0) is dropped, and there was no contest in 2020.

A pair needs enough shared finals before its average is shown: at least 5 for ranges of 20 years or more, 3 for 8 to 19 years and 1 for shorter ranges.

The map's colour scale is a symmetric log scale from −14 to +14 with constant 1. It is linear near 0 and logarithmic further out, because half of all pairs are within ±1 point while a few reach +13. Red and blue of the same strength mean the same number of points.

The strongest bonds are the pairs with the highest average of the two directions. Each direction is drawn as a wedge that is wide at the giver and pointed at the receiver, and the width of the base is the favoritism in that direction.

On the blocs page, the similarity between two countries is the mean of their favoritism in both directions. Countries are clustered bottom-up with average linkage, the leaf order of that tree sorts the matrix, and the slider cuts the tree into 2 to 8 groups. A country is left out of a period if it lacks a two-way value with at least half of the others. Group names come from the `region` field in `countries.json`.

On the jury page, the values are the average jury and televote points a country received per voting country in 2016–2023 finals, rest-of-world televote included. The gap is jury minus televote. A country gets a bold name when its gap is more than 1.25 standard deviations from the mean gap of the selected years. Other dots get a grey name when they are at least 24 px from the diagonal, have no other dot within 30 px, and the name fits beside the dot without touching anything.

Bias over time, chart 1, is the mean absolute favoritism per year. "Same scale" divides each year by the standard deviation of that year's points. The strip underneath is the mean number of points a country handed out, grouped by voting system; the texts for each system are in `data/voting-systems.json`.

Chart 2 is, per year, the correlation between every pair's favoritism that year and the pair's average over the previous five contests (pairs that met at least twice in them). The dashed line keeps the 32 countries that were in finals before 2004, in 2004–2015 and after 2016. Chart 3 does the same for 2016–2023 with jury and televote favoritism separately, against each pair's 2004–2015 average (at least three meetings).

## Design choices and where they come from

These are the decisions we expect to be asked about, with the lecture or paper each one rests on.

The pages follow Shneiderman's "overview first, zoom and filter, then details on demand" (lecture 4). The map and the matrix are the overviews, the year slider and country picker filter, and exact values sit in tooltips and "?" boxes so the charts stay light on text.

The same red/blue scale is used on the map, in the side lists and in the blocs matrix, and the jury/televote colours are the same on both pages that use them. That is the rule of consistency for multiple views (Baldonado et al. 2000, lecture 4). On the blocs page the matrix, the map and the list are linked: hovering a group in one fades everything else in the other two (brushing and linking, same lecture).

The blocs page uses a matrix because the graph is dense: almost every country has a value for almost every other. Lecture 11 gives that as the first reason to prefer a matrix over a node-link diagram. The rows and columns are ordered by the clustering so that groups form blocks on the diagonal, which is the idea behind ordering a matrix towards Robinson form (Wu et al. 2008, lecture 11). The number of groups is a slider because clustering has no single right answer; letting the reader steer the algorithm is the visual analytics idea from lecture 13.

Direction on the map is shown with tapered wedges. Our first version had arrowheads, which piled up where several lines met in the Balkans. Holten and van Wijk (2009, "A user study on visualizing directed edges in graphs") found tapered edges faster and more accurate to read than arrows. That paper is not on the course list. The two wedges of a pair bend only slightly, since lecture 11 lists few edge bends among the criteria for a readable node-link drawing.

The scatterplot answers lecture 3's checklist like this. Both axes share one scale and the plot is square, so the diagonal is at 45° and distance from it is the gap. Grid lines are faint. The reference line is jury = televote; we left out a trend line because the diagonal is the comparison that matters here. Dots are large enough to click, and only dots that can carry a name without clutter get one.

The line charts mark rule changes with vertical lines and keep the y-axis starting at 0. Chart 1 has the strip of voting systems directly under it, on the same time axis, so a jump in the line can be read against the rule change that caused it. Time is mapped to position on a linear axis throughout (lecture 9).

Dividing by each year's standard deviation in chart 1 is a data transformation in the sense of lecture 6: the raw numbers are correct but not comparable across voting systems. Showing the raw version first and the corrected one behind a toggle is our answer to "do not visualize to deceive" (ethical design, lecture 5). Hatching for pairs with too few shared finals is explicit encoding of missing data (lecture 6) instead of silently colouring them as 0.

## Limits

Favoritism here is a description of voting patterns. It does not show why countries vote as they do: shared language, diaspora and similar music taste all produce the same pattern.

The clustering is one reasonable method among several, and group borders move when the years or the number of groups change. Groups that hold together across settings deserve more trust than ones that appear at a single setting.

Chart 2's five-contest window is a choice. Other window lengths give the same shape with slightly different values.

## Sources

Data: Spijkervet, eurovision-dataset (GitHub/Zenodo). Map geometry: Natural Earth 1:50m via world-atlas. Voting rules by year: the EBU's published rules as summarised on Eurovisionworld and Wikipedia ("Voting at the Eurovision Song Contest").
