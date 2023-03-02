import { randomUUID } from "crypto"
import convertBody from "fetch-charset-detection"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { writeFile } from "fs/promises"
import fetchBase, { RequestInfo, RequestInit } from "node-fetch"
import path from "path"

const visitedLinks = new Set<string>()
const cacheDir = "./cachedSites"
const infoFilePath = path.join(cacheDir, "/cacheInfo.json")
if (!existsSync(infoFilePath)) {
	mkdirSync(cacheDir, { recursive: true })
	writeFileSync(infoFilePath, JSON.stringify({}))
}

type CachedLink = { link: string; data: string }

function retrieveFromCache(link: string): string | undefined {
	const cacheInfo: Record<string, string> = JSON.parse(
		readFileSync(infoFilePath, "utf-8")
	)
	const nameInCache = cacheInfo[link] as string | undefined
	if (!nameInCache) return undefined

	const cachePath = path.join(cacheDir, nameInCache)
	try {
		return (JSON.parse(readFileSync(cachePath, "utf-8")) as CachedLink).data
	} catch (error) {
		console.error(error)
		if (error instanceof SyntaxError) {
			delete cacheInfo[link]
			writeFileSync(infoFilePath, JSON.stringify(cacheInfo))
			rmSync(cachePath)
		}
		return
	}
}

function cacheResponse(link: string, data: string): void {
	// A map from links to file paths
	const cacheInfo: Record<string, string> = JSON.parse(
		readFileSync(infoFilePath, "utf-8")
	)
	if (link in cacheInfo) return
	const linkId = randomUUID()
	writeFile(
		path.join("./cachedSites/", linkId),
		JSON.stringify({ link, data } as CachedLink)
	)
	cacheInfo[link] = linkId
	writeFileSync(infoFilePath, JSON.stringify(cacheInfo))
}

function fetch(url: RequestInfo, init?: RequestInit) {
	return fetchBase(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0",
		},
		...init,
	})
}

export async function fetchDecode(url: string) {
	return convertBody(await (await fetch(url)).arrayBuffer())
}

export async function fetchText(link: string): Promise<string> {
	if (!visitedLinks.has(link)) {
		visitedLinks.add(link)
		let html = retrieveFromCache(link)
		if (!html) {
			html = await fetchDecode(link)
			cacheResponse(link, html)
		}
		return html
	}
	return Promise.resolve("")
}

export async function fetchJson<T extends object>(link: string): Promise<T> {
	visitedLinks.add(link)
	let jsonObj
	let obj: T = (jsonObj = retrieveFromCache(link)) && JSON.parse(jsonObj)
	if (!obj) {
		obj = (await (await fetch(link)).json()) as T
		cacheResponse(link, JSON.stringify(obj))
	}
	return obj
}
