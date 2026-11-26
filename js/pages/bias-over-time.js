// Favoritism over time: extra points to countries in the same region, by who voted.
// The chart itself is in bias-regions.js; the data comes from scripts/build_data.py.
/* global d3 */

import { startPage } from '../shared/page.js';
import { createTooltip } from '../shared/tooltip.js';
import { renderRegions } from './bias-regions.js';

startPage(async () => {
  await renderRegions(createTooltip());
});
