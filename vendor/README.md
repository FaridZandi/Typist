# Stream word-cloud libraries

These locally served browser distributions have pinned sources:

- [D3 7.9.0](https://github.com/d3/d3/tree/v7.9.0), `dist/d3.min.js` — keyed
  SVG joins, transitions, interpolation and easing (ISC).
- [d3-cloud 1.2.7](https://github.com/jasondavies/d3-cloud),
  `build/d3.layout.cloud.js` — asynchronous canvas-sprite collision layout
  (BSD-3-Clause), including its bundled d3-dispatch 1.x dependency.

License files and D3's transitive dependency notices are kept beside the code.
Versions are pinned in package.json and package-lock.json. To reproduce:

```sh
npm ci
npm run vendor:cloud
```

The copy script checks both library versions; it does not compile application
code. D3 is copied unchanged. The d3-cloud copy has a small, reproducible patch:
optional `initialPosition(word, size)` and `sort(a, b)` accessors. With positions
supplied, words can remain at their homes without having to touch the previous
cloud's overall bounding rectangle. Upstream sprite collision checks, edge bounds,
spiral search and time slicing remain responsible for safe placement. Without
these accessors the upstream behavior remains the default. The script fails if
any exact patch location no longer matches the pinned source.

Typist uses a deterministic home and spiral seed per word, and reuses settled
anchors in stable placement order. It no longer assigns positions by changing
rank or recenters the whole cloud after each layout. A bounded, tab-scoped
`sessionStorage` cache (`typist-stream-cloud-layout-v1`, up to three viewport
layouts with 48 words each) restores anchors across reloads and viewport returns.
This optional visual state contains word names and coordinates only; it is
excluded from practice backups. Corrupt/denied storage falls back to deterministic
homes and in-memory anchors; it never blocks typing. Resizing words can still
require local collision adjustments, and new viewport sizes get their own layout.
 Commit regenerated assets with dependency changes. Stream imports these
local files directly; serving the repository needs neither node_modules nor
network access to a CDN. No practice words leave the browser.

The choice follows review of d3-cloud's layout API, D3's update/transition APIs,
and ECharts wordcloud's renderer. The latter clears/recreates its word objects
on each render, whereas D3 can preserve word identity and animate rank changes.
Library documentation: https://d3js.org/d3-transition and
https://github.com/jasondavies/d3-cloud#api-reference.
