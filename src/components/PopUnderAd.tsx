"use client";

const POP_UNDER_SCRIPT_SRC = "https://pl28480662.effectivegatecpm.com/5b/9e/bf/5b9ebf11a1c5d7a7e97f435c53621ae2.js";
const POP_UNDER_SCRIPT_ID = "pop-under-ad-script";
const POP_UNDER_FREQUENCY_KEY = "popUnderAdLastShown";
const POP_UNDER_FREQUENCY_MS = 60 * 60 * 1000;

export function showPopUnder() {
  if (typeof window === "undefined") {
    return;
  }

  const lastShown = localStorage.getItem(POP_UNDER_FREQUENCY_KEY);
  if (lastShown) {
    const lastShownTime = Number.parseInt(lastShown, 10);
    if (Number.isFinite(lastShownTime)) {
      const timeSinceLastAd = Date.now() - lastShownTime;
      if (timeSinceLastAd < POP_UNDER_FREQUENCY_MS) {
        return;
      }
    }
  }

  const existingScript = document.getElementById(POP_UNDER_SCRIPT_ID);
  if (existingScript) {
    existingScript.remove();
  }

  const script = document.createElement("script");
  script.id = POP_UNDER_SCRIPT_ID;
  script.src = POP_UNDER_SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);

  localStorage.setItem(POP_UNDER_FREQUENCY_KEY, Date.now().toString());
}
