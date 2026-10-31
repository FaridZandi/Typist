// Compare full selection probability with the same word's exploration baseline.
// The squared ratio exaggerates concentration while the bounded response avoids
// giant outliers. Equal-to-baseline words are 28px (22px compact); tails can shrink
// toward 9px instead of getting visually stuck against the old 13px floor.
export function cloudFontSize(probability, baselineProbability, compact = false, peakProbability = probability) {
  const minimum = 9, neutral = compact ? 22 : 28, maximum = compact ? 64 : 84;
  const ratio = Number.isFinite(probability) && Number.isFinite(baselineProbability) && baselineProbability > 0
    ? Math.max(0, probability / baselineProbability) : 0;
  if (!Number.isFinite(ratio)) return maximum;
  const calibration = (maximum - neutral) / (neutral - minimum);
  const contrastSize = minimum + (maximum - minimum) / (1 + calibration / ratio ** 2);
  if (ratio <= 1) return contrastSize;
  // Separate the high-probability words even when their bounded P/B responses
  // all approach the cap. Blend only the excess above neutral; low-probability
  // tail sizes and the smooth transition away from pure exploration stay intact.
  const peakRatio = Number.isFinite(peakProbability) && peakProbability > 0
    ? Math.max(ratio, peakProbability / baselineProbability) : ratio;
  const prominence = ((ratio - 1) / (peakRatio - 1)) ** .6;
  return neutral + (contrastSize - neutral) * prominence;
}
