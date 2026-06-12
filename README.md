# IndexPro Backend

Google Indexing API backend for IndexPro SaaS.

## Deploy to Railway

1. Push this folder to GitHub
2. Connect Railway to GitHub repo
3. Railway auto-deploys

## Environment Variables (add in Railway dashboard)

GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

## API Endpoints

POST /api/check-index    - Check if URLs are indexed
POST /api/submit         - Submit URLs to Google
POST /api/smart-submit   - Check then submit (smart billing)
GET  /api/campaigns      - Get campaigns
