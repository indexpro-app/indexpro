const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'IndexPro Backend Running OK ✅',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Check if URLs are alive
app.post('/api/check-index', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }
  const results = [];
  for (const url of urls) {
    try {
      const response = await axios.get(url.trim(), {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IndexProBot/1.0)' },
        validateStatus: () => true
      });
      results.push({
        url,
        alive: response.status === 200,
        httpStatus: response.status,
        indexStatus: response.status === 200 ? 'pending_check' : 'dead',
        checkedAt: new Date().toISOString()
      });
    } catch (err) {
      results.push({ url, alive: false, httpStatus: 0, indexStatus: 'dead' });
    }
  }
  res.json({ success: true, results });
});

// Smart Submit
app.post('/api/smart-submit', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }
  const unique = [...new Set(urls.map(u => u.trim()).filter(u => u.startsWith('http')))];
  const needIndexing = [];
  const deadLinks = [];

  for (const url of unique) {
    try {
      const response = await axios.get(url, {
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: () => true
      });
      if (response.status === 404 || response.status === 410) {
        deadLinks.push(url);
      } else {
        needIndexing.push(url);
      }
    } catch (e) {
      deadLinks.push(url);
    }
  }

  res.json({
    success: true,
    analysis: {
      total: unique.length,
      duplicatesRemoved: urls.length - unique.length,
      needIndexing: needIndexing.length,
      deadLinks: deadLinks.length,
      creditsRequired: needIndexing.length * 3
    },
    urls: { needIndexing, deadLinks }
  });
});

// Submit to Google Indexing API
app.post('/api/submit', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }

  const keyData = process.env.GOOGLE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
    : null;

  if (!keyData) {
    return res.json({
      success: true,
      mode: 'demo',
      results: urls.map(url => ({
        url, status: 'queued',
        message: 'Add GOOGLE_SERVICE_ACCOUNT to enable real indexing',
        creditsUsed: 3
      }))
    });
  }

  // Real Google API via HTTP (no googleapis package needed)
  try {
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: generateJWT(keyData)
    });
    const token = tokenRes.data.access_token;
    const results = [];

    for (const url of urls) {
      try {
        await axios.post(
          'https://indexing.googleapis.com/v3/urlNotifications:publish',
          { url: url.trim(), type: 'URL_UPDATED' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        results.push({ url, status: 'submitted', creditsUsed: 3 });
      } catch (err) {
        results.push({ url, status: 'failed', error: err.message, creditsUsed: 0 });
      }
      await new Promise(r => setTimeout(r, 200));
    }
    res.json({ success: true, results, mode: 'live' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateJWT(key) {
  const crypto = require('crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

app.listen(PORT, () => {
  console.log('IndexPro Backend running on port ' + PORT);
});
