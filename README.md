# Eurovision favoritism

Website for our Data Visualization project (Aarhus University, fall 2026) on voting in the Eurovision finals, 1957–2023.

The question behind every page is the same: which countries give each other more points than the songs alone would explain?

**Live site:** https://mikkelflassen.github.io/DataViz/ (GitHub Pages, built from `main`). Add a country code to open the map on it, e.g. `#se` for Sweden.

## Pages

| Page | File | What it shows |
| --- | --- | --- |
| Country map | `index.html` | Pick a country and see who gives it more or fewer points than expected, or who it favours. Beside the map, the strongest mutual pairs as paired bars. |
| Voting blocs | `voting-blocs.html` | All countries at once, in a matrix sorted by clustering, next to a map of the groups that come out. |
| Jury vs televote | `jury-televote.html` | Finding 3.3. Average jury points against average televote points per country for 2016–2023, and one country year by year. |
| Bias over time | `bias-over-time.html` | Finding 3.4. Favoritism in points per year for the real votes and for random votes under the same points: both jump when the points per country rise in 1975 and 2016. Below, how closely jury and televote follow the 2004–2015 voting friendships. |

The logo in the top bar leads back to the country map.

## Run it

The pages load their data with `fetch`, so they have to come from a web server. Opening `index.html` by double-clicking will show an error message.

In VS Code, right-click `index.html` and choose **Open with Live Server**. Without VS Code:

```
python3 -m http.server 8000
```

and open http://localhost:8000. Everything works offline except the web fonts, which fall back to system fonts.

There is no build step and nothing to install. D3 and topojson-client are checked in under `js/vendor/`.

## Working together

`main` is what the live site shows. Every push to `main` updates https://mikkelflassen.github.io/DataViz/ within a minute or two, so nobody pushes to `main` directly. Changes go in through a branch and a pull request.

### One-time setup

1. Accept the collaborator invite for this repo (it arrives by email from GitHub).
2. In VS Code, install the **Codex** extension (by OpenAI) and sign in with your ChatGPT account. Install **Live Server** as well.
3. Clone the repo: **Source Control → Clone Repository** and paste `https://github.com/Mikkelflassen/DataViz.git`, or in a terminal:

   ```
   git clone https://github.com/Mikkelflassen/DataViz.git
   ```

4. The first time you push, VS Code asks you to sign in to GitHub. Use the account that was invited.

### Making a change

1. **Get the latest version.** Switch to `main` and pull:

   ```
   git checkout main
   git pull
   ```

2. **Make a branch** named after you and the change:

   ```
   git checkout -b anna/legend-size
   ```

3. **Ask Codex** for the change in its side panel, e.g. "On the voting blocs page, make the legend text larger." Read what it proposes before accepting.
4. **Check it** with Live Server. Click through the page you changed and at least one other page.
5. **Commit and push** from Source Control (or `git add -A`, `git commit -m "Larger legend on voting blocs page"`, `git push -u origin anna/legend-size`).

### Merging a change into main

1. On GitHub, open the repo. A yellow bar offers **Compare & pull request** for the branch you just pushed. Click it, or go to **Pull requests → New pull request** and pick `main` ← your branch.
2. Write one or two lines on what changed and which page to look at, then **Create pull request**.
3. Someone else in the group opens the branch locally (`git fetch`, `git checkout anna/legend-size`) and checks it in Live Server, or at least reads the diff under **Files changed**.
4. When it looks right, click **Merge pull request → Confirm merge**, then **Delete branch**.
5. Everyone runs `git checkout main` and `git pull` before starting the next change.

If GitHub says the branch **has conflicts**, two people changed the same lines. Pull `main` into your branch (`git checkout anna/legend-size`, `git pull origin main`), let Codex or VS Code help resolve the marked lines, check the page again, commit and push. The pull request updates by itself.

To keep conflicts rare, agree who works on which page. Each page has its own `js/pages/<page>.js` and `css/<page>.css`, so two people on two different pages never collide. Shared files (`css/site.css`, `js/shared/`) are worth a heads-up in the group chat before changing them.

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

reads `data/raw/votes.csv` and rewrites `votes-finals.csv`, `jury-televote.csv`, `bias-over-time.json` and `jury-televote-patterns.json`. It only uses Python's standard library. `countries.json`, `europe.topo.json` and `voting-systems.json` are edited by hand.

## How the numbers work

Favoritism is the points a country gave minus the average the receiver got from all voters that year. It is then averaged over the finals both countries were in. The 2023 "rest of world" televote is left out, a country's own row (always 0) is dropped, and there was no contest in 2020.

A pair needs enough shared finals before its average is shown: at least 5 for ranges of 20 years or more, 3 for 8 to 19 years and 1 for shorter ranges.

The map's colour scale is a symmetric log scale from −14 to +14 with constant 1. It is linear near 0 and logarithmic further out, because half of all pairs are within ±1 point while a few reach +13. Red and blue of the same strength mean the same number of points.

The strongest pairs are the pairs with the highest average of the two directions. They are shown beside the map as a paired bar chart: one row per pair, each country's bar growing from the middle toward its own name, all on one scale from zero. Hovering a row outlines the two countries on the map and dims the rest; hovering a country on the map picks out its rows.

