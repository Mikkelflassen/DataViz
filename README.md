# Eurovision favoritism map

Interactive map of Europe for our Data Visualization project. Pick a country to see who gives it more or fewer points than expected, and use the slider to draw the strongest two-way bonds between countries.

**Open it:** `index.html` in any browser, or via GitHub Pages once it is enabled (Settings → Pages → Deploy from branch → `main` / root).

## How the score works

Favoritism = points given − the receiver's average points from all voters that year, averaged over the years both countries were in the final.

- Data: `votes.csv`, finals only, 1957–2023 (no contest in 2020). The "rest of world" televote is excluded.
- Pick any year range with the two-handle slider. Ranges of 20+ years need at least 5 shared finals per pair, 8–19 years at least 3, shorter ranges at least 1.
- Strongest bonds = the average of both directions, so both countries must favour each other.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

The page is self-contained: data, D3 v7.9.0 and topojson-client v3.1.0 are inlined, so it also works offline. Map geometry is Natural Earth via world-atlas (1:50m).
