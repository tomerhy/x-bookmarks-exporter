/**
 * Google Analytics 4 - Measurement Protocol for Chrome Extensions
 * 
 * To set up:
 * 1. Go to Google Analytics > Admin > Data Streams > Your Stream
 * 2. Copy the Measurement ID (G-XXXXXXXXXX)
 * 3. Click "Measurement Protocol API secrets" and create a new secret
 * 4. Replace the values below
 */

const GA_MEASUREMENT_ID = "G-4B1JXY3KZE"; // Replace with your GA4 Measurement ID
const GA_API_SECRET = "hS-itJ0vQliKfeMelVw97Q"; // Replace with your GA4 API Secret

const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// Generate or retrieve a persistent client ID
const getClientId = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get({ analyticsClientId: null }, (data) => {
      if (data.analyticsClientId) {
        resolve(data.analyticsClientId);
        return;
      }
      const clientId = crypto.randomUUID();
      chrome.storage.local.set({ analyticsClientId: clientId });
      resolve(clientId);
    });
  });
};

// Get extension version
const getVersion = () => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "unknown";
  }
};

// Send event to GA4
const sendEvent = async (eventName, params = {}) => {
  // Skip if not configured
  if (GA_MEASUREMENT_ID === "G-XXXXXXXXXX" || GA_API_SECRET === "XXXXXXXXXX") {
    console.debug("[Analytics] Not configured, skipping:", eventName, params);
    return;
  }

  try {
    const clientId = await getClientId();
    const payload = {
      client_id: clientId,
      events: [
        {
          name: eventName,
          params: {
            ...params,
            extension_version: getVersion(),
            engagement_time_msec: 100,
          },
        },
      ],
    };

    await fetch(GA_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.debug("[Analytics] Error sending event:", error);
  }
};

// Track page view
const trackPageView = (pageName) => {
  sendEvent("page_view", {
    page_title: pageName,
    page_location: pageName,
  });
};

// Track button click
const trackButtonClick = (buttonName, context = "popup") => {
  sendEvent("button_click", {
    button_name: buttonName,
    context: context,
  });
};

// Track feature usage
const trackFeatureUsage = (featureName, details = {}) => {
  sendEvent("feature_usage", {
    feature_name: featureName,
    ...details,
  });
};

// Export for use in other scripts
window.Analytics = {
  trackPageView,
  trackButtonClick,
  trackFeatureUsage,
  sendEvent,
};
