import { writeFileSync } from "fs";
import scrap from "./kenessetSite.js";

async function main() {
  writeFileSync("results.json", JSON.stringify(await scrap(), null, 2));
}

main();
