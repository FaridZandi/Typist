// Keep a short stretch of completed words on the same moving track. Space
// advances across its separator instead of replacing the track at offset zero.
export class StreamRenderer {
  constructor(track) {
    this.track = track;
    this.previous = [];
    this.removedCharacters = 0;
  }

  commit(word, typed) {
    this.previous.push({word, typed});
    if (this.previous.length > 4) {
      const removed = this.previous.shift();
      this.removedCharacters += Math.max(removed.word.length, removed.typed.length) + 1;
    }
  }

  reset() {
    this.previous = [];
    this.removedCharacters = 0;
    this.track.style.transition = 'none';
    this.track.style.transform = 'translateX(0px)';
    void this.track.offsetWidth;
    this.track.style.transition = '';
  }

  render(word, typed, upcoming) {
    const document = this.track.ownerDocument;
    const view = document.defaultView;
    const currentX = this.removedCharacters
      ? new view.DOMMatrixReadOnly(view.getComputedStyle(this.track).transform).m41 : 0;
    const content = document.createDocumentFragment();
    const appendWord = (expected, entered) => {
      [...expected].forEach((character, index) => {
        const span = document.createElement('span');
        span.className = `stream-char${entered[index] ? entered[index] === character ? ' correct' : ' error' : ''}`;
        span.textContent = character;
        content.append(span);
      });
      if (entered.length > expected.length) {
        const extra = document.createElement('span');
        extra.className = 'stream-char error';
        extra.textContent = entered.slice(expected.length);
        content.append(extra);
      }
    };
    let prefixLength = 0;
    for (const previous of this.previous) {
      appendWord(previous.word, previous.typed);
      content.append(document.createTextNode(' '));
      prefixLength += Math.max(previous.word.length, previous.typed.length) + 1;
    }
    appendWord(word, typed);
    for (const prompt of upcoming) {
      content.append(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'stream-next stream-upcoming-word';
      span.textContent = prompt.word;
      content.append(span);
    }
    this.track.replaceChildren(content);
    if (this.removedCharacters) {
      // Removing old text changes the local origin. Rebase the *currently
      // displayed* position, including any unfinished animation, before moving
      // toward the new target. This is visually identical on both sides.
      const measure = document.createElement('span');
      measure.textContent = '0';
      this.track.append(measure);
      const characterWidth = measure.getBoundingClientRect().width;
      measure.remove();
      this.track.style.transition = 'none';
      this.track.style.transform = `translateX(${currentX + this.removedCharacters * characterWidth}px)`;
      void this.track.offsetWidth;
      this.track.style.transition = '';
      this.removedCharacters = 0;
    }
    this.track.style.transform = `translateX(-${prefixLength + typed.length}ch)`;
  }
}
