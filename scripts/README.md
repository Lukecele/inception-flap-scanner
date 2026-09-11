# Diagnostics & Research Scripts

This directory contains diagnostic, exploratory, and reverse-engineering scripts developed during the reverse-engineering and integration of the Flap launchpad and GMGN OpenAPI.

## Directory Structure

- `find_flap_endpoint.cjs`: Tests various RPC endpoints and Flap factory methods.
- `find_flap_api_routes.cjs`: Inspects Flap HTTP routes and launchpad parameters.
- `find_aws_details.cjs`: Queries Flap backend AWS microservices.
- `test_cloudscraper.cjs`: Verifies Cloudflare bypass for Flap scraper fallbacks.
- `test_flap_trades_scrape.cjs`: Scrapes Flap trade history directly.
- `test_factory_logs.cjs`: Queries BSC `eth_getLogs` for Flap factory token launch events.
- `test_token_methods.cjs`: Verifies ABI methods on bonding curve contracts.
- `search_scripts.cjs`: Utility to search embedded frontend bundles.
- `check_gmgn_trades.cjs`: Verifies GMGN OpenAPI token trade history endpoints.
- `check_launch_data.cjs`: Queries GMGN trenches for BSC Flap tokens.
- `generate_history.cjs`: Seeds initial historical tokens for cold-start caching.
- `update_historical.cjs`: Synchronizes and updates token cache data.
- `flap_page.html`: Saved DOM snapshot for offline inspection of Flap interface structure.

## Usage

Scripts expect `GMGN_API_KEY` to be set in the environment if querying authenticated GMGN endpoints:

```bash
GMGN_API_KEY="your-key" node scripts/research/check_launch_data.cjs
```
