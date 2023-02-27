/** Clears the last terminal line */
export function clearLastLine() {
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
}
