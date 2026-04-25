const promptText = [
  "Typing well is built from steady rhythm, careful attention, and relaxed hands.",
  "Focus on one word at a time. Let mistakes show you where to slow down, then keep moving with calm precision.",
  "A clear mind and consistent pace matter more than rushing through every sentence.",
  "Good practice feels deliberate. Keep your shoulders loose, return your eyes to the next letter, and trust the pattern under your fingers.",
  "When you miss a character, notice it quickly and continue. The goal is not perfection in every moment, but cleaner habits over the full minute.",
  "Short sessions make progress easier to see. Breathe, keep a steady rhythm, and finish the line in front of you.",
].join(" ");

const runLengthSeconds = 60;

const textDisplay = document.querySelector("#textDisplay");
const typingInput = document.querySelector("#typingInput");
const restartButton = document.querySelector("#restartButton");
const timeRemaining = document.querySelector("#timeRemaining");
const speedValue = document.querySelector("#speedValue");
const accuracyValue = document.querySelector("#accuracyValue");
const resultPanel = document.querySelector("#resultPanel");
const finalSpeed = document.querySelector("#finalSpeed");
const finalAccuracy = document.querySelector("#finalAccuracy");

let started = false;
let finished = false;
let timerId = null;
let secondsLeft = runLengthSeconds;

function renderPrompt(typedText = "") {
  textDisplay.replaceChildren();

  [...promptText].forEach((char, index) => {
    const span = document.createElement("span");
    span.textContent = char;
    span.className = "char";

    if (index < typedText.length) {
      span.classList.add(typedText[index] === char ? "correct" : "incorrect");
    } else if (index === typedText.length && !finished) {
      span.classList.add("current");
    }

    textDisplay.append(span);
  });
}

function getMetrics() {
  const typedText = typingInput.value;
  const attemptedCharacters = typedText.length;
  const correctCharacters = [...typedText].filter(
    (char, index) => char === promptText[index],
  ).length;
  const minutesElapsed = Math.max(
    (runLengthSeconds - secondsLeft) / 60,
    1 / 60,
  );
  const wordsPerMinute = Math.round(correctCharacters / 5 / minutesElapsed);
  const accuracy =
    attemptedCharacters === 0
      ? 100
      : Math.round((correctCharacters / attemptedCharacters) * 100);

  return { wordsPerMinute, accuracy };
}

function updateStats() {
  const { wordsPerMinute, accuracy } = getMetrics();
  speedValue.textContent = wordsPerMinute;
  accuracyValue.textContent = accuracy;
}

function finishRun() {
  finished = true;
  clearInterval(timerId);
  timerId = null;
  typingInput.disabled = true;
  renderPrompt(typingInput.value);
  updateStats();

  const { wordsPerMinute, accuracy } = getMetrics();
  finalSpeed.textContent = wordsPerMinute;
  finalAccuracy.textContent = accuracy;
  resultPanel.hidden = false;
}

function startTimer() {
  if (started) return;

  started = true;
  timerId = setInterval(() => {
    secondsLeft -= 1;
    timeRemaining.textContent = secondsLeft;
    updateStats();

    if (secondsLeft <= 0) {
      finishRun();
    }
  }, 1000);
}

function resetRun() {
  started = false;
  finished = false;
  secondsLeft = runLengthSeconds;
  clearInterval(timerId);
  timerId = null;

  typingInput.value = "";
  typingInput.disabled = false;
  timeRemaining.textContent = runLengthSeconds;
  speedValue.textContent = "0";
  accuracyValue.textContent = "100";
  resultPanel.hidden = true;
  renderPrompt();
  typingInput.focus();
}

typingInput.addEventListener("input", () => {
  startTimer();

  if (typingInput.value.length > promptText.length) {
    typingInput.value = typingInput.value.slice(0, promptText.length);
  }

  renderPrompt(typingInput.value);
  updateStats();

  if (typingInput.value.length === promptText.length) {
    finishRun();
  }
});

restartButton.addEventListener("click", resetRun);

resetRun();
