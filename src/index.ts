import { writeFileSync } from "fs";
import scrapKnessetSite from "./kenessetSite.js";
import scrapNationalLibrary from "./nationalLibrary.js";
import _ from "lodash";

async function main() {
  const data = await Promise.all([scrapKnessetSite(), scrapNationalLibrary()]);
  writeFileSync(
    "results.json",
    JSON.stringify(
      _.zip(...data).map((p) =>
        _.mergeWith(...p, (objValue, srcValue) => {
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
