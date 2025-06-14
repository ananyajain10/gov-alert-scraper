const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim())
  : [];


const STORAGE_DIR = path.join(__dirname, '..', 'latest_saved');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

const delay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * 2000) + 1000));


function escapeMarkdown(text = '') {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, ch => `\\${ch}`);
}

const sendToTelegram = async ({ title, date, tags, summary, url }) => {
  const msg = `📢 *New GST Advisory*\n\n📝 *Title:* ${escapeMarkdown(title)}\n📅 *Date:* ${escapeMarkdown(date)}\n🏷 *Tags:* ${escapeMarkdown(tags || 'None')}\n\n📄 *Summary:*\n${escapeMarkdown(summary || 'No summary.')}\n\n🔗 [View Advisory](${url})`;

  const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  for (const chatId of CHAT_IDS) {
  try {
    await axios.post(apiUrl, {
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown'
    });
    console.log('📤 Sent to Telegram');
  } catch (err) {
    console.error('❌ Telegram Error:', err.response?.data || err.message);
  }
};
}

const getRenderedHTML = async (url) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // ✅ Wait for advisory container to appear
  await page.waitForSelector('#nws-items li.news-item-dtl', { timeout: 15000 });

  const html = await page.content();
  await browser.close();
  return html;
};

module.exports = {
  run: async (url, name) => {
    const STORAGE_FILE = path.join(STORAGE_DIR, `${name}.json`);

    try {
      const html = await getRenderedHTML(url);
    
      const $ = cheerio.load(html);
      const items = [];

      console.log('🔍 Parsing GST advisories...');
      $('#nws-items > li.news-item-dtl').each((_, item) => {
        const title = $(item).find('h3.news-item--header').text().trim();
        const summary = $(item).find('p.news-item--brieftext span').text().trim().replace(/\s+/g, ' ');
        const date = $(item).find('p.news-item--date').text().trim() || 'Unknown';
        const tags = $(item).find('ul.news-item--tags li .tag-btn')
          .map((i, tag) => $(tag).text().trim()).get().join(', ');

        if (title) {
          items.push({ title, summary, date, tags, link: url });
        }
      });

      console.log(`📄 Found ${items.length} advisories`);

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
        const msg = `📢 *New GST Advisory*\n\n📝 *Title:* ${n.title}\n📅 *Date:* ${n.date}\n🏷 *Tags:* ${n.tags || 'None'}\n\n📄 *Summary:*\n${n.summary || 'No summary.'}\n\n🔗 [View Advisory](${url})`;
        await sendToTelegram(msg);
        await delay();
      }

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(latest, null, 2));
      console.log(`✅ Saved latest GST advisory: ${latest.title.slice(0, 50)}...`);

    } catch (err) {
      console.error(`❌ GST Detailed Scraper Error:`, err.stack || err.message);
    }
  }
};
