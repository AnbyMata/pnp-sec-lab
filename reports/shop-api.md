# NEBULA shop API

PHP, Python, Spring expose the same endpoints under `/api/store` on ports 10001, 10002, 10003. Each uses its own existing login session, but the same account ID shares its wallet, inventory and orders across versions. These are simulated credits, not money. Each account receives 10,000 CR on first use.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/catalog` | Public product list |
| GET | `/catalog/{id}` | Public product detail |
| GET | `/wallet` | Current account balance |
| GET | `/inventory` | Current account's owned planets |
| GET | `/orders` | Current account's purchase history |
| POST | `/quote` | Server-calculated price, discount, total and remaining balance; no purchase |
| POST | `/purchase` | Deduct credits and record ownership atomically |

POST JSON: `{"planet_id":"lumina","coupon":"NEBULA10"}`. Send `Content-Type: application/json` and `X-Nebula-Shop: 1`. Coupon is optional. Session authentication is required except for catalog endpoints. No cross-origin access is enabled.

`NEBULA10` gives 10% off one purchase per account. Each planet may be owned once. Prices are calculated on the server; client price and total fields are ignored. Wallet row locks plus unique ownership/coupon constraints prevent duplicate purchases, coupon reuse, and overspending from concurrent requests. A retry of an already committed purchase returns 409 without charging again.

Errors use HTTP 400 (invalid request/coupon), 401 (login required), 403 (missing shop header), 404 (unknown planet), 409 (already owned, used coupon, insufficient balance). Error messages are in `detail`.

Tables: `nebula_wallet`, `nebula_orders`. For a fresh DB, `unified-init/04-store.sql` runs automatically. For an existing DB, apply that file once without deleting the volume. The migration only adds tables and does not reset existing data.

The shared frontend sources are `shared/shop.js` and `shared/shop.css`. Their deployment copies are in each runtime's static directory. After edits, copy both files to those directories and rebuild.

Integration check: pipe `tests/shop_integration.py` into `docker compose exec -T python python -` from the workspace. It creates isolated accounts and removes its own fixtures on completion. It verifies all three APIs, account sharing, coupons, duplicate/concurrent purchases and insufficient balance.
