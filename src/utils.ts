/** Clears the last terminal line */
export function clearLastLine() {
	process.stdout.moveCursor(0, -1)
	process.stdout.clearLine(1)
}

/** Remove whitespaces and invisible characters */
export function cleanText(text: string): any {
	return text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
}

export function basePrefix(base: string, link: string): string {
	return link.startsWith("http://") ? link : new URL(link, base).href
}
