const correctEmojis = ["🎉", "✨", "🙌", "🌟"];
const incorrectEmojis = ["🤔", "🔍", "🧐", "💭"];

export function pickVerdictEmoji(correct: boolean) {
  const choices = correct ? correctEmojis : incorrectEmojis;
  return choices[Math.floor(Math.random() * choices.length)];
}
