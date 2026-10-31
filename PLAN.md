# ManushyaM E-commerce — Production-Ready Build Plan

## Context
ManushyaM sells Ayurvedic anti-hair-fall products: 4 SKUs at launch (Men/Women Therapy, Men/Women Combo), with more to come. We are building the full store from two references:
- **Features:** `features.txt`. This is the full feature list from the earlier Alimentures project (React/Vite + Express/Firestore). We reuse its feature set and its security patterns.
- **UI/UX:** `getdesign.md`. This holds the color, font, component and page specs taken from `designs/Manushyam Website.pptx`.

Current state:
- `FE/` is a blank Vite + React 19 app with no router and no Tailwind.
- `BE/` is an empty Express 5 skeleton: `index.js` only calls `listen`, `Config/db.js` is empty, and the `Models/`, `Controller/` and `Routes/` folders are empty. It uses CommonJS and depends on `bcrypt`, `cors` and `dotenv`.
- There is no git repo yet, and `BE/.env` exists without a `.gitignore`.

**Decisions confirmed with you:**
- **Database:** MongoDB + Mongoose, with our own login system (JWT + bcrypt) instead of Firestore.
- **Payments:** Razorpay (prepaid) + Cash on Delivery.
- **Shipping:** Shiprocket API integration.
- **v1 scope:** everything in features.txt, including live chat, first-party analytics with cookie consent, a separate Staff panel and a Blog CMS.

Outcome: a secure, tested and monitored store, deployed with CI/CD, that matches the design pixel for pixel, plus a documented security audit before go-live.

---

## 1. Architecture & stack

| Layer | Choice |
|---|---|
| FE | React 19 + Vite, React Router 7 (data router, lazy routes), **Tailwind 3** with the tokens from getdesign.md §12, Radix/shadcn-style `ui/` built with `cva`, Framer Motion + GSAP + Lenis, Embla carousel, Sonner, Lucide, Recharts, react-helmet-async, socket.io-client, Zod (forms) |
| BE | Node 20 LTS, Express 5 (CommonJS, matching the scaffold), Mongoose 8, Zod validation, Helmet, CORS allow-list, express-rate-limit with a **Redis store**, Socket.IO 4 + Redis adapter, Pino logger, Nodemailer, PDFKit, Razorpay SDK, Shiprocket REST client, `sanitize-html` |
| Data | **MongoDB Atlas** (Mumbai `ap-south-1`, replica set so transactions work), **Upstash Redis** (rate limits, socket adapter, short caches), **Cloudinary** (images + CDN; no base64 in the DB, per the "Ideas" list in features.txt) |
| Hosting | FE on **Netlify** (security headers, SPA fallback, sitemap). BE on **Render** (web service + Render Cron). Email via Brevo/SES SMTP. **Sentry** for FE and BE. Better Stack for uptime |
| Auth | bcrypt (cost 12). Access JWT (15 min, kept in memory) + **rotating refresh token** in an `httpOnly; Secure; SameSite=Strict` cookie, with token-family reuse detection. **Emailed OTP 2FA** on login (mandatory for staff/admin, optional for customers) |

### Repo layout
```
Manushyam/
  FE/src/{app(routes,layouts), pages/{store,account,staff,admin}, components/{ui,layout,product,checkout,blog,chat,ornaments}, lib/{api,analytics,auth}, hooks, data, styles}
  BE/{Config(env,db,redis,cloudinary), Models, Routes, Controller, Services(payment,shiprocket,mail,invoice,audit,search,delivery), Middleware(auth,validate,rateLimit,errors,requestId), Sockets, Jobs, Scripts, tests}
  e2e/ (Playwright), .github/workflows/, docs/ (runbooks, security-audit report)
```
We reuse the scaffold folders `BE/Models`, `Controller`, `Routes`, `Middleware` and `Config/db.js`, and replace `BE/index.js` with `app.js` (exported for tests) + `server.js` (calls listen).

---

