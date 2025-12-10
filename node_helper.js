const NodeHelper = require("node_helper");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// simple async delay helper for timing animations & retry backoffs
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-SnowDay helper started");

    // time in ms to wait for SnowDayPredictor’s odometer animation to finish,
    // site animates digits so scraping too early returns empty values
    this.odometerDelay = 12000;

    // max number of retry attempts for a failed scrape
    this.maxRetries = 3;

    // last postal code requested, used for hourly auto-refresh
    this.latestPostal = null;

    // refresh every hour using whatever postal code was last requested
    setInterval(() => {
      if (this.latestPostal) {
        this.scrapeSnowPercent(this.latestPostal).then(result => {
          this.sendSocketNotification("SNOW_PERCENT", result);
        });
      }
    }, 60 * 60 * 1000);
  },

  // core scraping function using Puppeteer.
  // handles retries, browser flags, and animation timing
  async scrapeSnowPercent(postalCode, attempt = 1) {
    let browser;

    try {
      // launch Chromium via Puppeteer
      browser = await puppeteer.launch({
        headless: true, // set to false for debugging
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ]
      });

      const page = await browser.newPage();

      // sets realistic User-Agent to avoid bot detection
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/121.0.0.0 Safari/537.36"
      );

      // load the main page
      await page.goto('https://www.snowdaypredictor.com/', { waitUntil: 'networkidle2' });

      // wait for input to be ready
      const inputSelector = 'input[placeholder="Search your City, ZIP Code or Postal Code..."]';
      await page.waitForSelector(inputSelector, { timeout: 20000 });

      // focus and clear input
      await page.focus(inputSelector);
      await page.click(inputSelector, { clickCount: 3 });
      await page.keyboard.press('Backspace');

      // type postal code slowly so JS registers the full code
      await page.type(inputSelector, postalCode, { delay: 250 });

      // click the "Calculate" button specifically
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === 'Calculate');
        if (btn) btn.click();
      });

      // wait for navigation to the city page
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 40000 });

      // wait for odometer animation to finish
      await delay(this.odometerDelay);

      // scrape percent
      const digits = await page.$$eval(
        '[class*="text-[17cqw]"]',
        els => els.map(e => e.textContent.trim()).filter(x => x !== "")
      );

      if (!digits || digits.length === 0) {
        throw new Error("No odometer digits found");
      }

      const percent = digits.join("") + "%";

      // scrape city from "Chance of a snow day in _" in h1.uppercase
      let city = "";
      try {
        city = await page.$eval(
          "h1.uppercase",
          el => {
            const t = el.textContent.trim();
            const idx = t.lastIndexOf(" in ");
            if (idx === -1) return "";
            const after = t.slice(idx + 4).trim();
            return after.split(",")[0].trim();
          }
        );
      } catch (_) {
        city = "";
      }

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

  // receives front-end notifications and triggers scraping when needed
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
