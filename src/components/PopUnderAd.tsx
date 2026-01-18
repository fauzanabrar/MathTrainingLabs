"use client";

const POP_UNDER_SCRIPT_SRC = "https://pl28480662.effectivegatecpm.com/5b/9e/bf/5b9ebf11a1c5d7a7e97f435c53621ae2.js";
const POP_UNDER_SCRIPT_ID = "pop-under-ad-script";
const POP_UNDER_SESSION_KEY = "popUnderAdShown";

export function showPopUnder() {
  if (typeof window === "undefined") {
    return;
  }

  const alreadyShown = sessionStorage.getItem(POP_UNDER_SESSION_KEY);
  if (alreadyShown) {
    return;
  }
  sessionStorage.setItem(POP_UNDER_SESSION_KEY, "true");

  if (document.getElementById(POP_UNDER_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = POP_UNDER_SCRIPT_ID;
  script.src = POP_UNDER_SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
}
