# Invoice review notes

Existing inspection: InvoiceDraftModal is shared by cloud/service fees; external uploads skip source backfill. Service fees map invoiceDate to receivableDate. Settlement recomputes net/tax. Purchase orders persist recognition before review. Cloud supplier recognition uploads attachments before save.

Use the existing invoice-tax helpers as the amount contract. Keep server-side validation authoritative, recognition values editable, and final values independent of raw recognition.

## Delivered Flow
Select file -> recognition or manual fallback -> editable confirmation -> save fields and attachment.
No persistence occurs before explicit confirmation. Cancel discards pending edits and the selected file.
The original file and raw recognition facts are independent of confirmed values; confirmation requests include facts for the operation log.
Recognition does not mark payments or receipts complete or reset payment approval states.

## Module Fields
| Entrypoint | Confirmed fields and special handling |
| --- | --- |
| Huawei Cloud external invoice | Number, issue date, currency, net, percentage rate, actual tax, gross, issuer unit/customer, FX, due date. Preserve source period; backfill source and link attachment. |
| Compute service-fee external invoice | Number, separate issue date, currency, net, percentage rate, actual tax through gross-minus-net, gross, issuer unit/customer, due date. Preserve receivable date and source period. |
| Project settlement recognition | Income/cost direction, unit, customer/supplier, number, issue date, period, accounting date, due date, CNY/USD/MXN currency, FX, UUID, net, rate, actual tax, gross. Preserve actual amounts for USD conversion. |
| Huawei Cloud supplier payment | Number, issue date, invoice currency/FX, net, rate, actual tax, gross, expected payment date. Invoice review shows percentage rates and stores fractions; supplier identity is not changed by recognition. |
| Purchase order recognition | Number, issue date, currency, net, rate, actual tax, gross, expected payment date and existing status controls. Only explicitly changed payment state is submitted. |

## Amount and Identity Rules
- Missing amounts may be derived; explicit tax is never overwritten merely to match a nominal rate.
- Editing net/rate recalculates tax and gross; editing gross recalculates net/tax; editing tax updates gross without changing the nominal rate.
- Zero and sub-1% rates are supported; rates are not rounded as money.
- Required details, valid amounts, sum consistency, positive finite FX and partner existence are checked on applicable save paths.
- In external invoice review, uniquely matched invoice parties replace source defaults in the invoice fields, with a warning when they differ. Unmatched or ambiguous parties are left empty for manual selection. Source contract identities and supplier/payment grouping are preserved.
- Duplicate source/invoice checks prevent repeat registration. External multi-period allocation is not implemented: unallocated full-total reuse across sources is rejected. Existing generated-invoice allocation remains.

## Persistence and Error Handling
- Common external invoices, items, source backfill and source attachment links save within a database transaction with a locked source row.
- Supplier payment and purchase order use existing two-request saves: fields first, then attachment. On attachment failure the fields remain saved, a clear partial-success error is shown, and the selected file remains available to retry.
- New settlement recognition records are removed if their attachment save fails.
- Voiding common invoices removes service-fee/settlement source attachment links but retains the original invoice record/file for audit.
- Selecting another file clears previous invoice fields before recognition, including on failure. External invoice registration refreshes term days from the recognized issuer and recalculates its due date; supplier payment/purchase-order expected dates retain their existing business context.

## Verification
- `npm test -- --reporter=dot`: 111 files / 604 tests passed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed.
- `node scripts/verify-invoice-review.mjs`: 32 scenarios passed at 1440x1000 and 390x844.
- Browser harness imports production React components but mocks API responses and persistence. It is not a production database or external OCR integration test.
- Screenshots are under verification/. Tests cover all five entrypoints for cancel, confirmed tax changes and failed recognition/manual entry; purchase-order reopen and attachment retry are covered additionally.
- Browser harness requires esbuild, Tailwind/PostCSS, Microsoft Edge and Playwright; CODEX_NODE_MODULES may point to a runtime containing Playwright.

## Deployment
1. Back up the deployment database using the existing operational procedure.
2. Run `npm run schema:invoice-review` with that environment's database configuration before starting the updated application.
3. Build and restart the application with the normal project process.

Only `merge_power_servicefeesnapshots.invoiceDate DATE NULL` is added. Existing dates are deliberately not guessed or rewritten. The local migration was applied and rerun successfully. No remote deployment or Git push was performed.

