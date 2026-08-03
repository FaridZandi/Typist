// Which finger presses which key, and what kind of movement a pair of keys
// requires. This exists so a slow bigram can be compared against movements of
// the *same physical class* — same-finger hops are slower for everyone, and
// judging them against a typist's all-bigram average would invent a weakness
// that is really just anatomy.
//
// The map describes the Dvorak layout the rest of the app is built around.

const FINGER_ROWS = [
  // top row
  ["Lp", "Lr", "Lm", "Li", "Li", "Ri", "Ri", "Rm", "Rr", "Rp", "Rp"],
  // home row
  ["Lp", "Lr", "Lm", "Li", "Li", "Ri", "Ri", "Rm", "Rr", "Rp", "Rp"],
  // bottom row
  ["Lp", "Lr", "Lm", "Li", "Li", "Ri", "Ri", "Rm", "Rr", "Rp"],
];

const KEY_ROWS = [
  ["'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/"],
  ["a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-"],
  [";", "q", "j", "k", "x", "b", "m", "w", "v", "z"],
];

const keyInfo = new Map();
KEY_ROWS.forEach((row, rowIndex) => {
  row.forEach((key, column) => {
    const finger = FINGER_ROWS[rowIndex][column];
    keyInfo.set(key, { key, row: rowIndex, column, finger, hand: finger[0] });
  });
});

export function getKeyInfo(character) {
  if (typeof character !== "string" || character.length !== 1) return null;
  return keyInfo.get(character.toLowerCase()) ?? null;
}

export function getKeyPosition(character) {
  const info = getKeyInfo(character);
  return info ? { row: info.row, column: info.column } : null;
}

// Motor classes, ordered roughly by how demanding the movement is. Anything
// off the mapped layout (digits, punctuation we do not place) is "unmapped" and
// never used as a baseline.
export function getMotorClass(first, second) {
  const a = getKeyInfo(first);
  const b = getKeyInfo(second);
  if (!a || !b) return "unmapped";
  if (a.finger === b.finger) return a.key === b.key ? "same-key" : "same-finger";
  if (a.hand !== b.hand) return "alternating";
  return a.row === b.row ? "same-hand-row" : "same-hand-reach";
}

export const MOTOR_CLASS_LABELS = {
  "same-key": "same key twice",
  "same-finger": "same finger",
  "same-hand-row": "same hand, one row",
  "same-hand-reach": "same hand, row change",
  alternating: "hands alternating",
  unmapped: "unmapped keys",
};
