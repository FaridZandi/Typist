// Test harnesses. Each one builds a JSDOM document and hands it to the app
// module explicitly, so the modules under test never depend on ambient globals.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { initTypingApp } from "../../src/main.js";
import { initReactionApp } from "../../src/reaction/main.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function createChartStub(instances) {
  return class ChartStub {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.data = config.data;
      this.options = config.options;
      instances.push(this);
    }

    update() {}

    destroy() {}

    resize() {}
  };
}

async function createDom(htmlFile, storage) {
  const html = await readFile(resolve(root, htmlFile), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://typist.test/" });
  for (const [key, value] of Object.entries(storage)) {
    dom.window.localStorage.setItem(key, JSON.stringify(value));
  }
  return dom;
}

export async function createTypingPage({ storage = {}, catalog, beforeInit } = {}) {
  const dom = await createDom("index.html", storage);
  const { window } = dom;
  const chartInstances = [];
  window.Chart = createChartStub(chartInstances);
  beforeInit?.(window);
  const app = initTypingApp({ document: window.document, window, ...(catalog ? { catalog } : {}) });
  return { dom, window, document: window.document, app, chartInstances };
}

export async function createReactionPage({ storage = {}, beforeInit } = {}) {
  const dom = await createDom("reaction.html", storage);
  const { window } = dom;
  const chartInstances = [];
  window.Chart = createChartStub(chartInstances);
  beforeInit?.(window);
  const app = initReactionApp({ document: window.document, window });
  return { dom, window, document: window.document, app, chartInstances };
}

export async function createDvorakPage() {
  const dom = await createDom("dvorak.html", {});
  return { dom, window: dom.window, document: dom.window.document };
}

export function dispatchKey(window, key) {
  window.dispatchEvent(
    new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );
}
