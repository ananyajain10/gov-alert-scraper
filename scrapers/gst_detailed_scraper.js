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
  }
};

const getRenderedHTML = async (url) => {
  // Configure Puppeteer for different environments
  const launchOptions = {
    headless: "new", // Use new headless mode to avoid deprecation warning
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ],
  };

  // Try different Chrome paths for different environments
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/opt/render/project/.cache/puppeteer/chrome/linux-*/chrome-linux*/chrome'
  ];

  // Only set executablePath if we're in production or if PUPPETEER_EXECUTABLE_PATH is set
  if (process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.PUPPETEER_EXECUTABLE_PATH) {
    const fs = require('fs');
    
    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        launchOptions.executablePath = chromePath;
        console.log(`🔍 Using Chrome at: ${chromePath}`);
        break;
      }
    }
    
    // If no Chrome found, let Puppeteer use its bundled Chromium
    if (!launchOptions.executablePath) {
      console.log('⚠️ No system Chrome found, using Puppeteer bundled Chromium');
      delete launchOptions.executablePath;
    }
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    
    // Set user agent to avoid being blocked
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for advisory container to appear
    await page.waitForSelector('#nws-items li.news-item-dtl', { timeout: 15000 });

    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
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
        await sendToTelegram({
          title: n.title,
          date: n.date,
          tags: n.tags,
          summary: n.summary,
          url: url
        });
        await delay();
      }

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(latest, null, 2));
      console.log(`✅ Saved latest GST advisory: ${latest.title.slice(0, 50)}...`);

    } catch (err) {
      console.error(`❌ GST Detailed Scraper Error:`, err.stack || err.message);
    }
  }
};