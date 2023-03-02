import { writeFileSync } from "fs"
import scrapKnessetSite from "./kenessetSite.js"
import scrapNationalLibrary from "./nationalLibrary.js"
import _ from "lodash"
import electionCommittee from "./electionCommittee.js"
import { Bechirot } from "./types.js"

async function main() {
	const data = await (
		await Promise.all([
			scrapKnessetSite(),
			scrapNationalLibrary(),
			electionCommittee(),
		] as Promise<(Bechirot | undefined)[]>[])
	).map((res) => _.sortBy(res, "date")) // since we fetch stuff asynchronously, order is not guaranteed

	writeFileSync(
		"results.json",
		JSON.stringify(
			_.zip(...data).map(([first, ...p]) =>
				_.mergeWith(first, ...p, (objValue: unknown, srcValue: unknown) => {
					if (_.isNil(objValue)) return srcValue
					if (_.isNil(srcValue)) return objValue
					if (_.isPlainObject(objValue)) return
					if (_.isArray(objValue)) {
						if (objValue[0] === "conflict:")
							return objValue.concat(srcValue)
						else return
					}
					if (!_.isEqual(objValue, srcValue))
						return ["conflict:", objValue, srcValue]
				})
			),
			null,
			2
		)
	)
}

main()
