Module.register("MMM-SnowDay", {
  // Default settings for the module
  defaults: {
    postalCode: "H3C 5L2",        // Postal code to check
    city: "",                    // Optional manual city name
    updateInterval: 60 * 60 * 1000, // Update every hour
    initialDelay: 15000             // Delay on startup to avoid Pi boot congestion
  },

  // Load the CSS file associated with this module
  getStyles() {
    return ["snowday.css"];
  },

  // Called once when the module is loaded
  start() {
    console.log("MMM-SnowDay module started");

    this.cityName = "";       // Will be populated after the first fetch
    this.templateContent = ""; // Holds the rendered percent block

    // Delay the first request so the mirror finishes animating its boot
    setTimeout(() => {
      this.updateSnowDay();

      // Schedule hourly updates after the first one completes
      setInterval(() => this.updateSnowDay(), this.config.updateInterval);

    }, this.config.initialDelay);
  },

  // Trigger the backend helper to fetch new data
  updateSnowDay() {
    this.sendSocketNotification("GET_SNOW_PERCENT", {
      postalCode: this.config.postalCode.trim() // Cleaned in case user entered extra spaces
    });
  },

  // Process notifications sent back from the Node helper
  socketNotificationReceived(notification, payload) {
    if (notification === "SNOW_PERCENT") {
      // Some results include a city name; fallback if not provided
      this.cityName = payload.city || "";

      // Strip off the % sign and convert to a number
      const rawValue = payload.percent.replace("%", "").trim();
      let value = parseFloat(rawValue);

      // Pick a color class based on seriousness of the snow chance
      let colorClass = "snow-red"; // Default color (No chance)
      if (!isNaN(value)) {
        if (value >= 90) colorClass = "snow-green";   // Very high chance
        else if (value >= 70 && value <=89) colorClass = "snow-blue"; // High chance
        else if (value >= 50 && value <=69) colorClass = "snow-purple"; // Moderate chance
        else if (value >= 30 && value <=49) colorClass = "snow-orange"; // Mild chance
      }

      // Build the visual block that gets rendered
      this.templateContent = `
        <span class="snowflake">❄</span>
        <span class="${colorClass}">${payload.percent}</span>
        <span class="snowflake">❄</span>
      `;

      // Trigger MagicMirror to re-render our module
      this.updateDom();
    }
  },

  // Build the DOM for display on screen
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "snow-wrapper";

    // Title changes depending on whether a city name is available
    const titleText = this.cityName
      ? `Snow Day Chance in ${this.cityName}`
      : `Snow Day Chance`;

    // Insert HTML directly into the wrapper
    wrapper.innerHTML = `
      <div class="snow-title">${titleText}</div>
      <div class="snow-percent">${this.templateContent || "...wishing hard..."}</div>
    `;

    return wrapper;
  }
});
