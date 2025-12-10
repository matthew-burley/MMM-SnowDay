const NodeHelper = require("node_helper");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-SnowDay helper started");

    this.maxRetries = 3;
    this.latestPostal = null;

    // hourly refresh
    setInterval(() => {
      if (this.latestPostal) {
        this.scrapeSnowPercent(this.latestPostal).then(result => {
          this.sendSocketNotification("SNOW_PERCENT", result);
        });
      }
    }, 60 * 60 * 1000);
  },

  async scrapeSnowPercent(postalCode, attempt = 1) {
    let browser;

    try {
      // Use system chromium for ARM
      browser = await puppeteer.launch({
        headless: true,
        executablePath: "/usr/bin/chromium-browser",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/121.0.0.0 Safari/537.36"
      );

      // Load homepage
      await page.goto('https://www.snowdaypredictor.com/', {
        waitUntil: 'networkidle2',
        timeout: 300000  // 5 minutes
      });

      const inputSelector =
        'input[placeholder="Search your City, ZIP Code or Postal Code..."]';

      await page.waitForSelector(inputSelector, { timeout: 300000 });

      // type postal code
      await page.focus(inputSelector);
      await page.click(inputSelector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type(inputSelector, postalCode, { delay: 250 });

      // click "Calculate"
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === 'Calculate');
        if (btn) btn.click();
      });

      // Wait for navigation OR AJAX load
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 300000 }),
        delay(4000) // sometimes no full navigation occurs; fall back after a bit
      ]);

      // Now wait dynamically until we actually SEE something like "75%"  
      await page.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll("span"));
        return spans.some(s => /^\d+%$/.test(s.textContent.trim()));
      }, { timeout: 300000 });

      // extract percent
      const percent = await page.evaluate(() => {
        const span = Array.from(document.querySelectorAll('span'))
          .find(s => /^\d+%$/.test(s.textContent.trim()));
        return span ? span.textContent.trim() : 'N/A';
      });

      // extract city
      const city = await page.evaluate(() => {
        const h1 = Array.from(document.querySelectorAll('h1'))
          .find(h => h.textContent.includes("Chance of a snow day in"));
        if (!h1) return '';
        return h1.textContent.trim().split(" in ").pop().split(",")[0].trim();
      });

      return { percent, city };

    } catch (err) {
      console.error(`Attempt ${attempt} scrape error:`, err.message);

      if (attempt < this.maxRetries) {
        console.log(`Retrying scrape (attempt ${attempt + 1})...`);
        await delay(3000);
        return this.scrapeSnowPercent(postalCode, attempt + 1);
      }

      return { percent: "N/A", city: "" };

    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "GET_SNOW_PERCENT") {
      const postalCode = payload.postalCode;
      this.latestPostal = postalCode;
      this.scrapeSnowPercent(postalCode).then(result => {
        this.sendSocketNotification("SNOW_PERCENT", result);
      });
    }
  }
});
