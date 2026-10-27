# Invoice recognition review implementation

## Scope
- Add recognition to external invoice upload for Huawei Cloud reconciliation and compute service fees.
- Editable confirmation for settlement, cloud supplier payments, and purchase orders.
- Preserve confirmed amounts, source periods, business identities and payment status.
- Backfill linked external invoices; separate invoice and receivable dates.

## Phases
- [x] Shared recognition facts, editing helpers and server validation.
- [x] External upload review, source backfill and service-fee invoice date.
- [x] Existing recognition entrypoints, confirmation-only persistence.
- [x] Regression tests, TypeScript/build checks and visual verification.

## Follow-up: Labels and Partner Matching (2026-10-23)
- [x] Use "上传并识别" consistently for recognition-enabled upload actions.
- [x] Prefer uniquely matched invoice parties over source defaults in external invoice review; clear unresolved matches for manual selection.
- [x] Load all partner options, handle blank name fields, and show matching status.
- [x] Verify tax/name matching, ambiguity, conflicting tax numbers and partner persistence.
- [x] Full suite: 112 files / 618 tests; browser harness: 48 desktop/mobile scenarios.
- [x] Production build and TypeScript passed; restarted on port 5174 in the normal network context, login page HTTP 200.

## Constraints
- Preserve pre-existing untracked files; no production data rewrites.
- Read no credentials into output. Do not push commits unless requested.
- Text PDF/OFD/XML recognition; unsupported images remain manually editable uploads.

## Follow-up: Invoice Term and Due Date Synchronization
- [x] Diagnose stale source-unit term and stale due date after recognized issuer/date changes.
- [x] Return the matched issuer's current term with recognition; refresh it on manual issuer selection.
- [x] Link invoice date, integer term days and due date; validate their consistency on save.
- [x] Full suite: 113 files / 630 tests passed.
- [x] 68 browser scenarios passed; production build and TypeScript passed; updated server restarted on port 5174, login page HTTP 200.

## Verification
- Review/edit/save/reopen/cancel on all five entrypoints.
- Tax percentage adapters, zero values, invoice amount preservation.
- Separate due dates, source period, duplicate checks, allocation totals.
- No automatic receipt/payment completion from invoice recognition.

## Results (2026-10-23)
- Full Vitest suite: 111 files, 604 tests passed.
- TypeScript: passed; production build: passed (181 static pages).
- Real React components in a browser harness with mocked APIs: 32 desktop/mobile scenarios passed.
- Includes cancel without writes, confirmed edits, recognition failure/manual entry, purchase-order reopen, and attachment failure/retry.
- Desktop/mobile screenshots reviewed; verification did not create production invoices.
- Local service-fee invoiceDate migration applied and repeat verified idempotent.
- Deployment and operating limitations are recorded in notes.md.
