// Test harnesses. `createTypingPage` builds a JSDOM document and hands it to the
// app module explicitly, so the modules under test never depend on ambient
// globals. `createLegacyPage` keeps evaluating the classic scripts that the
// reaction and Dvorak pages still use.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { initTypingApp } from "../../src/main.js";

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

export async function createLegacyPage(htmlFile, scripts, { storage = {}, beforeScripts } = {}) {
  const dom = await createDom(htmlFile, storage);
  const { window } = dom;
  beforeScripts?.(window);
  const chartInstances = [];
  window.Chart = createChartStub(chartInstances);
  window.__chartInstances = chartInstances;
  for (const script of scripts) {
    window.eval(await readFile(resolve(root, script), "utf8"));
  }
  return dom;
}

export function dispatchKey(window, key) {
  window.dispatchEvent(
    new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );
}
