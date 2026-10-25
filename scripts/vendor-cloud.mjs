// Copy pinned browser distributions and apply the documented d3-cloud stability hooks.
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
await mkdir(new URL('../vendor/', import.meta.url), {recursive: true});
const files = [
  ['d3', '7.9.0', 'dist/d3.min.js', 'd3-7.9.0.min.js'],
  ['d3-cloud', '1.2.7', 'build/d3.layout.cloud.js', 'd3-cloud-1.2.7.js'],
];
for (const [name, version, source, target] of files) {
  const base = new URL(`../node_modules/${name}/`, import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', base)));
  if (pkg.version !== version) throw Error(`Expected ${name}@${version}, found ${pkg.version}`);
  if (name === 'd3-cloud') {
    let code = await readFile(new URL(source, base), 'utf8');
    // Keep upstream collision masks and spiral packing. Add optional identity
    // ordering/starting positions; defaults preserve the original API behavior.
    const patches = [
      ['      random = Math.random,', '      random = Math.random,\n      initialPosition = null,\n      sort = function(a, b) { return b.size - a.size; },'],
      ['}).sort(function(a, b) { return b.size - a.size; });', '}).sort(sort);'],
      ['        d.x = (size[0] * (random() + .5)) >> 1;\n        d.y = (size[1] * (random() + .5)) >> 1;', '        const startPosition = initialPosition && initialPosition(d, size);\n        d.x = startPosition ? startPosition[0] : (size[0] * (random() + .5)) >> 1;\n        d.y = startPosition ? startPosition[1] : (size[1] * (random() + .5)) >> 1;'],
      ['if (!bounds || collideRects(tag, bounds)) {', 'if (initialPosition || !bounds || collideRects(tag, bounds)) {'],
      ['  cloud.on = function() {', '  cloud.initialPosition = function(_) {\n    return arguments.length ? (initialPosition = _, cloud) : initialPosition;\n  };\n\n  cloud.sort = function(_) {\n    return arguments.length ? (sort = _, cloud) : sort;\n  };\n\n  cloud.on = function() {'],
    ];
    for (const [before, after] of patches) {
      if (code.split(before).length !== 2) throw Error(`d3-cloud patch no longer matches: ${before}`);
      code = code.replace(before, after);
    }
    await writeFile(new URL(`../vendor/${target}`, import.meta.url), '// Typist stability hooks: initialPosition/sort. Regenerate with npm run vendor:cloud.\n' + code);
  } else await copyFile(new URL(source, base), new URL(`../vendor/${target}`, import.meta.url));
  await copyFile(new URL('LICENSE', base), new URL(`../vendor/${name}-LICENSE`, import.meta.url));
}
await copyFile(new URL('../node_modules/d3-cloud/node_modules/d3-dispatch/LICENSE', import.meta.url), new URL('../vendor/d3-cloud-dispatch-LICENSE', import.meta.url));
// Include licenses for D3's bundled transitive modules, including their authors.
const visited = new Set(); const notices = [];
async function licenseTree(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const base = new URL(`../node_modules/${name}/`, import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', base)));
  const license = await readFile(new URL('LICENSE', base), 'utf8');
  notices.push(`${name}@${pkg.version}\n${license}`);
  for (const dependency of Object.keys(pkg.dependencies || {})) await licenseTree(dependency);
}
await licenseTree('d3');
await writeFile(new URL('../vendor/d3-THIRD-PARTY-LICENSES.txt', import.meta.url), notices.join('\n\n'));
