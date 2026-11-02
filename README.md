# Eurovision favoritism

Interactive website for our Data Visualization project on Eurovision voting (finals 1957–2023).

## Pages

| Page | File | What it shows |
| --- | --- | --- |
| Country map (main page) | `index.html` | Pick a country to see who gives it more or fewer points than expected. Year-range slider and strongest-bonds slider. |
| Jury vs Televote | `jury-televote.html` | Finding 3.3: scatterplot of average jury points vs televote points per country (2016–2023), the biggest gaps, and a year-by-year chart for one country. |

The logo in the top bar always leads back to the country map.

## Adding a page

1. Copy `jury-televote.html` as a starting point (it already has the top bar and shared styles).
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
- **Strongest bonds** = the average of both directions, so both countries must favour each other.
- **Jury vs Televote** = average jury points and average televote points each country received per voting country in 2016–2023 finals. Gap = jury − televote.

## Run locally

Open the folder in VS Code and use **Open with Live Server** on `index.html`, or run `python3 -m http.server 8000` and open http://localhost:8000. Everything works offline except the web fonts, which fall back to system fonts.

Map geometry: Natural Earth via world-atlas (1:50m). Data: Spijkervet/eurovision-dataset.
