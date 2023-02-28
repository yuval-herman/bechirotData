import * as cheerio from "cheerio"
import fetch from "node-fetch"
import { basePrefix, fetchDecode } from "./utils.js"

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
  [15, "https://www.gov.il/apps/elections/Elections-knesset-15/heb/index.html"],
]

/**
 * Scraping the old committee site is a real challenge.
 * Some site use frames to show data, some use iframes, some tables, some don't.
 */
export default async function scrap() {
  electionCommitteeLinks.slice(-1).map(async ([num, link]) => {
    const html = await (await fetch(link)).text()
    const { nameTd, $ } = findResultsTable(html)
    if (!nameTd.length) {
      const innerFrames = Promise.all(digFrames($, link))
      ;(await innerFrames).map(async (frame) => {
        const { nameTd, $ } = findResultsTable(frame)
        if (!nameTd.length) {
          const texts = await digLinks($, link)
          for (const text of texts) {
            const { nameTd, $ } = findResultsTable(text)
            console.log(text, nameTd.length)
          }
        }
      })
    }
  })
}
function digLinks($: cheerio.CheerioAPI, link: string) {
  return Promise.all(
    $("a")
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
  )
}

function findResultsTable(html: string) {
  const $ = cheerio.load(html)
  const nameTd = $("td").filter((_i, td) => {
    const text = $(td).text()
    return text.includes("שם") || text.includes([..."שם"].reverse().join(""))
  })
  return { nameTd, $ }
}

function digFrames($: cheerio.CheerioAPI, link: string): Promise<string>[] {
  const framesLinks = $("frame")
    .map((_, frame) => basePrefix(link, frame.attribs["src"]))
    .toArray()
  return framesLinks.map(async (frameLink) => fetchDecode(frameLink))
}
