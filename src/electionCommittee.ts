import * as cheerio from "cheerio"
import _ from "lodash"
import { fetchText } from "./fetchLink.js"
import { Bechirot, Party } from "./types.js"
import { basePrefix, cleanText, errorLog } from "./utils.js"

const SOURCE = "elections committee"

// since the election committee site is written in angular I copied the links manually
const electionCommitteeLinks: [number, string][] = [
	[25, "https://votes25.bechirot.gov.il/"],
	[24, "https://votes24.bechirot.gov.il/"],
	[23, "https://votes23.bechirot.gov.il/"],
	[22, "https://votes22.bechirot.gov.il/"],
	[21, "https://votes21.bechirot.gov.il/"],
	[
		20,
		"https://web.archive.org/web/20151120100848/https://www.votes20.gov.il/nationalresults",
	],
	[
		19,
		"https://web.archive.org/web/20130830190250/http://www.votes-19.gov.il/nationalresults",
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
	letters: ["סימן", "אותיות"],
	votes: "קולות",
	votesPercent: "אחוזים",
	mandates: "מנדטים",
} satisfies Record<string, string | string[]>

/**
 * Scraping the old committee site is a real challenge.
 * Some site use frames to show data, some use iframes, some tables, some don't.
 */
export default async function scrap(): Promise<(Bechirot | undefined)[]> {
	console.log("scraping", SOURCE)
	const bechirot: Bechirot[] = []
	const scrapLink = async ([num, link]: [number, string]): Promise<void> => {
		const firstPage = await fetchText(link)
		if (!firstPage) {
			errorLog(SOURCE, `couldn't fetch first page at ${link}`)
			return
		}
		let html: string[] = [firstPage],
			nameTd: cheerio.Cheerio<cheerio.AnyNode> | undefined = undefined,
			$: cheerio.CheerioAPI | undefined = undefined

		elementSearchLoop: do {
			if (!html.length) break
			for (const htmlToProcess of html) {
				$ = cheerio.load(htmlToProcess)

				if (!nameTd?.length) {
					;({ nameTd, $ } = findResultsTable(htmlToProcess))
				}
				if (nameTd.length) break elementSearchLoop
			}
			if (!$) break

			const requests = _.compact(
				html
					.map((page) =>
						digFrames(page, link).concat(digLinks(page, link))
					)
					.flat()
			)
			html.length = 0
			html.push(
				..._.compact(
					await Promise.all(requests.map((url) => fetchText(url)))
				)
			)
		} while (true)
		if (!nameTd?.length || !$) {
			return
		}

		const rows: string[][] = []
		nameTd
			.closest("table")
			.find("tr")
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
				headerValueIndex(value),
			])
		) as Record<keyof typeof baseFieldNames, number>
		const parties: Party[] = _.orderBy(
			data.map((row) =>
				_.fromPairs(
					Object.entries(mapping)
						.map(
							([field, value]): [
								keyof Party,
								string | number | undefined
							] => {
								let rowValue: string | number | undefined = row[
									value
								] as string | undefined
								if (
									rowValue &&
									["votes", "mandates", "votesPercent"].includes(field)
								) {
									rowValue = parseFloat(rowValue)
								}
								return [field as keyof Party, rowValue]
							}
						)
						.concat([["source", SOURCE]])
				)
			),
			["mandates", "votes"],
			["desc", "desc"]
		) as unknown as Party[]

		bechirot[num - 1] = {
			parties,
			bechirotNum: num,
			source: SOURCE,
		}

		function headerValueIndex(value: string | string[]): number | undefined {
			function findIndex(value: string) {
				return header.findIndex((str) => str.includes(value))
			}
			if (_.isArray(value)) {
				for (const v of value) {
					const index = findIndex(v)
					if (index !== -1) return index
				}
				return undefined
			}
			return findIndex(value)
		}
	}

	await Promise.all(electionCommitteeLinks.map(scrapLink))

	console.log("done", SOURCE)
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
	const requiredFields = ["שם", ["סימן", "אותיות"], "מנדטים"]
	let nameTd: cheerio.Cheerio<cheerio.Element> = $()
	$("td,th").each((_i, el) => {
		const element = $(el)
		const text = element.text()
		const field = requiredFields.find((f) =>
			_.isArray(f) ? f.some((t) => text.includes(t)) : text.includes(f)
		)
		if (!field) return true
		const filteredFields = _.without(requiredFields, field)
		element.siblings().each((_i, el) => {
			const text = $(el).text()
			const field = filteredFields.find((f) =>
				_.isArray(f) ? f.some((t) => text.includes(t)) : text.includes(f)
			)
			if (!field) return true
			_.pull(filteredFields, field)
			return !!filteredFields.length // break loop if empty
		})
		if (!filteredFields.length) {
			nameTd = element
			return false
		}
		return true
	})
	return { nameTd, $ }
}

function digFrames(html: string, link: string): string[] {
	return cheerio
		.load(html)("frame, iframe")
		.map((_, frame) => basePrefix(link, frame.attribs["src"]))
		.toArray()
}