## 2. Data model (Mongoose collections)
`users`, `refreshTokens`, `otps` (TTL index), `loginLockouts`, `addresses`, `products` (variants[], images[], slug unique, internal fields `select:false`), `categories`/`concerns`, `carts` (server cart for logged-in users), `wishlists`, `coupons`, `couponRedemptions` (unique `couponId+userId`), `orders` (state machine, `paymentMethod: razorpay|cod`, `shipment{shiprocketOrderId, awb, courier, trackingUrl, events[]}`), `stockReservations` (TTL), `idempotencyKeys` (TTL), `payments`/`webhookEvents` (unique event id for de-dup), `reviews` (unique `orderId+productId`), `notifications`, `chats` + `chatMessages`, `blogPosts` + `blogCategories`, `heroSlides`, `appearance`, `settings`, `deliverySettings`, `pincodeRules`, `faqs`, `contactMessages`, `newsletterSubscribers`, `auditLogs`, analytics (`pageviews`, `events`, `sessions`, `vitals`, `consents` with 90-day TTL), and daily pre-aggregated `analyticsDaily` + `salesDaily`.

Indexes are defined in each schema. Money is stored as **integer paise**.

---

## 3. Modules, in build order

Every module ships with: BE routes + Zod schemas + controller/service, FE pages built only from `getdesign.md` tokens and components, **tests** (§4), and **security checks** (§5). Its Definition of Done is: tests green in CI, the module's security checklist ticked, and the design checked against its mockup slide.

### M0 — Foundation (week 1)
- `git init`, `.gitignore` (`.env`, `node_modules`, `dist`), `.env.example` for FE and BE, Prettier + ESLint, Husky + lint-staged, gitleaks pre-commit. Rotate anything already in `BE/.env`.
- BE core:
  - env validation with Zod (fail fast at boot)
  - Mongo connection with retry, Redis
  - request-id, Pino logs
  - Helmet + CSP, CORS allow-list (fail closed)
  - body limits: 256 KB default, raw body only for webhooks
  - global and named rate limiters
  - `/health` (pings Mongo + Redis)
  - central error handler (no stack traces, requestId in every response)
  - graceful shutdown; handlers for `unhandledRejection` / `uncaughtException`
- CI (GitHub Actions): lint → unit → integration → build → Semgrep → npm audit → gitleaks.

### M1 — Design system & app shell (week 1–2)
- Tailwind config, CSS variables and fonts exactly as in getdesign.md §1–3 and §12.
- `ui/` primitives: the 11 button variants from §5, inputs/forms (§6), card, badge, tabs, dialog, drawer, select/SearchableSelect, quantity stepper, rating badge, skeletons, toasts.
- Ornaments (§4): wheat-arrow title, lotus divider, gold frame, icon circle.
- Layouts:
  - **StoreLayout:** announcement bar, header with the "Solutions" dropdown, footer, floating WhatsApp button
  - **AccountLayout**
  - **StaffLayout / AdminLayout:** sidebar, light/dark mode
- **Intro loader:** logo animation, then the logo moves into the header; once per session; honors reduced motion.
- Also: ErrorBoundary, RouteError, 404, SEO component, Lenis/GSAP setup, a `/styleguide` page for visual QA (dev only).

