const cron = require('node-cron');
const path = require('path');
const sources = require('./sources.json');

const runScrapers = async () => {
  console.log(`\n⏱️ Scraper run started at ${new Date().toLocaleString()}`);
  
  for (const source of sources) {
    try {
      const scraper = require(`./scrapers/${source.scraper}`);
      console.log(`🔍 Scraping: ${source.name}`);
      await scraper.run(source.url, source.name);  // Pass URL + name
    } catch (err) {
      console.error(`❌ Error scraping ${source.name}:`, err.message);
    }
  }

  console.log(`✅ Scraper run finished at ${new Date().toLocaleString()}`);
};

// Run immediately on startup
runScrapers();

// Schedule every 10 minutes
cron.schedule('*/10 * * * *', runScrapers);
