// Copy unmodified, pinned browser distributions; no application build step.
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
  await copyFile(new URL(source, base), new URL(`../vendor/${target}`, import.meta.url));
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
