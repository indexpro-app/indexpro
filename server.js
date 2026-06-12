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
    status: 'IndexPro Backend Running OK',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Check if URLs are alive (404 detection)
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
      results.push({ url, alive: false, httpStatus: 0, indexStatus: 'dead', error: err.message });
    }
  }
  res.json({ success: true, results });
});

// Smart Submit — check then submit
app.post('/api/smart-submit', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }

  const unique = [...new Set(urls.map(u => u.trim()).filter(u => u.startsWith('http')))];
  const duplicatesRemoved = urls.length - unique.length;

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
      duplicatesRemoved,
      alreadyIndexed: 0,
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
    const results = urls.map(url => ({
      url,
      status: 'queued',
      message: 'Add GOOGLE_SERVICE_ACCOUNT env variable to enable real indexing',
      creditsUsed: 3
    }));
    return res.json({ success: true, results, mode: 'demo' });
  }

  // Real Google Indexing API
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({
      credentials: keyData,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });
    const client = await auth.getClient();
    const results = [];

    for (const url of urls) {
      try {
        const response = await client.request({
          url: 'https://indexing.googleapis.com/v3/urlNotifications:publish',
          method: 'POST',
          data: { url: url.trim(), type: 'URL_UPDATED' }
        });
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

app.listen(PORT, () => {
  console.log('IndexPro Backend running on port ' + PORT);
});
