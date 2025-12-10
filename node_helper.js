const NodeHelper = require("node_helper");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// simple async delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-SnowDay helper started");

    this.odometerDelay = 12000; // wait for animation
    this.maxRetries = 3; // max retries
    this.latestPostal = null; // last postal code

    // refresh hourly
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
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ]
      });

      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/121.0.0.0 Safari/537.36"
      );

      // go to main page
      await page.goto('https://www.snowdaypredictor.com/', { waitUntil: 'networkidle2' });

      const inputSelector = 'input[placeholder="Search your City, ZIP Code or Postal Code..."]';
      await page.waitForSelector(inputSelector, { timeout: 20000 });

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

      // wait for result animation
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 40000 });
      await delay(this.odometerDelay);

      // scrape percent
      const percent = await page.evaluate(() => {
        const span = Array.from(document.querySelectorAll('span'))
          .find(s => /^\d+%$/.test(s.textContent.trim()));
        return span ? span.textContent.trim() : 'N/A';
      });

      // scrape city
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
        await delay(this.odometerDelay);
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
