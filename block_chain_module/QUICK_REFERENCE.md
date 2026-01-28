# 🚀 Quick Reference Card

## 🎯 3-Command Startup

```bash
# Terminal 1 - Blockchain Node
npm run node

# Terminal 2 - Deploy Contract (after Terminal 1 is ready)
npm run deploy

# Terminal 3 - Start Server (after Terminal 2 completes)
npm start
```

**Access:** http://localhost:3000

---

## 🧪 Quick Test

```bash
cd xai_module && python3 simple_test.py
```

---

## 📊 System Status

### Check if Running:

```bash
# Blockchain
curl -X POST http://localhost:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# API Server
curl http://localhost:3000/api/stats

# Python
python3 xai_module/enhanced_plagiarism_check.py --help
```

---

## 🐛 Quick Fixes

### "Cannot connect to network"
```bash
# Terminal 1 not running - start it:
npm run node
```

### "Deployment info not found"
```bash
# Terminal 2 not run - deploy:
npm run deploy
```

### "Port 3000 in use"
```bash
# Kill existing process:
lsof -i :3000
kill -9 <PID>
```

### "Module not found"
```bash
npm install
```

### Complete Reset
```bash
# Stop all terminals (Ctrl+C)
rm -rf cache/ artifacts/build-info/
npm run node      # Terminal 1
npm run deploy    # Terminal 2
npm start         # Terminal 3
```

---

## 📂 Important Files

| File | Purpose |
|------|---------|
| `api/server.js` | Main API server |
| `api/xai/real-analyzer.js` | Python integration |
| `xai_module/*.py` | XAI analysis modules |
| `contracts/DocumentRegistry.sol` | Smart contract |
| `database/schema.sql` | PostgreSQL schema |
| `.env` | Configuration |

---

## 🔧 Configuration

### Environment Variables (.env)
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=document_verification
DB_USER=postgres
DB_PASSWORD=your_password
PYTHON_PATH=python3
PORT=3000
```

---

## 📡 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/document/upload` | POST | Upload & analyze |
| `/api/documents` | GET | List all documents |
| `/api/document/:id` | GET | Get specific document |
| `/api/document/verify` | POST | Verify by hash |
| `/api/stats` | GET | System statistics |

---

## 🎨 XAI Modules

| Module | Script | Purpose |
|--------|--------|---------|
| Plagiarism | `enhanced_plagiarism_check.py` | Detect copied content |
| AI Detection | `ai_content_detector.py` | Find AI-generated text |
| Forgery | `certificate_forgery_detector.py` | Verify certificates |

**Test Individual Module:**
```bash
python3 xai_module/enhanced_plagiarism_check.py test.txt
```

---

## 📊 Expected Behavior

### ✅ Valid Document
```
Upload → XAI Analysis (2-5s) → Verified → Blockchain Registration → Success
Confidence: 85-100%
```

### ❌ Plagiarized Document
```
Upload → XAI Analysis → Plagiarism Detected (>75% similarity) → Rejected
Confidence: 0-30%
```

### ❌ AI-Generated Document
```
Upload → XAI Analysis → AI Detected (>60% probability) → Rejected
Confidence: 0-40%
```

### ❌ Forged Certificate
```
Upload → XAI Analysis → Forgery Detected (template match) → Rejected
Confidence: 0%
```

---

## 🔍 Log Messages

### Good Signs:
```
✅ Document saved to database
✅ Analysis complete: verified
✅ Blockchain registration successful
✅ Transaction hash: 0x...
```

### Warning Signs:
```
⚠️ Plagiarism detected
⚠️ AI-generated content suspected
⚠️ Certificate forgery detected
```

### Error Signs:
```
❌ Cannot connect to network
❌ Deployment info not found
❌ Python script failed
❌ Database connection error
```

---

## 🚦 System Health

| Component | Check | Expected |
|-----------|-------|----------|
| Blockchain | Terminal 1 output | "JSON-RPC server at..." |
| Contract | `block_chain/deployment-info.json` | File exists |
| API Server | Terminal 3 output | "Server is running..." |
| Python | `python3 --version` | Python 3.8+ |
| XAI Modules | `simple_test.py` | All passed |

---

## 💾 Database Options

### Current (JSON File)
```javascript
// api/server.js line 11
const dbHandler = require('./database/handler');
```

### Production (PostgreSQL)
```javascript
// api/server.js line 11
const dbHandler = require('./database/postgres-handler');

// Then setup database:
cd database && ./setup-db.sh
```

---

## 🎯 Performance Tips

1. **Use PostgreSQL** for >1000 documents
2. **Cache known documents** in XAI modules
3. **Use PM2** for server management
4. **Enable gzip** compression
5. **Add Redis** for caching

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `ENHANCED_README.md` | Complete setup guide |
| `DEPLOYMENT_CHECKLIST.md` | Step-by-step deployment |
| `IMPLEMENTATION_COMPLETE.md` | Implementation summary |
| `QUICK_REFERENCE.md` | This document |

---

## 🆘 Emergency

### System Hang
```bash
# Kill all Node processes
pkill -f node

# Restart from scratch
npm run node && npm run deploy && npm start
```

### Data Corruption
```bash
# Reset database (JSON)
rm api/database/documents.json

# Reset blockchain
rm -rf cache/ artifacts/build-info/
npm run node
npm run deploy
```

### Clean Installation
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 🎓 Tips

1. **Keep Terminal 1 running** - Blockchain must stay active
2. **Check Python path** - Update .env if needed
3. **Monitor logs** - Terminal 3 shows all activity
4. **Test XAI first** - Before uploading real documents
5. **Backup deployment-info.json** - After successful deployment

---

## 📞 Quick Help

**Issue:** Server won't start  
**Check:** All three terminals running?

**Issue:** XAI not working  
**Run:** `python3 xai_module/simple_test.py`

**Issue:** Blockchain errors  
**Verify:** Terminal 1 shows "Started HTTP and WebSocket server"

**Issue:** Upload fails  
**Check:** `uploads/` directory exists with write permissions

---

## ✨ Current Status

**Contract Address:** `0x5FbDB2315678afecb367f032d93F642f64180aa3`  
**Blockchain RPC:** `http://127.0.0.1:8545`  
**API Server:** `http://localhost:3000`  
**Database:** JSON (PostgreSQL ready)  
**XAI Modules:** ✅ All working  

---

**Version:** 2.0  
**Status:** 🟢 Production Ready  
**Last Updated:** 2024
