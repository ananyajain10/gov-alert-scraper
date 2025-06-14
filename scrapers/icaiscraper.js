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

      $('.shadow ul.list-group li.list-group-item a').each((i, el) => {
        const rawText = $(el).text().trim();
        const href = $(el).attr('href');
        const link = href.startsWith('http') ? href : 'https://www.icai.org' + href;
        const dateMatch = rawText.match(/\((\d{2}-\d{2}-\d{4})\)$/);
        const date = dateMatch ? dateMatch[1] : 'Unknown';
        const title = rawText.replace(/\s*-\s*\(\d{2}-\d{2}-\d{4}\)$/, '').trim();
        items.push({ title, link, date });
      });

      if (!items.length) return console.log(`⚠️ No notices on ${name}`);

      const latest = items[0];
      let lastSeen = null;
      if (fs.existsSync(STORAGE_FILE)) {
        lastSeen = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      }

      const newIndex = items.findIndex(item => item.link === lastSeen?.link);
      const newItems = newIndex === -1 ? items : items.slice(0, newIndex);

      for (let i = newItems.length - 1; i >= 0; i--) {
        const n = newItems[i];
        const msg = `📢 *New ICAI Notification*\n\n*Title:* ${n.title}\n📅 *Date:* ${n.date}\n🔗 [Open](${n.link})`;
        await sendToTelegram(msg);
        await delay();
      }

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(latest, null, 2));
    } catch (err) {
      console.error(`❌ ICAI Scraper Error:`, err.message);
    }
  }
};
