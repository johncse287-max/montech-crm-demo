# MONTECH CRM

A local lead management and campaign dashboard built with React, TypeScript, Express, and SQLite.

## Features
- Lead management and status tracking
- SQLite local database
- MCA directory search from a local CSV file
- Duplicate detection when saving MCA records
- CSV export and VICIdial-compatible export
- Campaign management interface
- Local API health endpoint

## Technology Stack
- React 19 and TypeScript
- Vite
- Express 5
- SQLite with better-sqlite3
- Node.js

## Installation
1. Clone this repository.
2. Run `npm install`.
3. Place your authorized MCA CSV source file in the configured local location.
4. Run `npm.cmd run server` in one terminal.
5. Run `npm.cmd run dev` in another terminal.
6. Open the local URL displayed by Vite.

## Production Build
Run `npm.cmd run build`.

## Data and Privacy
- SQLite database is stored locally.
- Private lead CSV files, database files, backups, and environment secrets are excluded from Git.
- MCA suitability and owner identities are not independently verified.
- Do not commit private lead records, credentials, or customer information.