const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
      const items = [];

      $('#nws-contnr > li.news-item--container').each((_, container) => {
        const month = $(container).find('p.month-cat').first().text().trim();
        console.log('🧩 Found containers:', container);
        $(container).find('ul.news-item-dtls div.news-item-dtl-wrapper').each((_, el) => {
          const title = $(el).find('h3.news-item--header').text().trim();
          const summary = $(el).find('p.news-item--brieftext').text().trim().replace(/\s+/g, ' ');
          const date = $(el).find('p.news-item--date').text().trim() || month || 'Unknown';
          const tags = $(el).find('ul.news-item--tags li .tag-btn')
                          .map((i, t) => $(t).text().trim()).get().join(', ');

          if (title) {
            items.push({ title, summary, date, tags, link: url });
          }
        });
      });

      if (!items.length) {
        console.log(`⚠️ No advisories found on ${name}`);
        return;
      }

      const latest = items[0];
      let lastSeen = null;
      if (fs.existsSync(STORAGE_FILE)) {
        lastSeen = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      }

      const newIndex = items.findIndex(item => item.title === lastSeen?.title);
      const newItems = newIndex === -1 ? items : items.slice(0, newIndex);

      if (!newItems.length) {
        console.log(`✅ No new advisories for ${name}`);
        return;
      }

      for (let i = newItems.length - 1; i >= 0; i--) {
        const n = newItems[i];
        const msg = `📢 *New GST Advisory*\n\n📝 *Title:* ${n.title}\n📅 *Date:* ${n.date}\n🏷 *Tags:* ${n.tags || 'None'}\n\n📄 *Summary:*\n${n.summary || 'No summary.'}\n\n🔗 [View All](${url})`;

        await sendToTelegram(msg);
        await delay();
      }

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(latest, null, 2));
      console.log(`✅ Saved latest GST advisory: ${latest.title.slice(0, 50)}...`);

    } catch (err) {
      console.error(`❌ GST Detailed Scraper Error:`, err.message);
    }
  }
};
