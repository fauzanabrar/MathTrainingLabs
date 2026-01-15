"use client";

const POP_UNDER_SCRIPT_SRC = "https://pl28480662.effectivegatecpm.com/5b/9e/bf/5b9ebf11a1c5d7a7e97f435c53621ae2.js";
const POP_UNDER_SCRIPT_ID = "pop-under-ad-script";

let scriptInjected = false;

export function showPopUnder() {
  if (typeof window === "undefined" || scriptInjected) {
    return;
  }
  
  // Check if the script element already exists to prevent re-injection on SPA navigation
  if (document.getElementById(POP_UNDER_SCRIPT_ID)) {
    scriptInjected = true; // Mark as injected for current page context
    return;
  }

  const script = document.createElement("script");
  script.id = POP_UNDER_SCRIPT_ID;
  script.src = POP_UNDER_SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
  
  scriptInjected = true;
}