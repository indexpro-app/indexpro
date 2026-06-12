const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'IndexPro Backend OK', version: '1.0.0' });
});

app.post('/api/check-index', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });
  const results = [];
  for (const url of urls) {
    try {
      const r = await axios.get(url.trim(), { timeout: 8000, validateStatus: () => true });
      results.push({ url, alive: r.status === 200, httpStatus: r.status, indexStatus: r.status === 200 ? 'pending_check' : 'dead' });
    } catch (e) {
      results.push({ url, alive: false, httpStatus: 0, indexStatus: 'dead' });
    }
  }
  res.json({ success: true, results });
});

app.post('/api/smart-submit', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });
  const unique = [...new Set(urls.map(u => u.trim()).filter(u => u.startsWith('http')))];
  const needIndexing = [];
  const deadLinks = [];
  for (const url of unique) {
    try {
      const r = await axios.get(url, { timeout: 6000, validateStatus: () => true });
      if (r.status === 404 || r.status === 410) deadLinks.push(url);
      else needIndexing.push(url);
    } catch (e) { deadLinks.push(url); }
  }
  res.json({ success: true, analysis: { total: unique.length, duplicatesRemoved: urls.length - unique.length, needIndexing: needIndexing.length, deadLinks: deadLinks.length, creditsRequired: needIndexing.length * 3 }, urls: { needIndexing, deadLinks } });
});

app.post('/api/submit', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });
  const keyData = process.env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : null;
  if (!keyData) return res.json({ success: true, mode: 'demo', results: urls.map(url => ({ url, status: 'queued', message: 'Add GOOGLE_SERVICE_ACCOUNT env to enable real indexing', creditsUsed: 3 })) });
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: keyData.client_email, scope: 'https://www.googleapis.com/auth/indexing', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })).toString('base64url');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const jwt = `${header}.${payload}.${sign.sign(keyData.private_key, 'base64url')}`;
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const token = tokenRes.data.access_token;
    const results = [];
    for (const url of urls) {
      try {
        await axios.post('https://indexing.googleapis.com/v3/urlNotifications:publish', { url: url.trim(), type: 'URL_UPDATED' }, { headers: { Authorization: `Bearer ${token}` } });
        results.push({ url, status: 'submitted', creditsUsed: 3 });
      } catch (e) { results.push({ url, status: 'failed', error: e.message, creditsUsed: 0 }); }
      await new Promise(r => setTimeout(r, 200));
    }
    res.json({ success: true, results, mode: 'live' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log('IndexPro running on port ' + PORT));
