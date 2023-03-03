import * as cheerio from "cheerio"
import _ from "lodash"
import { fetchText } from "./fetchLink.js"
import { Bechirot } from "./types.js"
import { basePrefix, cleanText, errorLog } from "./utils.js"

const BASE_URL = "https://web.nli.org.il"
const SOURCE = "national library"

export default async function scrap(): Promise<Bechirot[] | undefined> {
	/**
	 * The national library site elections section is composed like so:
	 * list of all elections > election info > election parties votes
	 */
	console.log("scraping", SOURCE)
	const linksToElectionSites = await getLinksToElectionSites()
	if (!linksToElectionSites) {
		errorLog(SOURCE, "couldn't fetch link to election sites, aborting")
		return
	}
	const linksToElectionsResults = _.compact(
		await getLinksToElectionResults(linksToElectionSites)
	)
	const results = (
		await Promise.all(linksToElectionsResults.map(scrapParties))
	).filter(Boolean)
	console.log("done", SOURCE)
	return _.compact(results)
}

async function scrapParties(link: string): Promise<Bechirot | undefined> {
	const html = await fetchText(link)
	if (!html) {
		errorLog(SOURCE, `couldn't fetch ${link}`)
		return
	}
	const $ = cheerio.load(html)
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
		source: SOURCE,
		parties: _.orderBy(
			parties.map(([name, letters, mandates]) => ({
				mandates: parseFloat(cleanText(mandates)) || 0,
				name: cleanText(name),
				letters: cleanText(letters),
				source: SOURCE,
			})),
			"mandates",
			"desc"
		),
	}
}

async function getLinksToElectionResults(
	links: string[]
): Promise<(string | undefined)[]> {
	return await Promise.all(
		links.map(async (link) => {
			const html = await fetchText(link)
			if (!html) {
				errorLog(SOURCE, `couldn't fetch ${link}`)
				return
			}
			const $ = cheerio.load(html)
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
	const link =
		BASE_URL +
		"/sites/NLI/Hebrew/collections/treasures/elections/all_elections/Pages/default.aspx"
	const html = await fetchText(link)
	if (!html) {
		errorLog(SOURCE, `couldn't fetch ${link}`)
		return
	}
	const $ = cheerio.load(html)
	return [
		...new Set(
			$(".ms-rteTable-0 tr a")
				.map((_, aTag) => BASE_URL + aTag.attribs.href)
				.toArray()
		),
	]
}
