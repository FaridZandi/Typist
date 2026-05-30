const dvorakKeyboardRows = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "[", "]"],
  ["'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/", "=", "\\"],
  ["a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-"],
  [";", "q", "j", "k", "x", "b", "m", "w", "v", "z"],
];

function getDvorakKeyboardKeys() {
  return dvorakKeyboardRows.flat();
}

function formatKeyboardKeyLabel(key) {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}

function getDvorakRowClass(rowIndex) {
  return ["number-row", "top-letter-row", "home-row", "lower-row"][rowIndex];
}

function renderDvorakKeyboard(container, options = {}) {
  const { datasetName = "key" } = options;

  container.replaceChildren();

  dvorakKeyboardRows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = `keyboard-row ${getDvorakRowClass(rowIndex)}`;

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
