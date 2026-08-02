// Damerau-Levenshtein alignment between the prompt word and what was typed.
// The traceback classifies each edit so a committed word can report *what kind*
// of error remained, not just how many characters were wrong.

const punctuationPattern = /[^\p{L}\p{N}\s]/u;

export function analyzeWordAlignment(expected, typed) {
  const source = [...expected];
  const target = [...typed];
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  const moves = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(null));
  for (let row = 1; row <= source.length; row += 1) { matrix[row][0] = row; moves[row][0] = "omission"; }
  for (let column = 1; column <= target.length; column += 1) { matrix[0][column] = column; moves[0][column] = "insertion"; }
  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const candidates = [
        { cost: matrix[row - 1][column - 1] + (source[row - 1] === target[column - 1] ? 0 : 1), move: source[row - 1] === target[column - 1] ? "match" : "substitution" },
        { cost: matrix[row - 1][column] + 1, move: "omission" },
        { cost: matrix[row][column - 1] + 1, move: "insertion" },
      ];
      if (row > 1 && column > 1 && source[row - 1] === target[column - 2] && source[row - 2] === target[column - 1]) {
        candidates.push({ cost: matrix[row - 2][column - 2] + 1, move: "transposition" });
      }
      const best = candidates.reduce((left, right) => right.cost < left.cost ? right : left);
      matrix[row][column] = best.cost;
      moves[row][column] = best.move;
    }
  }

  const categories = { substitution: 0, omission: 0, insertion: 0, transposition: 0, duplication: 0, capitalization: 0, punctuation: 0 };
  let row = source.length;
  let column = target.length;
  while (row || column) {
    const move = moves[row][column];
    if (move === "match") { row -= 1; column -= 1; continue; }
    if (move === "substitution") {
      const expectedCharacter = source[row - 1];
      const enteredCharacter = target[column - 1];
      if (expectedCharacter.toLowerCase() === enteredCharacter.toLowerCase() && expectedCharacter !== enteredCharacter) categories.capitalization += 1;
      else if (punctuationPattern.test(expectedCharacter) || punctuationPattern.test(enteredCharacter)) categories.punctuation += 1;
      else categories.substitution += 1;
      row -= 1; column -= 1;
    } else if (move === "omission") { categories.omission += 1; row -= 1; }
    else if (move === "insertion") {
      categories.insertion += 1;
      if (column > 1 && target[column - 1] === target[column - 2]) categories.duplication += 1;
      column -= 1;
    } else if (move === "transposition") { categories.transposition += 1; row -= 2; column -= 2; }
    else break;
  }

  const incorrectExpected = categories.substitution + categories.omission + categories.capitalization + categories.punctuation + (categories.transposition * 2);
  return { expected, typed, categories, finalCorrect: Math.max(0, source.length - incorrectExpected) };
}
