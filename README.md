# Eurovision favoritism

Interactive website for our Data Visualization project on Eurovision voting (finals 1957–2023).

## Pages

| Page | File | What it shows |
| --- | --- | --- |
| Country map (main page) | `index.html` | Pick a country to see who gives it more or fewer points than expected. Year-range slider and strongest-bonds slider. |
| Jury vs Televote | `jury-televote.html` | Finding 3.3: scatterplot of average jury points vs televote points per country (2016–2023), the biggest gaps, and a year-by-year chart for one country. |
| Bias over time | `bias-over-time.html` | Finding 3.4: why the raw favoritism curve jumps (points system), a scale-free measure of bloc voting over time, and jury vs televote since 2016. |

The logo in the top bar always leads back to the country map.

## Adding a page

1. Copy `jury-televote.html` as a starting point (it already has the top bar, shared styles and "?" help buttons — copy a `help` button plus its `help-pop` box to add one).
2. Add one line to the `PAGES` list at the top of `js/nav.js`, e.g. `{ href: 'greece-cyprus.html', label: 'Greece & Cyprus' }`.

The top bar on every page updates automatically.

## Files

```
index.html               country map (main page)
jury-televote.html       jury vs televote subpage
css/site.css             shared colours, fonts and top bar
js/nav.js                top bar, logo and the list of pages
js/d3.min.js             D3 v7.9.0
js/topojson-client.min.js  topojson-client v3.1.0
```

## How the numbers work

- **Favoritism** = points given − the receiver's average points from all voters that year, averaged over the years both countries were in the final. "Rest of world" televote is excluded, and there was no contest in 2020.
- **Map year slider:** ranges of 20+ years need at least 5 shared finals per pair, 8–19 years at least 3, shorter ranges at least 1.
- **Colour scale (map)** = symmetric log (symlog, constant 1) from −14 to +14: linear near 0, logarithmic further out, so both the many small values and the few large ones (up to +13) stay distinguishable. Same strength of red and blue = same number of points.
- **Default country (map)** = taken from the browser's time zone, then its language (English is ignored, since it says nothing about location); falls back to Cyprus. Add `#dk`, `#se` etc. to the address to open on a specific country.
- **Strongest bonds (map)** = pairs ranked by the average of both directions (or, with "With <country>", the selected country's pairs). Each direction is a teal line that fades in from the giver and ends in an arrow at the receiver; its width is the favoritism that way, so the strongest pairs are the thickest and one-sided friendships show one thick and one thin line. Hovering a line or a name in the list picks out that pair.
- **Jury vs Televote** = average jury points and average televote points each country received per voting country in 2016–2023 finals (rest-of-world televote included). Gap = jury − televote. A country is named on the scatterplot when its gap is more than 1.25 standard deviations from the average gap for the selected years (the selected country is always named). The year slider always covers at least two contests. A country's own row (it cannot vote for itself, so always 0) is left out; including it lowers every average by about 3%.
- **Bias over time, chart 1** = average |favoritism| per year (the group's Tableau measure). "Same scale" divides each year by the standard deviation of that year's points.
- **Bias over time, chart 2** = for each year, the correlation between every pair's favoritism that year and their average over the previous five contests (pairs that met at least twice). Shuffling each country's points at random gives about 0.
- **Bias over time, chart 3** = the same idea for 2016–2023, comparing jury and televote favoritism with each pair's 2004–2015 average (pairs that met at least three times).

## Run locally

Open the folder in VS Code and use **Open with Live Server** on `index.html`, or run `python3 -m http.server 8000` and open http://localhost:8000. Everything works offline except the web fonts, which fall back to system fonts.

Map geometry: Natural Earth via world-atlas (1:50m). Data: Spijkervet/eurovision-dataset.
