import { randomUUID } from "crypto"
import convertBody from "fetch-charset-detection"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import _ from "lodash"
import fetchBase, { RequestInfo, RequestInit, Response } from "node-fetch"
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
		console.error(error, link)
		if (error instanceof SyntaxError) {
			delete cacheInfo[link]
			writeFileSync(infoFilePath, JSON.stringify(cacheInfo))
			rmSync(cachePath)
			console.log(link, "removed from cache")
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
	writeFileSync(
		path.join("./cachedSites/", linkId),
		JSON.stringify({ link, data } as CachedLink)
	)
	cacheInfo[link] = linkId
	writeFileSync(infoFilePath, JSON.stringify(cacheInfo))
}

const MAX_PARALLEL_FETCHES = 5
const inProgressFetches: Promise<Response>[] = []
type QueuedFetch = {
	url: RequestInfo
	init: RequestInit
	resolveFunction: (value: Response | PromiseLike<Response>) => void
	rejectFunction: (reason?: any) => void
}
const fetchesQueue: QueuedFetch[] = []
const BASE_FETCH_INIT: RequestInit = {
	headers: {
		"User-Agent":
			"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0",
	},
	redirect: "manual",
}
function fetch(url: RequestInfo, init?: RequestInit): Promise<Response> {
	let { resolveFunction, rejectFunction, promise } =
		getPromiseFunctions<Response>()
	fetchesQueue.push({
		url,
		init: { ...BASE_FETCH_INIT, ...init },
		resolveFunction,
		rejectFunction,
	})
	refreshFetchesQueues()
	return promise
}

function refreshFetchesQueues() {
	const availableSlots = MAX_PARALLEL_FETCHES - inProgressFetches.length
	for (let i = 0; i < availableSlots; i++) {
		const fetchRequest = fetchesQueue.pop()
		if (fetchRequest) sendFetch(fetchRequest)
		else break
	}
}

function getPromiseFunctions<T>(): {
	resolveFunction: (value: T | PromiseLike<T>) => void
	rejectFunction: (reason?: any) => void
	promise: Promise<T>
} {
	let resolveFunction: (value: T | PromiseLike<T>) => void = _.noop,
		rejectFunction: (reason?: any) => void = _.noop
	const promise = new Promise<T>((resolve, reject) => {
		resolveFunction = resolve
		rejectFunction = reject
	})
	return { resolveFunction, rejectFunction, promise }
}

function sendFetch(fetchDetails: QueuedFetch) {
	console.log(fetchDetails.url)
	const fetchPromise = fetchBase(fetchDetails.url, fetchDetails.init)
	inProgressFetches.push(fetchPromise)
	const removeFetch = () => {
		_.pull(inProgressFetches, fetchPromise)
		refreshFetchesQueues()
	}
	const thenHandler = (value: Response): void => {
		removeFetch()
		console.log(
			value.type,
			inProgressFetches.length,
			fetchesQueue.length,
			fetchDetails.url
		)
		fetchDetails.resolveFunction(value)
	}
	const rejectHandler = (reason: any) => {
		removeFetch()
		console.error(reason)
		fetchDetails.rejectFunction(reason)
	}
	fetchPromise.then(thenHandler).catch(rejectHandler)
}

export async function fetchDecode(url: string) {
	return convertBody(await (await fetch(url)).arrayBuffer())
}

export async function fetchText(link: string): Promise<string | undefined> {
	if (!visitedLinks.has(link)) {
		visitedLinks.add(link)
		let html = retrieveFromCache(link)
		if (!html) {
			try {
				html = await fetchDecode(link)
			} catch (error) {
				console.error(error)
				return
			}
			cacheResponse(link, html)
		}
		return html
	}
	return Promise.resolve("")
}

export async function fetchJson<T extends object>(
	link: string
): Promise<T | undefined> {
	visitedLinks.add(link)
	let jsonObj
	let obj: T = (jsonObj = retrieveFromCache(link)) && JSON.parse(jsonObj)
	if (!obj) {
		try {
			obj = (await (await fetch(link)).json()) as T
		} catch (error) {
			console.error(error)
			return
		}
		cacheResponse(link, JSON.stringify(obj))
	}
	return obj
}
