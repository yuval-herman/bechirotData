import { writeFileSync } from "fs";
import scrapKnessetSite from "./kenessetSite.js";
import scrapNationalLibrary from "./nationalLibrary.js";
import _ from "lodash";

async function main() {
  const data = await (
    await Promise.all([scrapKnessetSite(), scrapNationalLibrary()])
  ).map((res) => _.sortBy(res, "bechirotNum")); // since we fetch stuff asynchronously, order is not guaranteed
  writeFileSync(
    "results.json",
    JSON.stringify(
      _.zip(...data).map(([first, ...p]) =>
        _.mergeWith(first, ...p, (objValue: any, srcValue: any) => {
          if (
            _.isString(objValue) &&
            _.isString(srcValue) &&
            objValue !== srcValue
          ) {
            return [objValue, srcValue];
          }
          if (!_.isObject(objValue) && objValue !== srcValue)
            return [objValue, srcValue];
        })
      ),
      null,
      2
    )
  );
}

main();
