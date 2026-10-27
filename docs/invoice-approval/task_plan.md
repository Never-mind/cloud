# Invoice Approval and Returned Invoices

## Scope
- Independent Cloud Invoice Process and domestic VAT approvals.
- VAT special/ordinary invoices only; gross amount; Cloud business group.
- No personnel inputs in the application UI. The invoice delivery handler is the authenticated starter's bound Feishu account.
- Track approval progress separately from invoice return/recognition/confirmation.
- Read timeline and comment attachments; recognize with existing service; editable confirmation before posting.
- Do not submit real approvals or write production data during development.

## Phases
- [x] Inspect existing contracts and define integration boundaries.
- [x] Implement independent VAT form and API submission.
- [x] Implement returned-file collection, storage, recognition and deduplication.
- [x] Implement review UI and transactional confirmation/backfill.
- [x] Run regression tests, typecheck and browser verification; serve updated build on port 5174.

## Verified Context
- Cloud approval: ABBC8240-2CA4-4A33-8E58-AC91FC8648F2.
- VAT approval: 9BF45F81-882F-4C8C-9E7B-E19CC959F294.
- Example serial 202603250008 / instance CB6A3C11-137F-4557-B872-54482AA0C168.
- Example invoice PDF/OFD uploaded at the preceding approval node, not the final handling node.
- PDF recognition succeeded; OFD recognition failed. Preserve files and allow format fallback.
- CLOUD option now exists. Query current definition instead of hard-coding option IDs.
- VAT customer liaison remains required; handling node 876cf01ccb70ed47ff5d388109692637 uses the starter's bound Open ID as requested.
- Existing dirty files are previous user work; preserve them.

## Verification
- TypeScript: passed.
- Full regression: 118 files / 658 tests passed.
- Browser: 18 scenarios passed using actual components and fully intercepted API calls at 1440x1000 and 390x844.
- Production Next.js build: passed.
- New return-file table created only on localhost/merge; 24 columns verified. No business records changed.
- Initial read-only VAT prefill: 5 companies, 12 months, CLOUD present, local unit matched. The initial handler-configuration blocker was replaced by automatic starter assignment in the follow-up request.
- Official creation API verified node_approver_open_id_list key/value contract.
- Local server restarted on http://127.0.0.1:5174; served build ID matches new build; protected endpoints reject unauthenticated access.
- No real approval submitted; no production database modified; no new scheduled task installed.
- Deployment setup and explicit one-invoice-per-source / unsupported-format boundaries: README.md.

## Follow-up: Starter Is the Handler
- Removed fixed-handler configuration; the delivery node now uses the authenticated starter's bound Feishu Open ID.
- Prefill and submission both derive identity server-side. Query/body overrides cannot select another person.
- Invalid or missing Feishu bindings remain blocked; unrelated self-selected approval nodes are not reassigned.
- Added service and API identity tests. Full regression: 120 files / 671 tests passed; TypeScript passed.

## Follow-up: USD Reconciliation / CNY VAT Invoice
- Removed the incorrect source-currency blocker. VAT applications still represent CNY invoices, regardless of source currency.
- Show source currency and gross amount separately. Leave non-CNY monetary defaults empty for the agreed CNY amount; retain tax calculation and independent drafts.
- Keep single-row prefill currency, tax rate and FX aligned with the selected invoice/receivable amount group, including partially completed invoice fields.
- Compare VAT returns against the CNY application snapshot. Recognition failure defaults to CNY; the API validates the actual invoice currency.
- Do not reuse FX across currency changes, and preserve source receivable/collection amounts on invoice registration.
- TypeScript passed; full regression: 120 files / 682 tests passed. Browser verification: 26 scenarios passed at desktop/mobile widths using intercepted APIs.
- No real approvals submitted or business data changed; no schema migration required.

## Follow-up: Contact Open ID Serialization
- Identified Feishu 1390001 / user not found: the contact widget value accepts user_id, but was given the starter's open_id.
- Send contact value as an empty array and the authenticated starter in open_ids, per official approval form documentation.
- Keep the top-level starter open_id and delivery node node_approver_open_id_list unchanged.
- Add wire-format regression coverage for special/ordinary invoices and rejection handling without local persistence or retries.
- TypeScript, all 120 files / 685 tests, and production build passed. No UI changes required.
- Restarted localhost:5174; homepage returned 200 and matched the new build, protected approval endpoints returned 401 without a session, and stderr remained empty.
- No real Feishu approval submitted and no business records or account bindings changed.

## Follow-up: Shared Approval Materials
- Both Cloud and VAT flows use the same grouped attachment picker and local-file upload control, with independent drafts.
- Sources: selected Huawei periods, compute statements, service-fee statements, settlement invoices/projects, and the source billing customer's archive.
- Resolve references with source/customer ownership and existence checks, including merged-period customer consistency and legacy customer code normalization. Validate all files before any remote upload.
- Enforce 10 files, 10 MB per file and 30 MB total. Require explicit CSF marking for Mexico. Keep original stored files unchanged; new files are not automatically archived locally.
- Preserve form edits during asynchronous file reads. Block submission, navigation and closing while choosing/reading materials; retain materials after failed submission.
- Read-only inspection found no visible attachment widget in the Cloud Chile branch. It needs an administrator-added, visible top-level attachment widget; reopening reads its latest definition. Do not use the hidden Mexico CSF field.
- TypeScript passed. Full regression: 122 files / 729 tests passed. Mocked browser verification: 36 desktop/mobile cases passed, including delayed FileReader edits. No real Feishu approvals submitted or business data changed.
- No schema migration required. Production proxy upload limits remain unverified; repository Nginx example permits 100 MB, sufficient for approximately 40 MB base64 JSON at the application limit.
- Production build passed. Restarted the local app on 5174; homepage returned 200 after login redirect and served build DgKLSCViiXepKKceHNACt. Protected prefill/return endpoints returned 401 without authentication; server stderr was empty.
