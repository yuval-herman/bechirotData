import * as cheerio from "cheerio"
import _ from "lodash"
import { fetchText } from "./fetchLink.js"
import { Bechirot, Party } from "./types.js"
import { basePrefix, cleanText } from "./utils.js"

// The site is written in angular
const electionCommitteeLinks: [number, string][] = [
	[25, "https://votes25.bechirot.gov.il/"],
	[24, "https://votes24.bechirot.gov.il/"],
	[23, "https://votes23.bechirot.gov.il/"],
	[22, "https://votes22.bechirot.gov.il/"],
	[21, "https://votes21.bechirot.gov.il/"],
	[
		20,
		"https://data.gov.il/dataset/votes-knesset/resource/c3db5581-f48d-45fc-b221-e7635e940c41",
	],
	[
		19,
		"https://data.gov.il/dataset/votes-knesset/resource/432d3185-545a-41d9-8c72-d10ee515919c?utm_source=go.gov.il&utm_medium=referral",
	],
	[
		18,
		"https://www.gov.il/apps/elections/elections-knesset-18/heb/results/main_Results.html",
	],
	[
		17,
		"https://www.gov.il/apps/elections/elections-knesset-17/heb/results/Main_Results.html",
	],
	[
		16,
		"https://www.gov.il/apps/elections/elections-knesset-16/heb/results/regions.html",
	],
	[
		15,
		"https://www.gov.il/apps/elections/Elections-knesset-15/heb/index.html",
	],
]

// Names which help us determine the type of a column
const baseFieldNames = {
	name: "שם",
	letters: "סימן",
	votes: "קולות",
	votesPercent: "אחוזים",
	mandates: "מנדטים",
} satisfies Record<string, string>

const detectDetailsQuery = _.unzip(
	["מצביעים", "כשרים", "פסולים"].map((v) =>
		[v, [...v].reverse().join("")].map((s) => `:contains(${s})`)
	)
)
	.map((v) => v.join(" ~ "))
	.join(",")

/**
 * Scraping the old committee site is a real challenge.
 * Some site use frames to show data, some use iframes, some tables, some don't.
 */
export default async function scrap(): Promise<(Bechirot | undefined)[]> {
	const bechirot: Bechirot[] = []
	const promises = electionCommitteeLinks
		.slice(-1)
		.map(async ([num, link]) => {
			let html: string[] = [await fetchText(link)],
				nameTd: cheerio.Cheerio<cheerio.AnyNode> | undefined = undefined,
				$: cheerio.CheerioAPI | undefined = undefined,
				bechirotInfo: cheerio.Cheerio<cheerio.AnyNode> | undefined =
					undefined
			elementSearchLoop: do {
				if (!html.length) break
				for (const htmlToProcess of html) {
					$ = cheerio.load(htmlToProcess)
					if (!bechirotInfo?.length) {
						bechirotInfo = $(detectDetailsQuery)
					}
					if (!nameTd?.length) {
						;({ nameTd, $ } = findResultsTable(htmlToProcess))
					}
					if (nameTd.length && bechirotInfo.length) break elementSearchLoop
				}
				if (!$) break

				const requests = _.chunk(
					_.compact(
						html
							.map((page) =>
								digFrames(page, link).concat(digLinks(page, link))
							)
							.flat()
					),
					5
				)
				html.length = 0
				for (const request of requests) {
					html.push(...(await Promise.all(request.map(fetchText))))
				}
			} while (true)
			if (!nameTd?.length || !$ || !bechirotInfo?.length) {
				console.error("found nothing...")
				return
			}

			const rows: string[][] = []
			nameTd
				.parent()
				.parent()
				.children()
				.each((_i, tr) => {
					const row: string[] = []
					rows.push(row)
					$!(tr)
						.children()
						.each((_i, cell) => {
							row.push(cleanText($!(cell).text()))
						})
				})
			const [header, ...data] = rows
			const mapping = _.fromPairs(
				Object.entries(baseFieldNames).map(([field, value]) => [
					field,
					header.findIndex((str) => str.includes(value)),
				])
			) as Record<keyof typeof baseFieldNames, number>
			const parties: Party[] = _.orderBy(
				data.map((row) =>
					_.fromPairs(
						Object.entries(mapping)
							.map(([field, value]) => {
								let rowValue: string | number | undefined = row[
									value
								] as string | undefined
								if (
									rowValue &&
									["votes", "mandates", "votesPercent"].includes(field)
								) {
									rowValue = parseFloat(rowValue)
								}
								return [field, rowValue]
							})
							.concat([["source", "oldElectionsSites"]])
					)
				) as (typeof baseFieldNames & {
					source: string
					votes: number
					mandates: number
					votesPercent: number
				})[],
				"mandates",
				"desc"
			)

			bechirot[num - 1] = {
				parties,
				bechirotNum: num,
				source: "election committee",
			}
		})
	await Promise.all(promises)
	return bechirot
}

function digLinks(html: string, baseLink: string): string[] {
	const origin = new URL(baseLink).origin
	return cheerio
		.load(html)("a[href]")
		.map((_i, a) => basePrefix(baseLink, a.attribs.href))
		.filter((_i, link) => {
			const url = new URL(link)
			return url.origin === origin && !url.hash && !url.search
		})
		.toArray()
}

function findResultsTable(html: string) {
	const $ = cheerio.load(html)
	const requiredFields = ["שם", "סימן", "מנדטים"]
	const nameTd = $(
		requiredFields.map((val) => `td:contains('${val}')`).join(" ~ ")
	)
	return { nameTd, $ }
}

function digFrames(html: string, link: string): string[] {
	return cheerio
		.load(html)("frame")
		.map((_, frame) => basePrefix(link, frame.attribs["src"]))
		.toArray()
}
