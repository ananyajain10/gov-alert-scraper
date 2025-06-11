const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE_URL = 'https://doe.gov.in';

const STORAGE_DIR = path.join(__dirname, '..', 'latest_saved');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

const delay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * 2000) + 1000));

const sendToTelegram = async (msg) => {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: CHAT_ID,
    text: msg,
    parse_mode: 'Markdown'
  });
};

module.exports = {
  run: async (url, name) => {
    const STORAGE_FILE = path.join(STORAGE_DIR, `${name}.json`);

    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const $ = cheerio.load(data);
      const rows = $('tr.list-item');
      const items = [];

      rows.each((_, row) => {
        const title = $(row).find('.views-field-title').text().trim();
        const memo = $(row).find('.views-field-field-office-memorandum-no-').text().trim();
        const date = $(row).find('time').attr('datetime')?.split('T')[0] || 'Unknown';
        const relativeLink = $(row).find('.views-field-field-circulars-document a').attr('href') || '';
        const link = relativeLink.startsWith('http') ? relativeLink : `${BASE_URL}${relativeLink}`;

        if (title && link) {
          items.push({ title, memo, date, link });
        }
      });

      if (!items.length) return console.log(`⚠️ No circulars found on ${name}`);

      const latest = items[0];
      let lastSeen = null;
      if (fs.existsSync(STORAGE_FILE)) {
        lastSeen = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      }

      const newIndex = items.findIndex(item => item.link === lastSeen?.link);
      const newItems = newIndex === -1 ? items : items.slice(0, newIndex);

      for (let i = newItems.length - 1; i >= 0; i--) {
        const c = newItems[i];
        const msg = `📢 *New DOE Circular*\n\n📄 *Title:* ${c.title}\n🗂 *Memo No:* ${c.memo}\n📅 *Date:* ${c.date}\n🔗 [Download PDF](${c.link})`;
        await sendToTelegram(msg);
        await delay();
      }

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(latest, null, 2));
      console.log(`✅ Saved latest DOE circular: ${latest.title.slice(0, 50)}...`);

    } catch (err) {
      console.error(`❌ DOE Scraper Error:`, err.message);
    }
  }
};
