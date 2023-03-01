import * as cheerio from "cheerio"
import _ from "lodash"
import { fetchText } from "./fetchLink.js"
import { Bechirot } from "./types.js"
import { basePrefix, cleanText, clearLastLine } from "./utils.js"

const BASE_URL = "https://web.nli.org.il"

export default async function scrap(): Promise<Bechirot[]> {
	/**
	 * The national library site elections section is composed like so:
	 * list of all elections > election info > election parties votes
	 */
	console.log("scraping national library website...")
	const linksToElectionSites = await getLinksToElectionSites()
	const linksToElectionsResults = _.compact(
		await getLinksToElectionResults(linksToElectionSites)
	)
	const results = (
		await Promise.all(linksToElectionsResults.map(scrapParties))
	).filter(Boolean)
	console.log("done scraping national library")
	return results
}

async function scrapParties(
	link: string,
	i: number,
	{ length }: string[]
): Promise<Bechirot> {
	const $ = cheerio.load(await fetchText(link))
	const tbody = $('td:contains("מועד הבחירות")').parent().parent()
	const parties: string[][] = []
	$('td:contains("​מפלגה / רשימה")')
		.parent()
		.nextAll("tr")
		.each((_, e) => {
			let party: string[] = []
			parties.push(party)
			$(e)
				.children()
				.each((_, t) => {
					const value = cleanText($(t).text())
					if (value.length) party.push(value)
				})
		})

	const [year, month, day] = tbody
		.find('td:contains("מועד הבחירות")')
		.next()
		.text()
		.split(".")
		.reverse()
		.map((text) => Number(cleanText(text)))
	const thresholdPercent = tbody
		.find('td:contains("אחוז החסימה")')
		.next()
		.text()
		.match(/[\d\.]+%/)?.[0]
	return {
		date: new Date(year, month - 1, day),
		bechirotNum: NaN,
		eligibleVoters: parseFloat(
			cleanText(
				tbody.find('td:contains("מספר בעלי זכות הבחירה")').next().text()
			)
		),
		legalVotes: parseFloat(
			cleanText(
				tbody.find('td:contains("מספר הקולות הכשרים")').next().text()
			)
		),
		oneMandate: NaN,
		thresholdPercent: thresholdPercent ? cleanText(thresholdPercent) : null,
		source: "nationalLibrary",
		parties: _.orderBy(
			parties.map(([name, letters, mandates]) => ({
				mandates: parseFloat(cleanText(mandates)) || 0,
				name: cleanText(name),
				letters: cleanText(letters),
				source: "nationalLibrary",
			})),
			"mandates",
			"desc"
		),
	}
}

async function getLinksToElectionResults(links: string[]) {
	return await Promise.all(
		links.map(async (link, i) => {
			const $ = cheerio.load(await fetchText(link))
			const dLink = $("a:contains('מועמדים ותוצאות')")
				.map((_, aTag) => aTag.attribs.href)
				.toArray()[0]
			if (!dLink) return

			return basePrefix(BASE_URL, dLink)
		})
	)
}

/** Retrieve links to all individual election sites */
async function getLinksToElectionSites() {
	const $ = cheerio.load(
		await fetchText(
			BASE_URL +
				"/sites/NLI/Hebrew/collections/treasures/elections/all_elections/Pages/default.aspx"
		)
	)
	return [
		...new Set(
			$(".ms-rteTable-0 tr a")
				.map((_, aTag) => BASE_URL + aTag.attribs.href)
				.toArray()
		),
	]
}
