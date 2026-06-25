# Digital Document Verification System

This project is a full-stack document verification system. It checks uploaded documents with explainable AI-style analysis, compares document sections against stored content, stores accepted records in PostgreSQL, and anchors verified documents on a local blockchain smart contract.

In simple terms: users upload a document, the system studies it, explains the result, and stores proof of verified documents on blockchain so they can be checked later.

## What This Project Contains

The repository has two main parts:

- `block_chain_module/` - the blockchain part, built with Hardhat and Solidity.
- `integrated_app/` - the web application, split into a backend server and a frontend client.


## Main Features

- Upload research documents for originality and authorship analysis.
- Extract text from common document formats such as PDF, DOCX, TXT, CSV, HTML, Markdown, RTF, ODT, PPTX, and XLSX.
- Split documents into smaller sections and compare them with existing stored sections.
- Generate embeddings using `Xenova/all-MiniLM-L6-v2`.
- Detect repeated or suspicious content using heuristic XAI-style checks.
- Issue, verify, list, and revoke certificates.
- Verify certificates using file hash, extracted fields, OCR, metadata, and stored records.
- Register verified documents on a local Ethereum-compatible blockchain.
- Provide a Next.js user interface for document and certificate workflows.

## Project Structure

```text
server/
|-- README.md
|-- .gitignore
|-- block_chain_module/
|   |-- contracts/
|   |   `-- DocumentRegistry.sol
|   |-- api/blockchain/
|   |   `-- connector.js
|   |-- ignition/
|   |   `-- deploy.js
|   |-- scripts/
|   |   |-- DocumentRegistry.test.js
|   |   `-- DocumentVerification.test.js
|   |-- deployment-info.json
|   |-- hardhat.config.js
|   `-- package.json
`-- integrated_app/
    |-- client/
    |   |-- src/app/
    |   |   |-- page.js
    |   |   |-- layout.js
    |   |   `-- globals.css
    |   `-- package.json
    `-- server/
        |-- server.js
        |-- middleware/
        |-- utils/
        |-- functionality/
        |   |-- database/
        |   |-- services/
        |   |-- xai/
        |   `-- data/
        |-- scripts/
        |-- data/
        `-- package.json
