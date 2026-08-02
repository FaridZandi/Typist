// The Dvorak schematic, shared by the standalone page and the reaction-test
// heatmaps. Elements are created from the container's own document so the
// renderer works in any window without reaching for a global.

const dvorakKeyboardRows = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "[", "]"],
  ["'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/", "=", "\\"],
  ["a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-"],
  [";", "q", "j", "k", "x", "b", "m", "w", "v", "z"],
];

const rowClasses = ["number-row", "top-letter-row", "home-row", "lower-row"];

export function getDvorakKeyboardKeys() {
  return dvorakKeyboardRows.flat();
}

export function formatKeyboardKeyLabel(key) {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}

export function renderDvorakKeyboard(container, options = {}) {
  const { datasetName = "key" } = options;
  const document = container.ownerDocument;

  container.replaceChildren();

  dvorakKeyboardRows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = `keyboard-row ${rowClasses[rowIndex]}`;

    row.forEach((key) => {
      const keyElement = document.createElement("div");
      keyElement.className = "key";
      keyElement.dataset[datasetName] = key;
      keyElement.textContent = formatKeyboardKeyLabel(key);
      rowElement.append(keyElement);
    });

    container.append(rowElement);
  });
}
