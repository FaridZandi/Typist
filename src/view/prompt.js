// The prompt is the typing surface. It renders the active word, the caret,
// corrections, omissions, substitutions, and extra characters, and after a run
// it doubles as the annotated passage.

function appendCaret(parent, document) {
  const caret = document.createElement("span");
  caret.className = "typing-caret";
  caret.setAttribute("aria-hidden", "true");
  parent.append(caret);
}

export function renderPrompt({ elements, document, words, run, annotations = [], activeAnnotationId = null }) {
  const { finished, currentWordIndex, currentWordBuffer, currentWordMistakeOffsets, committedWords } = run;
  elements.textDisplay.replaceChildren();

  words.forEach((word, wordIndex) => {
    const wordElement = document.createElement("span");
    wordElement.className = "prompt-word";

    const wordAnnotations = finished ? annotations.filter((annotation) => annotation.wordIndex === wordIndex) : [];
    if (wordAnnotations.length) {
      wordElement.classList.add("run-annotation");
      wordElement.title = wordAnnotations.map((annotation) => annotation.message).join(" · ");
      if (wordAnnotations.some((annotation) => annotation.id === activeAnnotationId)) wordElement.classList.add("run-annotation-active");
    }
    if (wordIndex === currentWordIndex && !finished) wordElement.classList.add("active-word");

    const committed = committedWords[wordIndex];
    const isActive = wordIndex === currentWordIndex && !committed && !finished;
    const visibleBuffer = isActive ? [...currentWordBuffer] : committed?.typedCharacters || [];
    const mistakeOffsets = isActive ? currentWordMistakeOffsets : new Set(committed?.mistakeOffsets || []);

    if (isActive && visibleBuffer.length === 0) appendCaret(wordElement, document);

    [...word.text].forEach((character, offset) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = character;
      const typedCharacter = visibleBuffer[offset];
      if (typedCharacter !== undefined) {
        span.classList.add(typedCharacter === character ? "correct" : "incorrect");
        if (typedCharacter === character && mistakeOffsets.has(offset)) span.classList.add("corrected");
      } else if (committed) {
        span.classList.add("incorrect");
      }
      span.dataset.promptIndex = String(word.start + offset);
      wordElement.append(span);
      if (isActive && offset === visibleBuffer.length - 1) appendCaret(wordElement, document);
    });

    if (isActive || committed) {
      visibleBuffer.slice(word.text.length).forEach((character, extraIndex) => {
        const extra = document.createElement("span");
        extra.className = "extra-char";
        extra.textContent = character;
        extra.title = "Extra character: counted as an error, with no prompt position";
        wordElement.append(extra);
        if (isActive && extraIndex === visibleBuffer.length - word.text.length - 1) appendCaret(wordElement, document);
      });
    }
    elements.textDisplay.append(wordElement);

    if (wordIndex < words.length - 1) {
      const separator = document.createElement("span");
      separator.className = "char prompt-space";
      separator.textContent = " ";
      separator.setAttribute("aria-hidden", "true");
      if (committed && committed.separatorCommitted) separator.classList.add("correct");
      elements.textDisplay.append(separator);
    }
  });

  elements.resultPassage.hidden = !finished;
  elements.resultTextDisplay.replaceChildren(...[...elements.textDisplay.childNodes].map((node) => node.cloneNode(true)));
}
