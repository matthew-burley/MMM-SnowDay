const NodeHelper = require("node_helper");
const { chromium } = require("playwright");

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

  // core scraping function using Playwright.
  // handles retries, browser flags, and animation timing
  async scrapeSnowPercent(postalCode, attempt = 1) {
    const url = `https://snowdaypredictor.com/result/${encodeURIComponent(postalCode)}`;
    let browser;

    try {
      // launch Chromium with flags tailored for RPi reliability
      browser = await chromium.launch({
        headless: true,

        // hard-coded Chromium path typically used on RPi OS (might not be needed but I needed it)
        executablePath: "/usr/bin/chromium-browser",

        // Chromium arguments chosen to reduce memory use and avoid GPU issues on RPi
        args: [
          "--no-sandbox",               // required when running Chromium without root privileges
          "--disable-setuid-sandbox",   // stops Chromium from attempting to use elevated privileges
          "--disable-gpu",              // Pi GPU acceleration is unstable (headless mode doesn’t need it anyway)
          "--disable-software-rasterizer", // avoids slow CPU fallback for GPU tasks
          "--disable-dev-shm-usage",    // stops crashes when /dev/shm has limited space (common on RPi)
          "--single-process",           // reduces RAM usage by forcing Chromium to run in one process
          "--no-zygote"                 // needed for single-process mode stability in Linux 
        ]
      });

      // creates a full realistic User-Agent string to avoid being detected as automation
      const context = await browser.newContext({
        userAgent:
          // identifies as a modern Chrome on Windows preventing degraded render paths
          // and ensuring SnowDayPredictor loads all animations normally.
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/121.0.0.0 Safari/537.36"
      });

      const page = await context.newPage();

      // loads the result page, uses a generous timeout since my RPi is slow
      await page.goto(url, {
        waitUntil: "load", // makes sure network activity is complete not just DOMContentLoaded
        timeout: 90000
      });

      // waits for the animated odometer to settle before scraping digits
      await delay(this.odometerDelay);

      // extracts visible odometer digits that appear as separate elements
      const digits = await page.$$eval(
        ".odometer-inside .odometer-value",
        els => els.map(e => e.textContent.trim()).filter(x => x !== "")
      );

      // if the digit list is empty the animation or selector failed (error handling)
      if (!digits || digits.length === 0) {
        throw new Error("No odometer digits found");
      }

      // combines digits into "##%" format. Example: ["8", "7"] → "87%"
      const percent = digits.join("") + "%";

      // tries to grab the city
      let city = "";
      try {
        city = await page.$eval(
          ".result-header h1 span:nth-child(2)",
          el => el.textContent.trim()
        );
      } catch (_) {
        city = ""; // silent fallback
      }

      return { percent, city };

    } catch (err) {
      console.error(`Attempt ${attempt} scrape error:`, err.message);

      // retry with backoff unless reached the limit
      if (attempt < this.maxRetries) {
        console.log(`Retrying scrape (attempt ${attempt + 1})...`);
        await delay(this.odometerDelay);
        return this.scrapeSnowPercent(postalCode, attempt + 1);
      }

      // final fallback result after all retries fail
      return { percent: "N/A", city: "" };

    } finally {
      // makes sure Chromium closes right
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  },

  // receives front-end notifications and trigger scraping when needed.
  socketNotificationReceived(notification, payload) {
    if (notification === "GET_SNOW_PERCENT") {
      const postalCode = payload.postalCode;

      // stores PostalCode so hourly refresh knows what to scrape
      this.latestPostal = postalCode;

      // does the scrape and returns the result to the front-end
      this.scrapeSnowPercent(postalCode).then(result => {
        this.sendSocketNotification("SNOW_PERCENT", result);
      });
    }
  }
});
