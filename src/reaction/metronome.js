// An optional visual beat on the target display. Pressing within a pulse
// extends a streak, which is shown next to the target and reset by a miss.

export function createMetronome({ window, element, getIntervalMs, getPulseDurationMs }) {
  let timerId = null;
  let pulseClearTimerId = null;
  let lastPulseAt = 0;
  let streak = 0;

  function pulse() {
    window.clearTimeout(pulseClearTimerId);
    lastPulseAt = performance.now();
    element.classList.remove("metronome-pulse", "metronome-reward-pulse");
    // Reading layout restarts the CSS animation on a rapid re-pulse.
    void element.offsetWidth;
    element.classList.add("metronome-pulse");
    pulseClearTimerId = window.setTimeout(() => {
      element.classList.remove("metronome-pulse");
    }, getPulseDurationMs());
  }

  return {
    restart() {
      window.clearInterval(timerId);
      window.clearTimeout(pulseClearTimerId);
      timerId = null;
      pulseClearTimerId = null;
      lastPulseAt = 0;
      streak = 0;
      delete element.dataset.beatStreak;
      element.classList.remove("metronome-pulse", "metronome-reward-pulse");

      const interval = getIntervalMs();
      if (!Number.isFinite(interval) || interval <= 0) return;

      pulse();
      timerId = window.setInterval(pulse, interval);
    },

    markForReward(pressedAt) {
      const sincePulse = pressedAt - lastPulseAt;
      if (sincePulse >= 0 && sincePulse <= getPulseDurationMs()) {
        streak += 1;
        element.dataset.beatStreak = `x${streak}`;
        element.classList.add("metronome-reward-pulse");
        return;
      }
      streak = 0;
    },

    resetStreak() {
      streak = 0;
    },
  };
}