On the blocs page, the similarity between two countries is the mean of their favoritism in both directions. Countries are clustered bottom-up with average linkage, and the leaf order of that tree sorts the matrix. A branch of the tree is a bloc when its members favour each other by at least the slider value on average (default +2.5 points). Members whose own tie to the rest of the bloc is below that value are then removed, weakest first. Everyone else is in no bloc. At most eight blocs are shown, ranked by what a member gets from the rest of its bloc in one final. A country is left out of a period altogether if it lacks a two-way value with at least half of the others. Bloc names come from the `region` field in `countries.json`.

On the jury page, the values are the average jury and televote points a country received per voting country in 2016–2023 finals, rest-of-world televote included. The gap is jury minus televote. A country gets a bold name when its gap is more than 1.25 standard deviations from the mean gap of the selected years. Other dots get a grey name when they are at least 24 px from the diagonal, have no other dot within 30 px, and the name fits right beside the dot. Every name has to stay 7 to 10 px clear of all other dots, so it cannot be read as a neighbour's. A dot where that is impossible gets no name, outliers included.

On the bias page, the first chart is one line per year for the mean absolute favoritism in points (the gap between a country's vote and the average the song got from all voters), for the real votes and for random votes. Random votes: each country keeps the points it actually gave that year, but they are shuffled over the songs it could vote for, averaged over 50 shuffles with a fixed seed (`random_favoritism` in `scripts/build_data.py`). Random votes have no favorites by construction, yet they jump at the same moments as the real votes (1975: 10 → 58 points per country, 2016: 58 → 116) and rise more (×4.5 against ×3.55 from 1957–61 to 2016–23). The rise in points-based favoritism is therefore a property of the scoring system, not of the voters. The chart shows this with a reference line instead of a paragraph, the lines are labelled at their ends instead of with a legend, and the two lasting changes in the points system are marked on the time axis. Points are drawn as straight segments between contests, since there is one value per contest (discrete time, lecture 9). The tooltip gives each year's values and voting system, from `data/voting-systems.json`.

The second chart on the bias page is, per year since 2016, the correlation between every pair's jury (or televote) favoritism and the pair's mean favoritism in 2004–2015 (at least three meetings). The area between the two lines is shaded and labelled with the ratio of the two means.

## Design choices and where they come from

These are the decisions we expect to be asked about, with the lecture or paper each one rests on.

The pages follow Shneiderman's "overview first, zoom and filter, then details on demand" (lecture 4). The map and the matrix are the overviews, the year slider and country picker filter, and exact values sit in tooltips and "?" boxes so the charts stay light on text.

The same red/blue scale is used on the map, in the side lists and in the blocs matrix, and the jury/televote colours are the same on both pages that use them. That is the rule of consistency for multiple views (Baldonado et al. 2000, lecture 4). On the blocs page the matrix, the map and the list are linked: hovering a group in one fades everything else in the other two (brushing and linking, same lecture).

The blocs page uses a matrix because the graph is dense: almost every country has a value for almost every other. Lecture 11 gives that as the first reason to prefer a matrix over a node-link diagram. The rows and columns are ordered by the clustering so that groups form blocks on the diagonal, which is the idea behind ordering a matrix towards Robinson form (Wu et al. 2008, lecture 11). How strong a bloc has to be is a slider because clustering has no single right answer; letting the reader steer the algorithm is the visual analytics idea from lecture 13. Countries that fit no bloc are left grey instead of being forced into the nearest one, so the picture does not claim more structure than the data has (lecture 5: the visualization should show the data and only the data).

The strongest pairs are not drawn on the map. We tried arrows and then tapered wedges: they crossed each other in the Balkans, competed with the map colours, and their width was hard to compare. Mackinlay's ranking of visual channels (1986, lecture 9) puts position and length well above width or area for quantities, so each pair is now a row of two bars on a shared zero baseline. The map and the chart are linked by hover in both directions (brushing and linking, lecture 4), so the geography is still one move away.

The scatterplot answers lecture 3's checklist like this. Both axes share one scale and the plot is square, so the diagonal is at 45° and distance from it is the gap. Grid lines are faint. The reference line is jury = televote; we left out a trend line because the diagonal is the comparison that matters here. Dots are large enough to click, and only dots that can carry a name without clutter get one.

The line charts mark rule changes with vertical lines and keep the y-axis starting at 0. Chart 1 has the strip of voting systems directly under it, on the same time axis, so a jump in the line can be read against the rule change that caused it. Time is mapped to position on a linear axis throughout (lecture 9).

Comparing with random votes on the bias page is our answer to "do not visualize to deceive" (ethical design, lecture 5): the raw numbers are correct, but on their own they suggest a growth in favoritism that the scoring system produces by itself. An earlier version divided each year by the standard deviation of its points instead. We dropped it because random voting scores highest on that measure and its baseline differs between voting systems, so equal values did not mean equal favoritism. Hatching for pairs with too few shared finals is explicit encoding of missing data (lecture 6) instead of silently colouring them as 0.

## Limits

Favoritism here is a description of voting patterns. It does not show why countries vote as they do: shared language, diaspora and similar music taste all produce the same pattern.

The clustering is one reasonable method among several, and bloc borders move when the years or the strength bar change. Blocs that hold together across settings deserve more trust than ones that appear at a single setting. The eight bloc colours cannot all be told apart by colour-blind readers, which is why each bloc also has a letter on the map and in the matrix.

## Sources

Data: Spijkervet, eurovision-dataset (GitHub/Zenodo). Map geometry: Natural Earth 1:50m via world-atlas. Voting rules by year: the EBU's published rules as summarised on Eurovisionworld and Wikipedia ("Voting at the Eurovision Song Contest").
