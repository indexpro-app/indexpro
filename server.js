const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({ 
    status: 'IndexPro Backend Running ✅',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// ── CHECK IF URL IS INDEXED ──
// Uses Google Custom Search or simple fetch check
app.post('/api/check-index', async (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }

  const results = [];

  for (const url of urls) {
    try {
      // Check via Google search "site:" query simulation
      // In production: use Google Search Console API
      const encoded = encodeURIComponent(url);
      
      // Simple HTTP check - is the URL alive?
      const axios = require('axios');
      let httpStatus = 'unknown';
      let isAlive = false;
      
      try {
        const response = await axios.get(url, { 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IndexProBot/1.0)' },
          validateStatus: () => true
        });
        httpStatus = response.status;
        isAlive = response.status === 200;
      } catch(e) {
        httpStatus = 404;
        isAlive = false;
      }

      results.push({
        url,
        alive: isAlive,
        httpStatus,
        // Indexing status - requires Google Search Console API with credentials
        // For now returns pending until GSC is connected
        indexStatus: isAlive ? 'pending_check' : 'dead',
        checkedAt: new Date().toISOString()
      });

    } catch (err) {
      results.push({ url, error: err.message, indexStatus: 'error' });
    }
  }

  res.json({ success: true, results });
});

// ── SUBMIT URL TO GOOGLE INDEXING API ──
app.post('/api/submit', async (req, res) => {
  const { urls, serviceAccountKey } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }

  // Check if service account key is provided
  const keyData = serviceAccountKey || 
    (process.env.GOOGLE_SERVICE_ACCOUNT ? 
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : null);

  if (!keyData) {
    // Return mock response if no credentials yet
    const results = urls.map(url => ({
      url,
      status: 'queued',
      message: 'Connect Google Search Console to enable real indexing',
      creditsUsed: 3
    }));
    return res.json({ 
      success: true, 
      results,
      note: 'Add GOOGLE_SERVICE_ACCOUNT env variable to enable real indexing'
    });
  }

  // Real Google Indexing API submission
  try {
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
          data: {
            url: url,
            type: 'URL_UPDATED'
          }
        });
        results.push({ 
          url, 
          status: 'submitted', 
          response: response.data,
          creditsUsed: 3
        });
      } catch (err) {
        results.push({ 
          url, 
          status: 'failed', 
          error: err.message,
          creditsUsed: 0
        });
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SMART SUBMIT — CHECK THEN SUBMIT ──
app.post('/api/smart-submit', async (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls array required' });
  }

  // Deduplicate
  const unique = [...new Set(urls.map(u => u.trim()).filter(u => u.startsWith('http')))];
  
  const axios = require('axios');
  const alreadyIndexed = [];
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
        // In real version: check GSC API for index status
        // For now: alive = needs indexing check
        needIndexing.push(url);
      }
    } catch(e) {
      deadLinks.push(url);
    }
  }

  const creditsRequired = needIndexing.length * 3;

  res.json({
    success: true,
    analysis: {
      total: unique.length,
      duplicatesRemoved: urls.length - unique.length,
      alreadyIndexed: alreadyIndexed.length,
      needIndexing: needIndexing.length,
      deadLinks: deadLinks.length,
      creditsRequired
    },
    urls: {
      needIndexing,
      deadLinks,
      alreadyIndexed
    }
  });
});

// ── GET CAMPAIGN STATS ──
app.get('/api/campaigns', (req, res) => {
  // In production: fetch from database
  res.json({
    success: true,
    message: 'Connect a database to store campaigns',
    campaigns: []
  });
});

app.listen(PORT, () => {
  console.log(`IndexPro Backend running on port ${PORT}`);
});
