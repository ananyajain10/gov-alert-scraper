const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim())
  : [];


const STORAGE_DIR = path.join(__dirname, '..', 'latest_saved');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

const delay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * 2000) + 1000));

const sendToTelegram = async (msg) => {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  for (const chatId of CHAT_IDS) {
  await axios.post(url, {
    chat_id: chatId,
    text: msg,
    parse_mode: 'Markdown'
  });
};
}

module.exports = {
  run: async (url, name) => {
    const STORAGE_FILE = path.join(STORAGE_DIR, `${name}.json`);

    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const items = [];

      $('.view-content .views-row').each((_, el) => {
        const date = $(el).find('.up-date').text().trim();
        const description = $(el).find('.gry-ft p').first().text().trim();
        const link = $(el).find('a[href^="http"]').attr('href') || null;
        if (description && date) items.push({ date, description, link });
      });

      if (!items.length) return console.log(`⚠️ No notices on ${name}`);

      const latest = items[0];
      let lastSeen = null;
      if (fs.existsSync(STORAGE_FILE)) {
        lastSeen = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      }

      const newIndex = items.findIndex(item => item.description === lastSeen?.description);
      const newItems = newIndex === -1 ? items : items.slice(0, newIndex);

      for (let i = newItems.length - 1; i >= 0; i--) {
        const n = newItems[i];
        const msg = `📢 *New Income Tax Notice*\n\n📅 *Date:* ${n.date}\n📝 ${n.description}\n${n.link ? `🔗 [View](${n.link})` : ''}`;
        await sendToTelegram(msg);
        await delay();
      }

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(latest, null, 2));
    } catch (err) {
      console.error(`❌ Income Tax Scraper Error:`, err.message);
    }
  }
};
