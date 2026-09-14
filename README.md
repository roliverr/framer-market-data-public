# Market Data (public mirror)

Auto-generated public data feed powering Luno's locale marketing pages in
Framer (currency converter, convert table, market-stats card, price chart).

**Do not edit files in this repo directly** — they're overwritten on every
scheduled run. Files:

- `data/<currency>.json` — price, 24h change, market cap, volume, circulating
  supply, all-time high, rank. Raw numbers only; formatting happens client-side.
- `data/<currency>-history.json` — chart series across several timeframes.
- `data/<currency>-price.json` — live price, refreshed independently and more
  often than the file above.

Data provided by CoinMarketCap + Luno.
