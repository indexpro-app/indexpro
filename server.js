const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'IndexPro Backend OK', version: '1.0.0' });
});

app.post('/api/check-index', (req, res) => {
  const { urls } = req.body;
  if (!urls) return res.status(400).json({ error: 'urls required' });
  const results = urls.map(url => ({ url, status: 'pending', checkedAt: new Date().toISOString() }));
  res.json({ success: true, results });
});

app.post('/api/submit', (req, res) => {
  const { urls } = req.body;
  if (!urls) return res.status(400).json({ error: 'urls required' });
  const results = urls.map(url => ({ url, status: 'queued', creditsUsed: 3 }));
  res.json({ success: true, results, mode: 'demo' });
});

app.listen(PORT, () => console.log('IndexPro running on port ' + PORT));
