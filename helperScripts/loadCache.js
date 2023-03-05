import { readFileSync } from "fs"
import process from "process"

try {
	const cacheMap = JSON.parse(
		readFileSync("./cachedSites/cacheInfo.json", "utf-8")
	)

	// Check if command-line arguments were provided
	if (process.argv.length > 2) {
		const targetUrl = process.argv[2]

		// Look up the ID associated with the target URL
		const keys = Object.keys(cacheMap).filter((url) =>
			url.includes(targetUrl)
		)
		if (keys) {
			for (const key of keys) {
				const targetId = cacheMap[key]
				console.log(`ID for ${key}: ${targetId} ./cachedSites/${targetId}`)
			}
		} else {
			console.error(`No ID found for ${targetUrl}`)
		}
	} else {
		// Display a menu of URLs if no arguments were provided
		console.log("Available URLs:")
		Object.keys(cacheMap).forEach((url) => console.log(`- ${url}`))
	}
} catch (err) {
	console.error("Error reading cache file:", err.message)
}
