import * as cheerio from "cheerio"
import _ from "lodash"
import fetch from "node-fetch"
import { Bechirot, Party } from "./types.js"
import { basePrefix, cleanText, fetchDecode } from "./utils.js"

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

/**
 * Scraping the old committee site is a real challenge.
 * Some site use frames to show data, some use iframes, some tables, some don't.
 */
export default async function scrap() {
	electionCommitteeLinks.slice(-1).map(async ([num, link]) => {
		let html = [await (await fetch(link)).text()],
			nameTd,
			$: cheerio.CheerioAPI
		do {
			if (!html.length) break
			;({ nameTd, $ } = findResultsTable(html.pop()!))
			if (!nameTd.length) {
				html.push(
					...(await Promise.all(
						digFrames($, link).concat(digLinks($, link))
					))
				)
			} else break
		} while (true)
		if (!nameTd || !nameTd.length) return

		const rows: string[][] = []
		nameTd
			.parent()
			.parent()
			.children()
			.each((_i, tr) => {
				const row: string[] = []
				rows.push(row)
				$(tr)
					.children()
					.each((_i, cell) => {
						row.push(cleanText($(cell).text()))
					})
			})
		const [header, ...data] = rows
		const mapping = _.fromPairs(
			Object.entries(baseFieldNames).map(([field, value]) => [
				field,
				header.findIndex((str) => str.includes(value)),
			])
		) as Record<keyof typeof baseFieldNames, number>
		const parties: Party[] = data.map((row) =>
			_.fromPairs(
				Object.entries(mapping)
					.map(([field, value]) => {
						let rowValue: string | number | undefined = row[value] as
							| string
							| undefined
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
		})[]
		console.log(parties)

		// [ 'שם הרשימה', 'סימן', 'מספר קולות', 'אחוזים', 'מנדטים' ]
	})
}
function digLinks($: cheerio.CheerioAPI, link: string) {
	return $("a")
		.filter((_i, a) => {
			const text = $(a).text()
			return (
				text.includes("תוצאות") ||
				text.includes([..."תוצאות"].reverse().join(""))
			)
		})
		.map((_i, a) => basePrefix(link, a.attribs.href))
		.toArray()
		.map(fetchDecode)
}

function findResultsTable(html: string) {
	const $ = cheerio.load(html)
	const requiredFields = ["שם", "סימן", "מנדטים"]
	const nameTd = $(
		requiredFields.map((val) => `td:contains('${val}')`).join(" ~ ")
	)
	return { nameTd, $ }
}

function digFrames($: cheerio.CheerioAPI, link: string): Promise<string>[] {
	const framesLinks = $("frame")
		.map((_, frame) => basePrefix(link, frame.attribs["src"]))
		.toArray()
	return framesLinks.map(async (frameLink) => fetchDecode(frameLink))
}
