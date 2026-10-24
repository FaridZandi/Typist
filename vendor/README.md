# Stream word-cloud libraries

These are unmodified, locally served browser distributions:

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
code. Commit regenerated assets with dependency changes. Stream imports these
local files directly; serving the repository needs neither node_modules nor
network access to a CDN. No practice words leave the browser.

The choice follows review of d3-cloud's layout API, D3's update/transition APIs,
and ECharts wordcloud's renderer. The latter clears/recreates its word objects
on each render, whereas D3 can preserve word identity and animate rank changes.
Library documentation: https://d3js.org/d3-transition and
https://github.com/jasondavies/d3-cloud#api-reference.
