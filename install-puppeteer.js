import puppeteer from 'puppeteer';

(async () => {
  try {
    console.log('📥 Downloading Chromium...');
    await puppeteer.createBrowserFetcher().download(puppeteer.defaultBrowserRevision);
    console.log('✅ Chromium downloaded');
  } catch (err) {
    console.error('❌ Chromium download failed:', err);
    process.exit(1);
  }
})();
