#!/bin/sh
set -eu

# Verify actual PDF conversion before starting the app or its sync jobs.
node .pdf-check/scripts/check-invoice-pdf.js
exec "$@"
