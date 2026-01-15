"use client";

const POP_UNDER_SCRIPT_SRC = "https://pl28480662.effectivegatecpm.com/5b/9e/bf/5b9ebf11a1c5d7a7e97f435c53621ae2.js";
const POP_UNDER_SCRIPT_ID = "pop-under-ad-script";
const POP_UNDER_FREQUENCY_KEY = "popUnderAdLastShown";
const POP_UNDER_FREQUENCY_MS = 300000; // 300 seconds minimum between pop-under ads

export function showPopUnder() {
  if (typeof window === "undefined") {
    return;
  }
  
  // Check frequency - don't show more than once every 30 seconds
  const lastShown = localStorage.getItem(POP_UNDER_FREQUENCY_KEY);
  if (lastShown) {
    const lastShownTime = parseInt(lastShown, 10);
    const timeSinceLastAd = Date.now() - lastShownTime;
    if (timeSinceLastAd < POP_UNDER_FREQUENCY_MS) {
      return; // Too soon to show another ad
    }
  }
  
  // Check if the script element already exists to prevent re-injection
  if (document.getElementById(POP_UNDER_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = POP_UNDER_SCRIPT_ID;
  script.src = POP_UNDER_SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
  
  // Record when we showed this ad
  localStorage.setItem(POP_UNDER_FREQUENCY_KEY, Date.now().toString());
}