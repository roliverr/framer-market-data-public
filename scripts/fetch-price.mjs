// Fetches Luno ticker prices only (no CoinMarketCap, no secrets needed) for
// every currency this repo already publishes core data for, and writes
// data/<ccy>-price.json. Lives HERE (the public repo), not the pipeline's
// private repo, specifically because:
//   - it needs no API key (Luno's ticker is unauthenticated), so there's no
//     secret to protect by keeping it private, and
//   - this repo's GitHub Actions minutes are unlimited (public repo), letting
//     it run every 5 minutes without the private repo's 2,000 free-minutes/
//     month budget capping the cadence.
// See ../README.md "Live price refresh".
//
// data/<ccy>.json (the core, hourly-ish, CMC+Luno file) is never touched by
// this script — this only ever writes the separate, additive
// data/<ccy>-price.json file, so there's no write-race between this workflow
// and the private repo's publish step.

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_DIR = path.join(ROOT, "config");

const LUNO_TICKER_URL = "https://api.luno.com/api/1/ticker";

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function warn(...args) {
  console.warn(new Date().toISOString(), ...args);
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fetchLunoTicker(pair) {
  const res = await fetch(`${LUNO_TICKER_URL}?pair=${encodeURIComponent(pair)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${pair} -> ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Currencies to fetch = whatever data/<ccy>.json files already exist, minus the -history/-price siblings. */
async function discoverCurrencies() {
  let files;
  try {
    files = await readdir(DATA_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".json") && !f.endsWith("-history.json") && !f.endsWith("-price.json"))
    .map((f) => f.replace(/\.json$/, "").toUpperCase());
}

async function main() {
  const assets = JSON.parse(await readFile(path.join(CONFIG_DIR, "luno-assets.json"), "utf8"));
  const currencies = await discoverCurrencies();

  if (currencies.length === 0) {
    console.error("No data/<ccy>.json files found to derive currencies from — nothing to do.");
    process.exit(1);
  }

  log(`Starting price-only fetch for ${currencies.length} currenc${currencies.length === 1 ? "y" : "ies"}, ${assets.length} asset(s).`);

  for (const currency of currencies) {
    const priceFilePath = path.join(DATA_DIR, `${currency.toLowerCase()}-price.json`);
    const previous = await readJsonFile(priceFilePath);

    const out = {
      _meta: {
        schema: 1,
        currency,
        updated: new Date().toISOString(),
        source: "Data provided by Luno",
      },
    };

    for (const asset of assets) {
      try {
        const ticker = await fetchLunoTicker(`${asset.luno_code}${currency}`);
        const lastTrade = Number(ticker.last_trade);
        if (!Number.isFinite(lastTrade)) throw new Error("last_trade not a finite number");
        out[asset.symbol] = { price: lastTrade };
      } catch (err) {
        const prevPrice = previous?.[asset.symbol]?.price;
        if (typeof prevPrice === "number" && Number.isFinite(prevPrice)) {
          out[asset.symbol] = { price: prevPrice };
          warn(`[${currency}] Luno ticker failed for ${asset.symbol}, carrying forward previous price:`, err.message);
        } else {
          warn(`[${currency}] Luno ticker failed for ${asset.symbol}, no previous price to carry forward, omitting:`, err.message);
        }
      }
    }

    await writeJsonFile(priceFilePath, out);
    log(`Wrote ${priceFilePath}`);
  }

  log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
