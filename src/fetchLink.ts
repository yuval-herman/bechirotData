import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"
import { randomUUID } from "crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { Agent as httpAgent } from "http"
import { Agent as httpsAgent } from "https"
import _ from "lodash"
import path from "path"
import { errorLog } from "./utils.js"

const SOURCE = "fetch manager"
const visitedLinks = new Set<string>()
const cacheDir = "./cachedSites"
const infoFilePath = path.join(cacheDir, "/cacheInfo.json")
if (!existsSync(infoFilePath)) {
	mkdirSync(cacheDir, { recursive: true })
	writeFileSync(infoFilePath, JSON.stringify({}))
}

type CachedLink = { link: string; data: string }

function retrieveFromCache(link: string): string | object | undefined {
	const cacheInfo: Record<string, string> = JSON.parse(
		readFileSync(infoFilePath, "utf-8")
	)
	const nameInCache = cacheInfo[link] as string | undefined
	if (!nameInCache) return undefined

	const cachePath = path.join(cacheDir, nameInCache)
	try {
		return (JSON.parse(readFileSync(cachePath, "utf-8")) as CachedLink).data
	} catch (error) {
		errorLog(SOURCE, error + " " + link)
		if (error instanceof SyntaxError) {
			delete cacheInfo[link]
			writeFileSync(infoFilePath, JSON.stringify(cacheInfo))
			rmSync(cachePath)
			console.log(link, "removed from cache")
		}
		return
	}
}

function cacheResponse(link: string, data: any): void {
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
const inProgressFetches: Promise<AxiosResponse>[] = []
type QueuedFetch = {
	url: string
	init: AxiosRequestConfig
	resolveFunction: (value: AxiosResponse | PromiseLike<AxiosResponse>) => void
	rejectFunction: (reason?: any) => void
}

axios.interceptors.response.use(
	null,
	(error: AxiosError & { config: { _retryNum?: number } }) => {
		if (error.config && error.code === "ECONNABORTED") {
			if (error.config._retryNum === undefined) error.config._retryNum = 1
			else if (error.config._retryNum <= 0) return error
			error.config._retryNum--
			return axios({
				...error.config,
				httpAgent: new httpAgent({ family: 4 }),
				httpsAgent: new httpsAgent({ family: 4 }),
			})
		}
		return error
	}
)

const fetchesQueue: QueuedFetch[] = []
const BASE_FETCH_INIT = {
	headers: {
		"User-Agent":
			"Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0",
	},
	timeout: 5000,
} satisfies AxiosRequestConfig

function fetch(url: string, init?: AxiosRequestConfig): Promise<AxiosResponse> {
	let { resolveFunction, rejectFunction, promise } =
		getPromiseFunctions<AxiosResponse>()
	fetchesQueue.push({
		url,
		init: _.merge(BASE_FETCH_INIT, init),
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

	const fetchPromise = axios.get(fetchDetails.url, {
		...fetchDetails.init,
	})
	inProgressFetches.push(fetchPromise)
	const removeFetch = () => {
		_.pull(inProgressFetches, fetchPromise)
		refreshFetchesQueues()
	}
	const thenHandler = (value: AxiosResponse): void => {
		removeFetch()
		console.log(
			"statusText: ",
			value.statusText,
			"inProgressFetches: ",
			inProgressFetches.length,
			"fetchesQueue: ",
			fetchesQueue.length,
			"url: ",
			fetchDetails.url
		)
		fetchDetails.resolveFunction(value)
	}
	const rejectHandler = (reason: AxiosError) => {
		removeFetch()
		errorLog(
			SOURCE,
			`fetch error, url: ${reason.config?.url}, message: ${reason.message}`
		)
		fetchDetails.rejectFunction(reason)
	}
	fetchPromise.then(thenHandler).catch(rejectHandler)
}

export async function fetchText(
	...args: Parameters<typeof fetch>
): Promise<string | undefined> {
	const [link, init] = args
	if (!visitedLinks.has(link)) {
		visitedLinks.add(link)
		let html = retrieveFromCache(link)
		if (!html || typeof html !== "string") {
			try {
				html = (await (
					await fetch(link, { ...init, responseType: "text" })
				).data) as string
			} finally {
				typeof html === "string"
					? html && cacheResponse(link, html)
					: (html = undefined)
			}
		}
		return html
	}
	return Promise.resolve("")
}

export async function fetchJson<T extends object>(
	...args: Parameters<typeof fetch>
): Promise<T | undefined> {
	const [link, init] = args
	visitedLinks.add(link)
	let obj: T = retrieveFromCache(link) as T
	if (!obj) {
		try {
			obj = (await fetch(link, { ...init, responseType: "json" })).data
		} catch {
			return
		}
		cacheResponse(link, obj)
	}
	return obj
}
