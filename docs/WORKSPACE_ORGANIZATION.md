# Workspace Organization

This workspace has been cleaned and fully reorganized while preserving runtime behavior.

## Current structure

- `block_chain_module/` — Hardhat contract + API server + blockchain integration
  - `docs/guides`, `docs/references`, `docs/reports`
  - `assets/samples`
- `integrated_app/` — integrated server entrypoint/UI
  - `docs/guides`, `docs/reports`, `docs/assets`
  - `scripts`
- `xai_module/` — Python and Node-based XAI tooling
  - `docs/guides`
  - `tests`
- `docs/updates/` — root-level historical update notes

## What was reorganized

- Moved root update docs:
  - `CHUNKING_FIXED.md` → `docs/updates/CHUNKING_FIXED.md`
  - `MULTI_FORMAT_UPGRADE.md` → `docs/updates/MULTI_FORMAT_UPGRADE.md`
- Moved non-runtime files under blockchain module docs:
  - `block_chain_module/later part` → `block_chain_module/docs/notes/later-part.txt`
  - `block_chain_module/test-server.html` → `block_chain_module/docs/testing/test-server.html`
  - `block_chain_module/Block_Chain/architecture_diagram.py` → `block_chain_module/docs/architecture/architecture_diagram.py`
- Consolidated blockchain module docs:
  - Integration/deployment/setup docs moved to `block_chain_module/docs/guides/`
  - Reference docs moved to `block_chain_module/docs/references/`
  - Status/implementation reports moved to `block_chain_module/docs/reports/`
  - `block_chain_module/11.pdf` moved to `block_chain_module/assets/samples/11.pdf`
- Consolidated integrated app docs and scripts:
  - `QUICK_START.md` → `integrated_app/docs/guides/QUICK_START.md`
  - `INTEGRATION_SUMMARY.md` → `integrated_app/docs/reports/INTEGRATION_SUMMARY.md`
  - `image.png` → `integrated_app/docs/assets/image.png`
  - `check_db.js`, `start.sh`, `setup-and-start.sh` → `integrated_app/scripts/`
- Consolidated XAI docs and tests:
  - `XAI_IMPLEMENTATION_GUIDE.md` → `xai_module/docs/guides/XAI_IMPLEMENTATION_GUIDE.md`
  - `simple_test.py`, `test_integration.py` → `xai_module/tests/`
  - Added compatibility wrappers at original paths (`xai_module/simple_test.py`, `xai_module/test_integration.py`)

## What was removed

- Generated logs and temporary files:
  - `block_chain_module/server.log`
  - `block_chain_module/blockchain.log`
  - `block_chain_module/api/data/documents.json.backup`
  - `block_chain_module/api/data/documents.json.broken`
  - `xai_module/__pycache__/`
- Empty unused file:
  - `block_chain_module/api/xai/integrated-analyzer.js`
- Reproducible Hardhat outputs:
  - `block_chain_module/artifacts/`
  - `block_chain_module/cache/`

## Maintenance rules added

Root `.gitignore` now ignores logs, Python cache, backup/temp files, Hardhat generated artifacts, and upload runtime folders.
