// Use the full before-cooldown probability, with a readable floor and an upper
// bound. Squared font size grows with probability until the 50% display cap;
// this avoids making visual area grow quadratically with selection likelihood.
export function cloudFontSize(probability, maximum = 58) {
  const share = Number.isFinite(probability) ? Math.max(0, Math.min(1, probability / .5)) : 0;
  return Math.sqrt(13 ** 2 + (maximum ** 2 - 13 ** 2) * share);
}