```

## How The System Works

1. A user uploads a document or certificate from the web interface.
2. The backend extracts text from the uploaded file.
3. The backend calculates a SHA-256 hash of the file.
4. For research documents, the text is split into sections and compared with stored document chunks.
5. The system creates an analysis result showing originality, matched sections, authorship score, and confidence.
6. If the document passes the checks, it is saved in PostgreSQL.
7. Verified documents are registered in the `DocumentRegistry` smart contract.
8. Later, users can verify documents or certificates against the stored database and blockchain record.

## Technology Used

- Node.js and Express for the backend API.
- Next.js and React for the frontend.
- Tailwind CSS for styling.
- PostgreSQL or Neon PostgreSQL for storage.
- `pgvector`-style vector search support for embeddings.
- Hardhat, Solidity, and Ethers.js for blockchain.
- Tesseract.js for OCR.
- `pdf-parse`, Mammoth, XLSX, and related tools for document parsing.
- `@xenova/transformers` for local text embeddings.

## Requirements

Install these before running the project:

- Node.js 18 or newer.
- npm.
- PostgreSQL database, or a Neon PostgreSQL connection string.
- A local Hardhat blockchain node.

For best document parsing support, install `pdftotext` on your system. The server first tries `pdf-parse`, then falls back to `pdftotext` for PDFs.

## Environment Variables

Create a `.env` file inside `integrated_app/server/`.

```env
DATABASE_URL=postgresql://user:password@host:5432/database
ADMIN_REGISTRATION_TOKEN=change-this-admin-token
SERVER_PORT=5000
TESSERACT_LANGS=eng
```

Important notes:

- `DATABASE_URL` is required by the current backend database handler.
- `ADMIN_REGISTRATION_TOKEN` is required to register organizations.
- `SERVER_PORT` is optional. If not set, the backend uses port `5000`.
- `TESSERACT_LANGS` is optional. It defaults to English.

Create a `.env.local` file inside `integrated_app/client/` if the backend is not running at the default URL.

```env
NEXT_PUBLIC_SERVER_URL=http://localhost:5000
```

## Install Dependencies

From the blockchain module:

```bash
cd block_chain_module
npm install
```

From the backend server:

```bash
cd integrated_app/server
npm install
```

From the frontend client:

```bash
cd integrated_app/client
npm install
```

## Run The Project

Use three terminal windows.

Terminal 1: start the local blockchain.

```bash
cd block_chain_module
npm run start
```

Terminal 2: compile and deploy the smart contract.

```bash
cd block_chain_module
npm run compile
npm run deploy
```

This updates `block_chain_module/deployment-info.json` with the deployed contract address.

Terminal 3: start the backend API.

```bash
cd integrated_app/server
npm run dev
```

Terminal 4: start the frontend.

```bash
cd integrated_app/client
npm run dev
```

Open the frontend in your browser:

```text
http://localhost:3000
```

The backend normally runs here:

```text
http://localhost:5000
```

## Useful Commands

Blockchain:

```bash
npm run compile
npm run test
npm run start
npm run deploy
npm run clean
```

Backend:

```bash
npm run dev
npm run start
npm run backfill:embeddings
```

Frontend:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## API Overview

The backend exposes these main API routes:

- `GET /` - backend status message.
- `GET /api/health` - health check.
- `GET /api/blockchain/status` - current blockchain connection status.
- `GET /api/blockchain/stats` - blockchain document statistics.
- `GET /api/blockchain/verify/:documentHash` - verify a document hash on blockchain.
- `POST /api/document/upload` - upload and analyze a document.
- `POST /api/document/analyze-stream` - stream document analysis progress.
- `GET /api/documents` - list stored documents.
- `GET /api/document/:id` - get one document.
- `DELETE /api/document/:id` - delete a stored document.
- `POST /api/organizations/register` - register an organization. Requires `X-Admin-Token`.
- `GET /api/organizations/me` - get organization profile. Requires `X-Org-API-Key`.
- `POST /api/certificates/issue` - issue a certificate. Requires `X-Org-API-Key`.
- `POST /api/certificates/verify` - verify a certificate file.
- `GET /api/certificates` - list organization certificates. Requires `X-Org-API-Key`.
- `GET /api/certificates/:certId` - get certificate details.
- `GET /api/certificates/:certId/document` - view stored certificate document.
- `POST /api/certificates/:certId/revoke` - revoke a certificate. Requires `X-Org-API-Key`.
- `POST /api/small-documents/issue` - issue a small document record.
- `POST /api/small-documents/verify` - verify a small document.

## Authentication

Admin-only organization registration uses this header:

```text
X-Admin-Token: your-admin-token
```

Organization-only actions use this header:

```text
X-Org-API-Key: organization-api-key
```

To create an organization, call `POST /api/organizations/register` with the admin token. The server returns an organization API key once. Save it immediately.

## Database Notes

The backend expects PostgreSQL to be available through `DATABASE_URL`.

The code creates these tables if needed:

- `small_documents`
- `organizations`
- `certificates`

The research document workflow also expects existing `documents` and `chunks` tables. The chunk search code uses vector similarity through an `embedding_vector` column, so the database should support vector search, commonly through the `pgvector` extension.

## Blockchain Notes

The smart contract is `DocumentRegistry.sol`.

It stores:

- document hash
- document name
- uploader address
- timestamp
- verification status
- XAI summary
- confidence score

The blockchain connector reads `block_chain_module/deployment-info.json`, connects to `http://127.0.0.1:8545`, and uses the compiled contract artifact from Hardhat.

If blockchain calls fail, make sure:

- the Hardhat node is running,
- the contract has been deployed,
- `deployment-info.json` has the correct address,
- `block_chain_module/artifacts/` exists after compilation.

## Supported Upload Types

Main document analysis supports:

```text
PDF, DOCX, TXT, RTF, ODT, PPTX, XLS, XLSX, CSV, HTML, HTM, MD, TEX
```

Certificate and small-document flows support:

```text
PDF, PNG, JPG, JPEG, WEBP
```

## Important Generated Files And Folders

These are runtime or generated files and are intentionally ignored by Git:

- `.env`
- `node_modules/`
- `block_chain_module/artifacts/`
- `block_chain_module/cache/`
- uploaded files inside `uploads/`
- log and temporary files

## Current Status

This repository contains the core pieces for a thesis-style hybrid verification system:

- blockchain contract and tests,
- backend API,
- document parsing and analysis services,
- certificate workflows,
- PostgreSQL storage layer,
- frontend user interface.

Before production use, review security, database migrations, file storage, API rate limits, and deployment configuration carefully.
