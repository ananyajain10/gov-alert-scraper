const express = require('express');
const cron = require('node-cron');
const path = require('path');
const sources = require('./sources.json');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('✅ Scraper service is running and listening for cron triggers.');
});

const runScrapers = async () => {
  console.log(`\n⏱️ Scraper run started at ${new Date().toLocaleString()}`);
  
  for (const source of sources) {
    try {
      const scraper = require(`./scrapers/${source.scraper}`);
      console.log(`🔍 Scraping: ${source.name}`);
      await scraper.run(source.url, source.name);
    } catch (err) {
      console.error(`❌ Error scraping ${source.name}:`, err.stack || err.message);
    }
  }

  console.log(`✅ Scraper run finished at ${new Date().toLocaleString()}`);
};

// Run immediately on startup
runScrapers();

// Schedule every 10 minutes
cron.schedule('*/10 * * * *', runScrapers);

app.listen(PORT, () => {
  console.log(`🚀 Web server running at http://localhost:${PORT}`);
});
