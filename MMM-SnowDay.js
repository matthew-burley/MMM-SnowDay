Module.register("MMM-SnowDay", {
  // default settings for the module
  defaults: {
    postalCode: "H3C 5L2",        // postal code to check (Go Habs Go!)
    city: "",                    // optional manual city name
    updateInterval: 60 * 60 * 1000, // updates every hour
    initialDelay: 15000             // delays on startup to avoid RPi boot congestion
  },

  // loads the CSS file associated with this module
  getStyles() {
    return ["snowday.css"];
  },

  // called once when the module is loaded
  start() {
    console.log("MMM-SnowDay module started");

    this.cityName = "";       // gets populated after the first fetch
    this.templateContent = ""; // rendered percent block

    // delays the first request so the mirror finishes animating its boot
    setTimeout(() => {
      this.updateSnowDay();

      // schedules hourly updates after the first one completes
      setInterval(() => this.updateSnowDay(), this.config.updateInterval);

    }, this.config.initialDelay);
  },

  // triggers the backend helper to fetch new data
  updateSnowDay() {
    this.sendSocketNotification("GET_SNOW_PERCENT", {
      postalCode: this.config.postalCode.trim() // cleaned in case user entered extra spaces
    });
  },

  // processes notifications sent back from the node_helper
  socketNotificationReceived(notification, payload) {
    if (notification === "SNOW_PERCENT") {
      // fallback if city name not provided
      this.cityName = payload.city || "";

      // strip off % sign and convert to a number
      const rawValue = payload.percent.replace("%", "").trim();
      let value = parseFloat(rawValue);

      // chooose color class based on seriousness of the snow chance
      let colorClass = "snow-red"; // no chance (default color)
      if (!isNaN(value)) {
        if (value >= 90) colorClass = "snow-green";   // very high chance
        else if (value >= 70 && value <=89) colorClass = "snow-blue"; // high chance
        else if (value >= 50 && value <=69) colorClass = "snow-purple"; // moderate chance
        else if (value >= 30 && value <=49) colorClass = "snow-orange"; // mild chance
      }

      // builds the visual block that gets rendered
      this.templateContent = `
        <span class="snowflake">❄</span>
        <span class="${colorClass}">${payload.percent}</span>
        <span class="snowflake">❄</span>
      `;

      // triggers MagicMirror to re-render our module
      this.updateDom();
    }
  },

  // builds the DOM for display on screen
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "snow-wrapper";

    // title changes depending on whether a city name is available
    const titleText = this.cityName
      ? `Snow Day in ${this.cityName} Tomorrow?`
      : `Snow Day Tomorrow?`;

    // puts HTML directly into the wrapper
    wrapper.innerHTML = `
      <div class="snow-title">${titleText}</div>
      <div class="snow-percent">${this.templateContent || "❄snow❄"}</div>
    `;

    return wrapper;
  }
});