## Local Runtime Verification
- The verified production build is running at `http://127.0.0.1:5174` (bound to loopback); the previous port 3000 process has been stopped.
- Login page HTTP 200; unauthenticated POST to the recognition endpoint HTTP 401.
- Server stdout/stderr logs are under verification/. No authenticated business write was made during this startup check.
- Login network diagnosis: the initial process inherited restricted outbound networking; anonymous Node fetch to the Feishu API failed with EACCES. The same probe in the normal execution environment returned HTTP 200. Restarted port 5174 in that normal environment; login page returned HTTP 200 and stderr is empty.
- The browser reached the existing Feishu consent page. Automatic approval rejected clicking OAuth consent without explicit user authorization, so completing the authenticated login is left to the user. No consent bypass was attempted.

## Limits
- Recognition remains text PDF/OFD/XML; image/scanned invoice OCR is not added. Unsupported or unreadable files can be manually completed in review.
- File limit is 20 MB on recognition/upload paths.
- No automatic currency conversion rates or tax compliance conclusions are invented. Review against the actual invoice before confirming.

## Follow-up: Partner Matching and Labels (2026-10-23)
- Recognition-enabled actions now use "上传并识别" across Cloud, service fees, billing statements, invoice registers, purchase orders and settlement. Settlement keeps its two distinct flows, with the income-only source-linked action labeled "收入发票上传并识别".
- Both invoice sides are matched against their relevant libraries: income seller to undertaking unit and buyer to customer; cost seller to supplier and buyer to undertaking unit.
- Match tax numbers first, then registered/Chinese/English/short names. Full-width characters, case, whitespace and punctuation are normalized. Multiple candidates or conflicting nonempty tax numbers require manual selection; no new partner is created automatically.
- Matching status and local names are shown beside the recognized invoice facts. All partner pages are loaded, blank short names fall back to actual names, and recognized candidates remain displayable while options load.
- Unique matches replace business defaults only in editable invoice-party fields. Manual choices remain authoritative at confirmation. A new upload cannot silently reuse the previous recognized parties.
- External invoice persistence now reads undertaking-unit entityName and shortName as name fallbacks, covering units maintained through the current partner form.
- Verification: 112 Vitest files / 618 tests passed; 48 browser scenarios passed using the real React forms and mocked APIs, including conflicting defaults, second-page options, empty name variants, manual override, ambiguity, replacement files, cancel and save. Desktop/mobile screenshots were reviewed. No business invoices were created by verification.
- Production build (including TypeScript and 181 static pages) passed. Restarted the local server on 127.0.0.1:5174 in the normal network context; login page HTTP 200 and no startup stderr. No additional schema changes are required for this follow-up.

## Follow-up: Invoice Term and Due Date Synchronization
- Reproduced the reported inconsistency: source prefill supplied a 1111-day term, recognition changed issuer and issue date, but the old term/due date survived independently. A due date nine days after the recognized invoice date could therefore coexist with a displayed term of 1111.
- Recognition now includes the matched undertaking unit's current paymentTermDays from the database. External upload uses that term (default 30 if unconfigured) and calculates due date from the recognized invoice date.
- Changing the issuer manually reads its current default through the existing detail endpoint with no-store caching. Saving is disabled until this lookup succeeds; failure is shown with a retry by reselecting the issuer. Request version checks ignore stale responses after closing or switching the modal.
- Changing issue date or days recalculates due date; changing due date recalculates integer days. Negative/fractional terms, invalid dates and contradictory tuples are rejected by client and external-invoice save validation. Older callers providing only an explicit due date retain it, with term days derived consistently.
- No partner configuration or historical invoice/source records were modified by this repair. A remaining 1111-day configuration on a different undertaking unit is preserved, and still applies when that unit is actually selected.
- Targeted tests cover date boundaries, zero days, stale 1111-day terms, nine-day due dates, current recognition defaults and persisted invoice/source dates. Full suite: 113 files / 630 tests passed.
- Browser harness: 68 desktop/mobile scenarios passed. Added checks for term edits, invoice-date edits, deriving nine days from a chosen due date, rerecognition after changing the unit default, fresh manual-unit lookup and recovery from lookup failure. Reviewed screenshots show 2026-10-21 + 30 = 2026-11-20 and a manually selected 2026-10-30 paired with 9 days.
- Production build and TypeScript passed; restarted the updated application at http://127.0.0.1:5174 in its normal network context. Login page HTTP 200, no startup stderr. No schema changes were needed.