### M2 — Auth & accounts
- **BE:** register + email OTP; login (password → OTP); refresh/rotate; logout (revokes the token family); forgot/reset via OTP (responses don't reveal whether an email exists); profile get/update (field whitelist); per-account lockout (8 attempts → 15 min); OTP stored as sha256 + pepper, 10-min TTL, 5 tries, timing-safe compare; RBAC middleware (`customer|staff|admin`); `isActive` checked on every request (60 s cache).
- **FE:** AuthScaffold pages (Login, Register, OTP with input-otp, Forgot, Reset), ProtectedRoute with `allowedRoles`, silent refresh, auto-logout on 401.
- **Addresses:** CRUD + default address; India state → city dataset (reuse the generator idea `gen-india-locations.js`); PIN validation `^[1-9][0-9]{5}$`.

### M3 — Catalogue, search & CMS content
- **Products:**
  - CRUD with variants, slug, SKU, badges, ingredients, how-to-use, "free-from" flags, benefits list, FAQs and related products
  - field whitelists on write; internal fields (cost, margin, supplier) hidden from public reads
  - Cloudinary signed uploads (MIME + magic-byte check, 5 MB cap)
- **Search:** Mongo text index + fuzzy fallback; filters by concern/gender/price/in-stock; sort; pagination; header autocomplete.
- **Pages** (layouts per getdesign §8):
  - Home (hero carousel from CMS, bestseller card, feature strip, philosophy, ritual, testimonial)
  - Solutions/Shop listing (URL-state filters, mobile drawer)
  - **Product Detail** (gallery + zoom, rating badge, benefits, qty, Add to Cart + Buy Now, trust row, tabs, You May Also Like, Recently Viewed, JSON-LD Product schema)
  - About, How it Works & Ingredients (DHT section, Shop by Concern, ingredients), FAQ (accordion, CMS), Policies hub (privacy, terms, shipping, returns, cancellation)
- **CMS:** hero slides, appearance slots, site settings (announcement bar text, hero subline), FAQs, ingredients.

### M4 — Cart, wishlist & coupons
- Guest cart in localStorage, merged into the server cart on login. `/cart/validate` re-prices and re-checks stock server-side. Quantity 1–10 per line.
- Coupons:
  - percentage or flat, minimum order, expiry, usage caps
  - per-user redemption tracked atomically
  - "pending" until the order is paid or the COD order is confirmed; released if it never completes
- Wishlist (move to cart). Cart page with upsell, an empty state and FAQs.

### M5 — Checkout, payments & orders (critical path)
- **Checkout steps:** Address → Delivery → Payment → Review.
  - Delivery: Shiprocket **serviceability by PIN** gives ETA, COD availability and courier; combined with admin PIN rules and free-shipping threshold settings.
- **Order creation** (one Mongo transaction + an **idempotency key**):
  - the server builds all items and prices from the DB
  - checks and decrements stock per variant
  - reserves stock for 10 minutes (prepaid)
  - consumes the coupon
  - computes the delivery fee + COD fee on the server
- **Razorpay:**
  - create the Razorpay order; verify the client signature
  - **webhook** (HMAC on the raw body, de-dup by event id): `payment.captured`, `payment.failed`, `refund.processed`
  - abandon-payment endpoint releases the reservation
  - Render Cron cleans up expired reservations (cron secret, timing-safe compare)
- **COD:**
  - `cod_pending_confirmation` → confirmed by an OTP sent to the customer's phone or email (cuts fake orders)
  - COD limits: max order value and the PIN must allow COD (from Shiprocket)
  - optional COD fee; no stock reservation expiry
- **Order state machine:** `payment_pending → paid/cod_confirmed → processing → packed → shipped → out_for_delivery → delivered` plus `cancelled`, `rto`, `refunded`, with explicit allowed transitions.
  - Customers can cancel before `packed`.
  - Refunds are admin-only through Razorpay. COD refunds are recorded manually with bank/UPI details.
- **Shiprocket:**
  - auth token cached in Redis (renewed before its ~10-day expiry)
  - on `packed`: create the Shiprocket order, assign an AWB, request pickup, fetch the label
  - **tracking webhook** (secret token) updates shipment events and order status automatically
  - an hourly sync job as a fallback
- **FE:**
  - checkout pages styled per §6/§7
  - Razorpay script loaded only when needed
  - success and failure pages
  - **Track Order** page with the status timeline and Shiprocket events
  - order detail page and invoice download
- **Emails** (branded, table-based HTML): order placed, paid/confirmed, shipped (with tracking link), delivered (with the **GST invoice PDF**), cancelled, refunded, plus all OTP emails. Emails are queued so they never block the response.

### M6 — Reviews, blog & content engagement
- **Reviews:** verified purchase only (after delivery); one review per `orderId + productId`; length limits; rating totals recalculated; admin can moderate and delete.
- **Blog CMS:**
  - admin editor (TipTap) → HTML **sanitized on the server** with sanitize-html
  - categories, featured post, slug, SEO fields, cover image, scheduled publish
  - FE: Blogs & Reviews page per slide 9 (category sidebar, featured article, article grid, load more, reviews sidebar); single article page with Article JSON-LD
- Newsletter signup (double opt-in, unsubscribe link). Contact form → `contactMessages` + an email to support (rate-limited, honeypot + Cloudflare Turnstile).

### M7 — Notifications & live support chat
- **In-app notifications:** a bell that polls every 30 s, plus socket push.
- **Socket.IO:**
  - handshake auth with the JWT
  - rooms per chat; access only for the chat's participants or staff
  - per-socket token-bucket rate limit (burst 10, then 1 message/s)
  - messages capped at 2000 characters; sender identity taken from the server
  - Redis adapter so multiple instances can scale
- **Chat lifecycle:** init/resume, history, close/reopen; **staff queue** (pending → accept → active); admin sees every chat. The customer widget matches the brand; the WhatsApp button stays as the alternate channel.

### M8 — Staff panel
- Dashboard: KPIs, 7-day orders, low-stock health.
- Orders: filter, detail, allowed status transitions, Shiprocket actions (create shipment, print label).
- Inventory: product/variant CRUD and stock, Excel export.
- Support desk.
- Permissions: staff **cannot** issue refunds, manage users, coupons or settings, or see analytics. This is enforced on the server.

### M9 — Admin panel
Everything staff can do, plus:
- Users: create, change role, activate/deactivate, soft/hard delete.
- Coupons, PIN/delivery rules (CSV import/export), hero slides, appearance, blog, FAQs, settings.
- Reviews moderation; refunds.
- **Sales analytics:** AOV, revenue trend in IST, top products, new vs. returning customers, COD vs. prepaid, RTO rate.
- **Audit log viewer.** Every admin and staff write is audit-logged (actor, action, resource, before/after diff, IP).
- Exports to CSV, Excel and PDF (export libraries load only when needed).

### M10 — Analytics, cookie consent & privacy
- Cookie banner with a Customize panel (essential / analytics), re-openable from the footer.
- First-party `lib/analytics.js`: visitor and session IDs; events queued until consent; pageviews, clicks, UTM, device, Core Web Vitals.
- Ingest endpoints are rate-limited with a daily per-IP cap and clean their input. Daily roll-ups go into `analyticsDaily`. TTL purges raw data after 90 days.
- Admin web analytics dashboard (§10 of features.txt).
- **DPDP Act 2023 compliance:**
  - consent records
  - privacy policy
  - a "Download my data" and "Delete my account" flow (anonymizes orders kept for GST)

### M11 — SEO, performance & hardening
- Per-route meta and Open Graph tags; canonical by slug; JSON-LD for Product, Article, Organization, Breadcrumb and FAQ; `sitemap.xml` generated at build; `robots.txt`.
- Pre-render static marketing routes (Home, About, How it Works, product pages, blog) with `vite-plugin-prerender` or a Netlify prerender so SEO and LCP are good.
- Images through the Cloudinary `f_auto,q_auto` + `srcset`; the hero image gets `fetchpriority=high`.
- Route code splitting; SWR cache for GET requests; skeletons everywhere; **Core Web Vitals budget:** LCP < 2.5 s, CLS < 0.1, INP < 200 ms on mobile 4G.

---

## 4. Testing strategy (runs in CI on every PR)

| Level | Tooling | Must cover |
|---|---|---|
| Unit (BE) | Vitest | price/discount/fee calculator, coupon rules, order state machine transitions, OTP hash/verify, delivery resolver, Zod schemas, sanitizers |
| Integration/API (BE) | Vitest + Supertest + **mongodb-memory-server (replica set)** + Redis mock; Razorpay/Shiprocket stubbed with **nock** | every route: auth (200/401/403), validation (400), RBAC matrix; **concurrency tests** (2 buyers for the last unit, the same coupon redeemed twice, double-submit with the same idempotency key); webhook signature valid/invalid/replayed; reservation expiry; COD OTP flow |
| Socket | socket.io-client in tests | unauthenticated handshake rejected, joining someone else's chat blocked, rate-limit trips, message cap |
| Unit/Component (FE) | Vitest + React Testing Library + **MSW** | cart context, checkout steps, forms + validation, ProtectedRoute, analytics consent gating, every `ui/` button variant |
| E2E | **Playwright** (Chromium, WebKit, mobile Pixel/iPhone) against a staging-like stack | guest browse → cart → login (OTP from the test inbox) → address → Razorpay **test mode** pay → order visible → staff marks packed (Shiprocket sandbox) → shipped webhook → delivered → review; COD path; coupon; cancel; admin refund; chat round-trip customer↔staff |
| Visual regression | Playwright screenshots of every page at 1440/768/375, compared against approved baselines (first baselines reviewed side by side with the PPTX mockups) | design drift |
| Accessibility | `@axe-core/playwright` on every page (0 serious/critical), keyboard-only checkout run | WCAG 2.2 AA |
| Performance | **Lighthouse CI** (budgets from M11); **k6** load test: 200 VUs browsing, 50 concurrent checkouts, flash-sale stock contention | p95 API < 300 ms, 0 oversells, 0 duplicate orders |
| Contract | OpenAPI 3 spec generated from the Zod schemas; schemathesis fuzzing in staging | spec ↔ implementation drift, 5xx on fuzz input |

Coverage gates: BE ≥ 85% lines (≥ 95% on `Services/payment`, `orders` and `auth`), FE ≥ 70%.

---

## 5. Security & auditing

### 5.1 Built-in controls (checked per module)
- Server decides every price, fee, discount and stock change; the client only sends IDs and quantities.
- Zod `.strict()` on every input (blocks mass assignment); `mongo-sanitize` + `$`-key rejection (blocks NoSQL injection); ObjectId validation.
- Ownership checks on every `/:id` read and write (blocks IDOR); RBAC tested as a matrix.
- Cookie refresh token with `SameSite=Strict` plus an Origin check on state-changing cookie routes (CSRF).
- XSS: React escaping, blog HTML sanitized on the server, strict CSP (no `unsafe-inline` scripts; Razorpay, Cloudinary, Google Fonts and the API/WSS host allow-listed), Trusted Types where possible.
- Rate limits keyed per route (auth, OTP, order, coupon, review, chat, contact, analytics), with IPv6 /56 normalization; account lockout.
- Webhooks: HMAC on the raw body, timing-safe compare, event de-dup, replay window.
- Uploads: signed Cloudinary uploads only, MIME + magic-byte check, size caps, no SVG uploads.
- Secrets live only in Render/Netlify env vars; gitleaks; key rotation runbook. No PII in logs (Pino redaction of emails, phones, tokens and addresses).
- Headers: HSTS preload, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP/CORP.
- PCI scope is **SAQ-A**: card data only ever touches Razorpay Checkout.

### 5.2 Continuous (CI)
**Semgrep** (OWASP + Node rulesets), **npm audit / OSV-Scanner** (fail on high), **Dependabot**, **gitleaks**, CodeQL (JS), license check.

### 5.3 Pre-launch security audit (milestone gate, written into `docs/security-audit.md`)
1. **OWASP ASVS 4.0 Level 2** checklist walk-through, with evidence per item.
2. **DAST:** OWASP ZAP full scan against staging (authenticated as customer, staff and admin).
3. **Manual pentest scripts:**
   - IDOR on orders, addresses, chats and reviews
   - price/quantity tampering
   - coupon race (parallel redemption)
   - payment bypass (fake verify, replayed webhook, `payment.captured` for the wrong amount)
   - COD abuse
   - OTP brute force
   - JWT tampering, `alg:none`, refresh-token reuse
   - stored XSS through blog, reviews, chat and address fields
   - upload bypass, open redirect, SSRF via image URL
   - privilege escalation from staff to admin
4. Header/TLS checks: Mozilla Observatory A+, SSL Labs A+, securityheaders.com A.
5. Infra: Atlas IP allow-list + least-privilege DB user, encryption at rest, **daily backups + a tested restore**, Render private env vars, MFA on every vendor account (GitHub, Atlas, Render, Netlify, Razorpay, Shiprocket, Cloudinary).
6. Findings are triaged by severity. **Launch is blocked on any Critical or High.**
7. Post-launch: quarterly dependency + ASVS re-check; an optional external pentest once revenue justifies it.

---

## 6. Environments, CI/CD & operations
- **Environments:**
  - `local`: docker-compose with Mongo replica set + Redis + Mailpit
  - `staging`: Render + Netlify preview; Atlas M0/M10; Razorpay test mode; Shiprocket sandbox/test account
  - `production`
- **Pipeline:**
  - PR: lint, unit, integration, build, security scans, preview deploy, E2E smoke + Lighthouse + axe against the preview
  - `main` → deploy to staging → full E2E + ZAP baseline → **manual approval** → production deploy, then smoke tests
- **Observability:**
  - Sentry (FE + BE, release-tagged, source maps)
  - Pino JSON logs → Better Stack
  - uptime checks on `/health` and the storefront
  - alerts for failed webhooks, payment-verify failures, 5xx spikes, stuck `payment_pending` orders and Shiprocket sync failures
- **Jobs (Render Cron):** reservation cleanup (5 min), Shiprocket tracking sync (hourly), analytics roll-up (daily), retention purge (daily), abandoned-cart email (optional, consent-based).
- **Runbooks in `docs/`:** deploy/rollback, key rotation, Razorpay refund reconciliation, Shiprocket outage fallback (manual AWB), DB restore, incident response.

---

## 7. Milestones (indicative, single developer + Claude)

| Phase | Weeks | Exit gate |
|---|---|---|
| M0–M1 Foundation + design system | 1–2 | `/styleguide` matches getdesign.md; CI green |
| M2–M3 Auth, accounts, catalogue, content pages | 3–4 | all marketing pages pass visual review against slides 2–9 |
| M4–M5 Cart, checkout, Razorpay, COD, Shiprocket | 5–7 | E2E purchase (prepaid + COD) passes on staging; concurrency tests green |
| M6–M7 Reviews, blog, notifications, chat | 8–9 | chat + blog E2E green |
| M8–M9 Staff + Admin panels | 10–11 | RBAC matrix tests green |
| M10–M11 Analytics, consent, SEO, perf | 12 | Lighthouse budgets met |
| Hardening + **security audit** + UAT | 13–14 | 0 Critical/High; owner UAT sign-off |
| Launch | 15 | go-live checklist complete |

**Go-live checklist:**
- live Razorpay keys and webhook registered
- Shiprocket pickup address + KYC done
- domain + DNS + TLS
- GST details on invoices
- policies published (privacy, terms, shipping, returns, cancellation)
- SPF/DKIM/DMARC on the sending domain
- backups verified
- Sentry/alerts wired
- Google Search Console + sitemap submitted
- product data and images final

---

## 8. Open items to confirm during M0
1. The checkout/payment page mockup (slide 10 shows Contact Us).
2. The heading font license (Libre Caslon is the free stand-in).
3. GSTIN, legal entity name/address for invoices; COD fee and max COD order value.
4. Support WhatsApp number and emails (the mockup shows +91 78296 00018, care@ and hello@manushyam.com).

---

## Verification (how we prove it works end-to-end)
1. `docker compose up` locally → `npm test` in BE and FE (unit + integration with coverage gates) → `npx playwright test` (E2E, visual, axe).
2. On staging:
   - run a real Razorpay test-mode payment and a COD order
   - fire signed webhooks with `Scripts/simulate-webhook.js` (captured, failed, refund)
   - fire Shiprocket tracking webhooks
   - confirm the order timeline, emails (Mailpit/test inbox), the GST invoice PDF and the admin analytics update
3. Run k6 load + stock-contention scripts → check there are 0 oversells and 0 duplicate orders in Mongo.
4. Run the ZAP full scan + manual pentest script → audit report in `docs/security-audit.md` with all Critical/High closed.
5. Lighthouse CI + Observatory/SSL Labs scores recorded; owner UAT against each PPTX slide.
