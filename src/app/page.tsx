"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  createDefaultStats,
  generateQuestion,
  getAccuracy,
  getAverageMs,
  getTargetMs,
  getWeakestSkill,
  MAX_LEVEL,
  pickSkill,
  SKILL_LABELS,
  SKILL_SYMBOLS,
  type Mode,
  type Question,
  type SkillKey,
  type Stats,
  updateStats,
} from "@/lib/math";
import { showPopUnder } from "@/components/PopUnderAd";

const STORAGE_KEY = "math-training-state";
const THEME_KEY = "math-training-theme";
const SETTINGS_KEY = "math-training-settings";
const MISTAKES_KEY = "math-training-mistakes";
const DEFAULT_SETTINGS = {
  questionCount: 10,
  timeLimitSeconds: 10,
  negativeLevel: 0,
};
const MAX_MISTAKES = 50;
const ADSTERRA_SCRIPT_SRC =
  "https://pl28463616.effectivegatecpm.com/9c9ea4fbff8dd33e714120c2cb2ec0d5/invoke.js";
const ADSTERRA_CONTAINER_ID = "container-9c9ea4fbff8dd33e714120c2cb2ec0d5";
const ADSTERRA_SCRIPT_ID = "adsterra-native-9c9ea4fbff8dd33e714120c2cb2ec0d5";

type Feedback = {
  correct: boolean;
  expected: number;
  ms: number;
  skill: SkillKey;
  level: number;
  timedOut?: boolean;
};

type MistakeItem = {
  id: string;
  text: string;
  answer: number;
  skill: SkillKey;
  level: number;
  misses: number;
  lastMissedAt: number;
};

type Screen = "menu" | "drill" | "settings" | "summary" | "stats";

type Settings = {
  questionCount: number;
  timeLimitSeconds: number;
  negativeLevel: number;
};

type SessionKind = "standard" | "mistakes";

type MenuAction = { type: "mode"; mode: Mode } | { type: "mistakes" };

type MenuItem = {
  key: string;
  label: string;
  subtitle: string;
  icon: string;
  action: MenuAction;
  disabled: boolean;
};

const formatMs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const formatSeconds = (value: number) => `${String(value).padStart(2, "0")}s`;

const isSkillKey = (value: unknown): value is SkillKey =>
  value === "add" || value === "sub" || value === "mul" || value === "div";

const makeMistakeId = (question: Question) =>
  `${question.skill}:${question.text}`;

const normalizeMistakes = (value: unknown): MistakeItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const cleaned: MistakeItem[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const item = entry as Partial<MistakeItem>;
    if (typeof item.text !== "string" || !isSkillKey(item.skill)) {
      return;
    }
    const answer = Number(item.answer);
    if (!Number.isFinite(answer)) {
      return;
    }
    const level = Number(item.level);
    const misses = Number(item.misses);
    const lastMissedAt = Number(item.lastMissedAt);
    cleaned.push({
      id:
        typeof item.id === "string"
          ? item.id
          : `${item.skill}:${item.text}`,
      text: item.text,
      answer,
      skill: item.skill,
      level: Number.isFinite(level) ? level : 1,
      misses: Number.isFinite(misses) && misses > 0 ? misses : 1,
      lastMissedAt: Number.isFinite(lastMissedAt) ? lastMissedAt : Date.now(),
    });
  });
  return cleaned.slice(0, MAX_MISTAKES);
};

const addMistakeEntry = (
  items: MistakeItem[],
  question: Question
): MistakeItem[] => {
  const id = makeMistakeId(question);
  const now = Date.now();
  const existingIndex = items.findIndex((item) => item.id === id);
  if (existingIndex === -1) {
    return [
      {
        id,
        text: question.text,
        answer: question.answer,
        skill: question.skill,
        level: question.level,
        misses: 1,
        lastMissedAt: now,
      },
      ...items,
    ].slice(0, MAX_MISTAKES);
  }
  const next = [...items];
  const existing = next[existingIndex];
  next.splice(existingIndex, 1);
  return [
    {
      ...existing,
      answer: question.answer,
      level: question.level,
      misses: existing.misses + 1,
      lastMissedAt: now,
    },
    ...next,
  ].slice(0, MAX_MISTAKES);
};

const removeMistakeEntry = (items: MistakeItem[], question: Question) =>
  items.filter((item) => item.id !== makeMistakeId(question));

const buildMistakeQuestion = (item: MistakeItem): Question => ({
  id: `${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  text: item.text,
  answer: item.answer,
  skill: item.skill,
  level: item.level,
});

const parseOperands = (text: string) => {
  const parts = text.split(" ");
  if (parts.length !== 3) {
    return null;
  }
  const left = Number(parts[0]);
  const right = Number(parts[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  return { left, right };
};

const roundToBase = (value: number, base: number) =>
  Math.round(value / base) * base;

const formatAdjustment = (delta: number) =>
  delta > 0 ? `add ${delta}` : `subtract ${Math.abs(delta)}`;

const gcd = (a: number, b: number) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
};

const getTipForQuestion = (question: Question) => {
  const parsed = parseOperands(question.text);
  if (!parsed) {
    return "Break the problem into smaller chunks.";
  }
  const { left, right } = parsed;
  if (question.skill === "add") {
    if (left === right) {
      return `Double ${left}.`;
    }
    if ((left % 10) + (right % 10) === 10) {
      return "Ones make 10. Add tens and carry a ten.";
    }
    const big = Math.max(left, right);
    const small = big === left ? right : left;
    const shift = (10 - (big % 10)) % 10;
    if (shift > 0 && shift <= 4 && small >= shift) {
      return `Shift ${shift} from ${small} to ${big} to make ${
        big + shift
      }, then add ${small - shift}.`;
    }
    const round10 = roundToBase(small, 10);
    const adjust10 = round10 - small;
    if (Math.abs(adjust10) <= 2 && adjust10 !== 0) {
      return `Round ${small} to ${round10}, then ${formatAdjustment(
        -adjust10
      )}.`;
    }
    const round100 = roundToBase(small, 100);
    const adjust100 = round100 - small;
    if (Math.abs(adjust100) <= 5 && adjust100 !== 0) {
      return `Round ${small} to ${round100}, then ${formatAdjustment(
        -adjust100
      )}.`;
    }
    const tens = Math.floor(small / 10) * 10;
    const ones = small - tens;
    if (tens !== 0 && ones !== 0) {
      return `Split ${small} into ${tens} + ${ones}. Add ${tens} then ${ones}.`;
    }
    return `Count up ${small} from ${big}.`;
  }
  if (question.skill === "sub") {
    if (left === right) {
      return "Same numbers cancel to zero.";
    }
    if (left < right) {
      return `Find ${right} - ${left}, then make it negative.`;
    }
    const diff = left - right;
    if (diff <= 10) {
      return `Count up from ${right} to ${left} in small hops.`;
    }
    const rightOnes = right % 10;
    if (rightOnes === 9) {
      return `Subtract ${right + 1}, then add 1.`;
    }
    if (rightOnes === 8) {
      return `Subtract ${right + 2}, then add 2.`;
    }
    if (rightOnes === 1) {
      return `Subtract ${right - 1}, then subtract 1.`;
    }
    const round10 = roundToBase(right, 10);
    const adjust10 = round10 - right;
    if (Math.abs(adjust10) <= 2 && adjust10 !== 0) {
      return `Subtract ${round10}, then ${formatAdjustment(adjust10)}.`;
    }
    const leftOnes = left % 10;
    if (leftOnes !== 0 && right >= leftOnes) {
      const remaining = right - leftOnes;
      if (remaining === 0) {
        return `Jump to a ten: subtract ${leftOnes} to reach a round ten.`;
      }
      return `Jump to a ten: subtract ${leftOnes}, then subtract ${remaining}.`;
    }
    if (left >= 100 && left % 100 === 0 && right < 100) {
      const toHundred = 100 - right;
      return `Use complements: ${left} - ${right} = (${left} - 100) + ${toHundred}.`;
    }
    const tens = Math.floor(right / 10) * 10;
    const ones = right - tens;
    if (tens !== 0 && ones !== 0) {
      return `Subtract ${tens}, then subtract ${ones}.`;
    }
    return `Subtract ${right} in one step.`;
  }
  if (question.skill === "mul") {
    if (left === 0 || right === 0) {
      return "Anything times 0 is 0.";
    }
    if (left === 1 || right === 1) {
      return "Anything times 1 stays the same.";
    }
    const big = Math.max(left, right);
    const small = big === left ? right : left;
    if (small === 2) {
      return `Double ${big}.`;
    }
    if (small === 3) {
      return `Double ${big}, then add ${big}.`;
    }
    if (small === 4) {
      return `Double ${big} twice.`;
    }
    if (small === 5) {
      return `Do ${big} x 10, then halve it.`;
    }
    if (small === 6) {
      return `Do ${big} x 3, then double.`;
    }
    if (small === 7) {
      return `Use 5x + 2x: ${big} x 7 = ${big} x 5 + ${big} x 2.`;
    }
    if (small === 8) {
      return `Double ${big} three times.`;
    }
    if (small === 9) {
      return `Do ${big} x 10, then subtract ${big}.`;
    }
    if (small === 11) {
      return `Do ${big} x 10, then add ${big}.`;
    }
    if (small === 12) {
      return `Do ${big} x 10 plus ${big} x 2.`;
    }
    if (small > 10 && small < 20) {
      const extra = small - 10;
      return `Use ${big} x 10 plus ${big} x ${extra}.`;
    }
    if (small === 15) {
      return `Do ${big} x 10 plus ${big} x 5.`;
    }
    if (small === 25) {
      return `Do ${big} x 100, then divide by 4.`;
    }
    if (small === 50) {
      return `Do ${big} x 100, then halve it.`;
    }
    if (small === 100) {
      return `Add two zeros to ${big}.`;
    }
    if (left % 2 === 0 && right % 10 === 5) {
      return `Halve ${left} and double ${right} to make a round number.`;
    }
    if (right % 2 === 0 && left % 10 === 5) {
      return `Halve ${right} and double ${left} to make a round number.`;
    }
    if (small % 10 === 9) {
      return `Use near-10: ${big} x ${small} = ${big} x ${
        small + 1
      } - ${big}.`;
    }
    if (small % 10 === 1 && small > 1) {
      return `Use near-10: ${big} x ${small} = ${big} x ${
        small - 1
      } + ${big}.`;
    }
    const tens = Math.floor(big / 10) * 10;
    const ones = big - tens;
    if (tens !== 0 && ones !== 0) {
      return `Split ${big} into ${tens} + ${ones}: ${small} x ${tens} + ${small} x ${ones}.`;
    }
    return "Break one factor and multiply in parts.";
  }
  if (question.skill === "div") {
    if (right === 1) {
      return "Divide by 1 stays the same.";
    }
    if (right === 2) {
      return "Half it.";
    }
    if (right === 4) {
      return "Half it twice.";
    }
    if (right === 5) {
      return "Divide by 10, then double.";
    }
    if (right === 8) {
      return "Half it three times.";
    }
    if (right === 10) {
      return "Drop one zero if possible.";
    }
    if (right === 25) {
      return "Divide by 100, then multiply by 4.";
    }
    if (right === 50) {
      return "Divide by 100, then double.";
    }
    if (right === 100) {
      return "Drop two zeros if possible.";
    }
    if (left % 100 === 0 && right % 100 === 0) {
      return `Cancel two zeros: ${left / 100} / ${right / 100}.`;
    }
    if (left % 10 === 0 && right % 10 === 0) {
      return `Cancel one zero: ${left / 10} / ${right / 10}.`;
    }
    const common = gcd(left, right);
    if (common >= 2 && common !== right) {
      return `Simplify first: divide both numbers by ${common}.`;
    }
    const factor = [3, 4, 5, 8, 6, 9, 12, 2].find(
      (value) => right % value === 0 && value !== right
    );
    if (factor) {
      return `Split the divisor: divide by ${factor}, then by ${right / factor}.`;
    }
    return `Use multiplication: ${right} x ? = ${left}.`;
  }
  return "Break the problem into smaller chunks.";
};

const createQuestion = (
  selectedMode: Mode,
  snapshot: Stats,
  negativeLevel: number
) => {
  const skill = selectedMode === "mix" ? pickSkill(snapshot) : selectedMode;
  const level = snapshot[skill].level;
  const allowNegative =
    skill === "sub" && negativeLevel > 0 && level >= negativeLevel;
  return generateQuestion(skill, level, { allowNegative });
};

function AdsterraNativeBanner() {
  const injectedRef = useRef(false);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const adShownInSession = sessionStorage.getItem("adShown");
    if (!adShownInSession) {
      setShouldShow(true);
      sessionStorage.setItem("adShown", "true");
    }
  }, []);

  useEffect(() => {
    if (!shouldShow || injectedRef.current || typeof document === "undefined") {
      return;
    }
    const container = document.getElementById(ADSTERRA_CONTAINER_ID);
    if (!container) {
      return;
    }
    if (document.getElementById(ADSTERRA_SCRIPT_ID)) {
      injectedRef.current = true;
      return;
    }
    const script = document.createElement("script");
    script.id = ADSTERRA_SCRIPT_ID;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = ADSTERRA_SCRIPT_SRC;
    const target = container.parentElement ?? document.body;
    target.appendChild(script);
    injectedRef.current = true;
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  return (
    <section className={styles.adSlot} aria-label="Sponsored content">
      <div id={ADSTERRA_CONTAINER_ID} />
    </section>
  );
}

export default function Home() {
  const [stats, setStats] = useState<Stats>(() => createDefaultStats());
  const [mode, setMode] = useState<Mode>("mix");
  const [screen, setScreen] = useState<Screen>("menu");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [sessionKind, setSessionKind] = useState<SessionKind>("standard");
  const [mistakeQueue, setMistakeQueue] = useState<MistakeItem[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [showTip, setShowTip] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });
  const [questionIndex, setQuestionIndex] = useState(1);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_SETTINGS.timeLimitSeconds);
  const [answered, setAnswered] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  const [useKeypad, setUseKeypad] = useState(false);
  const startTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const statsRef = useRef(stats);
  const modeRef = useRef(mode);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as { stats?: Stats; mode?: Mode };
        if (saved.stats) {
          setStats(saved.stats);
        }
        if (saved.mode) {
          setMode(saved.mode);
        }
      } catch {
        // Ignore malformed saved state.
      }
    }
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as Partial<Settings>;
        setSettings((prev) => {
          const nextNegative = parsed.negativeLevel ?? prev.negativeLevel;
          return {
            questionCount: parsed.questionCount ?? prev.questionCount,
            timeLimitSeconds: parsed.timeLimitSeconds ?? prev.timeLimitSeconds,
            negativeLevel: Math.min(Math.max(nextNegative, 0), MAX_LEVEL),
          };
        });
        if (typeof parsed.timeLimitSeconds === "number") {
          setTimeLeft(parsed.timeLimitSeconds);
        }
      } catch {
        // Ignore malformed settings.
      }
    }
    const savedMistakes = localStorage.getItem(MISTAKES_KEY);
    if (savedMistakes) {
      try {
        const parsed = JSON.parse(savedMistakes);
        setMistakes(normalizeMistakes(parsed));
      } catch {
        // Ignore malformed mistakes.
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      setThemeReady(true);
      return;
    }
    const prefersDark = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
    setTheme(prefersDark ? "dark" : "light");
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) {
      return;
    }
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, themeReady]);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    const isAndroid = /android/i.test(navigator.userAgent);
    setUseKeypad(isAndroid);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        stats,
        mode,
      })
    );
  }, [ready, stats, mode]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(mistakes));
  }, [mistakes, ready]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (screen !== "drill" || useKeypad || answered) {
      return;
    }
    inputRef.current?.focus();
  }, [answered, question?.id, screen, useKeypad]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const beginQuestion = useCallback(
    (nextQuestion: Question) => {
      setQuestion(nextQuestion);
      setAnswer("");
      setError(null);
      setFeedback(null);
      setAnswered(false);
      setShowTip(false);
      startTimeRef.current = Date.now();
      setTimeLeft(settings.timeLimitSeconds);
    },
    [settings.timeLimitSeconds]
  );

  const startSession = useCallback(
    (nextMode: Mode) => {
      clearAdvanceTimer();
      setSessionKind("standard");
      setMistakeQueue([]);
      setMode(nextMode);
      modeRef.current = nextMode;
      setSession({ correct: 0, wrong: 0 });
      setQuestionIndex(1);
      setScreen("drill");
      const nextQuestion = createQuestion(
        nextMode,
        statsRef.current,
        settings.negativeLevel
      );
      beginQuestion(nextQuestion);
    },
    [beginQuestion, clearAdvanceTimer, settings.negativeLevel]
  );

  const startMistakeSession = useCallback(() => {
    if (mistakes.length === 0) {
      return;
    }
    clearAdvanceTimer();
    const ordered = [...mistakes].sort((a, b) => {
      if (b.misses !== a.misses) {
        return b.misses - a.misses;
      }
      return b.lastMissedAt - a.lastMissedAt;
    });
    const queue = ordered.slice(0, settings.questionCount);
    if (queue.length === 0) {
      return;
    }
    setSessionKind("mistakes");
    setMistakeQueue(queue);
    setSession({ correct: 0, wrong: 0 });
    setQuestionIndex(1);
    setScreen("drill");
    const nextQuestion = buildMistakeQuestion(queue[0]);
    beginQuestion(nextQuestion);
  }, [beginQuestion, clearAdvanceTimer, mistakes, settings.questionCount]);

  const goToMenu = useCallback(() => {
    clearAdvanceTimer();
    setSessionKind("standard");
    setMistakeQueue([]);
    setScreen("menu");
    setQuestion(null);
    setFeedback(null);
    setError(null);
    setAnswer("");
    setAnswered(false);
    setShowTip(false);
  }, [clearAdvanceTimer]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.history.replaceState({ screen: "menu" }, "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (screen === "menu") {
      window.history.replaceState({ screen: "menu" }, "");
      return;
    }
    window.history.pushState({ screen }, "");
  }, [screen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handlePopState = () => {
      if (screen !== "menu") {
        goToMenu();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [goToMenu, screen]);

  const applyResult = useCallback(
    (correct: boolean, elapsed: number, timedOut = false) => {
      if (!question) {
        return;
      }
      const nextStats = updateStats(
        statsRef.current,
        question.skill,
        correct,
        elapsed
      );
      statsRef.current = nextStats;
      setStats(nextStats);
      setFeedback({
        correct,
        expected: question.answer,
        ms: elapsed,
        skill: question.skill,
        level: question.level,
        timedOut,
      });
      setSession((prev) => ({
        correct: prev.correct + (correct ? 1 : 0),
        wrong: prev.wrong + (correct ? 0 : 1),
      }));
      if (!correct) {
        setMistakes((prev) => addMistakeEntry(prev, question));
        setShowTip(true);
      } else if (sessionKind === "mistakes") {
        setMistakes((prev) => removeMistakeEntry(prev, question));
      }
      setError(null);
      setAnswered(true);
    },
    [question, sessionKind]
  );

  const handleSubmit = useCallback(() => {
    if (!question || answered) {
      return;
    }
    const cleaned = answer.trim();
    if (!cleaned) {
      setError(useKeypad ? "Tap numbers to continue." : "Type an answer.");
      return;
    }
    if (cleaned === "-") {
      setError(useKeypad ? "Finish the number." : "Type a number.");
      return;
    }

    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) {
      setError("Numbers only for now.");
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const correct = numeric === question.answer;

    clearAdvanceTimer();
    applyResult(correct, elapsed);
  }, [answered, answer, applyResult, clearAdvanceTimer, question, useKeypad]);

  const handleKeypadPress = useCallback(
    (key: string, allowNegativeAnswer: boolean) => {
      if (answered) {
        return;
      }
      setError(null);
      if (key === "CLR") {
        setAnswer("");
        return;
      }
      if (key === "DEL") {
        setAnswer((prev) => prev.slice(0, -1));
        return;
      }
      if (key === "-") {
        if (!allowNegativeAnswer) {
          return;
        }
        setAnswer((prev) => {
          if (prev.startsWith("-")) {
            return prev.slice(1);
          }
          if (prev.length === 0) {
            return "-";
          }
          if (prev === "0") {
            return "-0";
          }
          return `-${prev}`;
        });
        return;
      }
      setAnswer((prev) => {
        if (prev === "0") {
          return key;
        }
        if (prev === "-0") {
          return `-${key}`;
        }
        return prev + key;
      });
    },
    [answered]
  );

  const handleNext = useCallback(() => {
    if (!question || !answered) {
      return;
    }
    clearAdvanceTimer();
    const totalQuestions =
      sessionKind === "mistakes" ? mistakeQueue.length : settings.questionCount;
    const nextIndex = questionIndex + 1;
    if (nextIndex > totalQuestions) {
      setScreen("summary");
      setQuestion(null);
      setAnswered(false);
      showPopUnder(); // Call showPopUnder here
      return;
    }
    setQuestionIndex(nextIndex);
    if (sessionKind === "mistakes") {
      const nextItem = mistakeQueue[nextIndex - 1];
      if (!nextItem) {
        setScreen("summary");
        setQuestion(null);
        setAnswered(false);
        showPopUnder();
        return;
      }
      beginQuestion(buildMistakeQuestion(nextItem));
      return;
    }
    const nextQuestion = createQuestion(
      modeRef.current,
      statsRef.current,
      settings.negativeLevel
    );
    beginQuestion(nextQuestion);
  }, [
    answered,
    beginQuestion,
    clearAdvanceTimer,
    question,
    questionIndex,
    mistakeQueue,
    sessionKind,
    settings.negativeLevel,
    settings.questionCount,
  ]);

  const handleTimeout = useCallback(() => {
    if (!question || answered) {
      return;
    }
    const elapsed = Date.now() - startTimeRef.current;
    applyResult(false, elapsed, true);
  }, [answered, applyResult, question]);

  const handlePracticeAgain = useCallback(() => {
    if (sessionKind === "mistakes") {
      startMistakeSession();
      return;
    }
    startSession(mode);
  }, [mode, sessionKind, startMistakeSession, startSession]);

  const resetStats = useCallback(() => {
    const fresh = createDefaultStats();
    statsRef.current = fresh;
    setStats(fresh);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const adjustQuestionCount = (delta: number) => {
    setSettings((prev) => {
      const next = Math.min(Math.max(prev.questionCount + delta, 5), 50);
      return { ...prev, questionCount: next };
    });
  };

  const adjustTimeLimit = (delta: number) => {
    setSettings((prev) => {
      const next = Math.min(Math.max(prev.timeLimitSeconds + delta, 5), 60);
      return { ...prev, timeLimitSeconds: next };
    });
  };

  const adjustNegativeLevel = (delta: number) => {
    setSettings((prev) => {
      const next = Math.min(Math.max(prev.negativeLevel + delta, 0), MAX_LEVEL);
      return { ...prev, negativeLevel: next };
    });
  };

  useEffect(() => {
    if (screen !== "drill" || !question || answered) {
      return;
    }
    setTimeLeft(settings.timeLimitSeconds);
    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [
    answered,
    handleTimeout,
    question?.id,
    screen,
    settings.timeLimitSeconds,
  ]);

  useEffect(() => {
    if (!feedback || (!feedback.correct && !feedback.timedOut)) {
      return;
    }
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      handleNext();
    }, 700);
    return () => {
      clearAdvanceTimer();
    };
  }, [feedback, clearAdvanceTimer, handleNext]);

  const hasAttempts = useMemo(
    () => Object.values(stats).some((entry) => entry.history.length > 0),
    [stats]
  );
  const weakestSkill = useMemo(() => getWeakestSkill(stats), [stats]);
  const weaknessText = hasAttempts ? SKILL_LABELS[weakestSkill] : "No data yet";
  const hasMistakes = mistakes.length > 0;
  const isMistakeSession = sessionKind === "mistakes";
  const allowNegativeAnswer = Boolean(
    question &&
      question.skill === "sub" &&
      settings.negativeLevel > 0 &&
      question.level >= settings.negativeLevel
  );
  const keypadRows = allowNegativeAnswer
    ? [
        ["7", "8", "9"],
        ["4", "5", "6"],
        ["1", "2", "3"],
        ["-", "0", "DEL", "CLR"],
      ]
    : [
        ["7", "8", "9"],
        ["4", "5", "6"],
        ["1", "2", "3"],
        ["CLR", "0", "DEL"],
      ];
  const skillKeys: SkillKey[] = ["add", "sub", "mul", "div"];
  const menuItems: MenuItem[] = [
    {
      key: "mix",
      label: "Random mix",
      subtitle: "Adaptive blend",
      icon: "M",
      action: { type: "mode", mode: "mix" as const },
      disabled: false,
    },
    {
      key: "mistakes",
      label: "Practice mistakes",
      subtitle: hasMistakes
        ? `Deliberate practice (${mistakes.length})`
        : "No mistakes yet",
      icon: "!",
      action: { type: "mistakes" as const },
      disabled: !hasMistakes,
    },
    {
      key: "add",
      label: "Addition",
      subtitle: "Sum drills",
      icon: SKILL_SYMBOLS.add,
      action: { type: "mode", mode: "add" as const },
      disabled: false,
    },
    {
      key: "sub",
      label: "Subtraction",
      subtitle: "Minus drills",
      icon: SKILL_SYMBOLS.sub,
      action: { type: "mode", mode: "sub" as const },
      disabled: false,
    },
    {
      key: "mul",
      label: "Multiplication",
      subtitle: "Times tables",
      icon: SKILL_SYMBOLS.mul,
      action: { type: "mode", mode: "mul" as const },
      disabled: false,
    },
    {
      key: "div",
      label: "Division",
      subtitle: "Quotient practice",
      icon: SKILL_SYMBOLS.div,
      action: { type: "mode", mode: "div" as const },
      disabled: false,
    },
  ];
  const totalAnswered = session.correct + session.wrong;
  const accuracy = totalAnswered
    ? Math.round((session.correct / totalAnswered) * 100)
    : 0;
  const modeLabel = isMistakeSession
    ? "Mistake practice"
    : mode === "mix"
      ? "Random mix"
      : SKILL_LABELS[mode];
  const drillSub = isMistakeSession
    ? "Deliberate practice to build speed on missed problems."
    : "Answer fast and correct to level up.";
  const sessionQuestionCount = isMistakeSession
    ? mistakeQueue.length
    : settings.questionCount;
  const timeLeftLabel = formatSeconds(timeLeft);
  const appBarTitle =
    screen === "menu"
      ? "Math Training Lab"
      : screen === "drill"
        ? `${modeLabel} drill`
        : screen === "summary"
          ? "Session summary"
          : screen === "stats"
            ? "Statistics"
            : "Settings";
  const allHistory = skillKeys.flatMap((skill) => stats[skill].history);
  const allCorrect = allHistory.filter((item) => item.correct).length;
  const allAttempts = allHistory.length;
  const overallAccuracy = allAttempts
    ? Math.round((allCorrect / allAttempts) * 100)
    : 0;
  const totalMs = allHistory.reduce((sum, item) => sum + item.ms, 0);
  const overallAvgMs = allAttempts ? totalMs / allAttempts : 0;
  const feedbackText = feedback
    ? feedback.correct
      ? `Correct. ${formatMs(feedback.ms)}.`
      : feedback.timedOut
        ? `Time's up. Answer: ${feedback.expected}.`
        : `Not yet. Answer: ${feedback.expected}.`
    : "";
  const tipText = question ? getTipForQuestion(question) : "";

  let content: React.ReactElement | null = null;

  if (screen === "menu") {
    content = (
      <>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Choose a drill</h1>
          <p className={styles.heroText}>
            Pick a focus or use Random mix to adapt to your weakest skill.
          </p>
          <div className={styles.menuMetaRow}>
            <div className={styles.metaBadge}>
              <span className={styles.metaBadgeText}>
                {settings.questionCount} questions
              </span>
            </div>
            <div className={styles.metaBadge}>
              <span className={styles.metaBadgeText}>
                {settings.timeLimitSeconds}s per question
              </span>
            </div>
            <div className={styles.metaBadge}>
              <span className={styles.metaBadgeText}>
                Weakest: {weaknessText}
              </span>
            </div>
            <div className={styles.metaBadge}>
              <span className={styles.metaBadgeText}>
                Negatives:{" "}
                {settings.negativeLevel === 0
                  ? "Off"
                  : `Lvl ${settings.negativeLevel}+`}
              </span>
            </div>
          </div>
        </section>

        <div className={styles.menuGrid}>
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                if (item.action.type === "mistakes") {
                  startMistakeSession();
                  return;
                }
                startSession(item.action.mode);
              }}
              type="button"
              disabled={item.disabled}
              className={styles.menuButton}
            >
              <span className={styles.menuIcon}>{item.icon}</span>
              <span>
                <span className={styles.menuLabel}>{item.label}</span>
                <span className={styles.menuSub}>{item.subtitle}</span>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.menuActions}>
          <button
            type="button"
            onClick={() => setScreen("stats")}
            className={`${styles.settingsButton} ${styles.menuActionButton}`}
          >
            Statistics
          </button>
          <button
            type="button"
            onClick={() => setScreen("settings")}
            className={`${styles.settingsButton} ${styles.menuActionButton}`}
          >
            Settings
          </button>
        </div>
      </>
    );
  }

  if (screen === "drill") {
    content = (
      <>
        <div className={styles.statusRow}>
          <div className={styles.statusPill}>
            <span className={styles.statusText}>
              Question {questionIndex}/{sessionQuestionCount}
            </span>
          </div>
          <div
            className={`${styles.statusPill} ${
              timeLeft <= 3 ? styles.statusPillWarning : ""
            }`}
          >
            <span className={styles.statusText}>Time {timeLeftLabel}</span>
          </div>
        </div>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>{modeLabel} drill</h2>
          <p className={styles.sectionSub}>{drillSub}</p>

          {question ? (
            <div className={styles.questionCard}>
              <div className={styles.metaRow}>
                <span className={styles.metaPill}>
                  Skill: {SKILL_LABELS[question.skill]}
                </span>
                <span className={styles.metaPill}>Level {question.level}</span>
                <span className={styles.metaPill}>
                  Target {formatMs(getTargetMs(question.level))}
                </span>
              </div>

              <div className={styles.questionText}>{question.text}</div>

              <div className={styles.answerBlock}>
                {useKeypad ? (
                  <>
                    <div className={styles.answerDisplay}>
                      <span
                        className={
                          answer.length === 0
                            ? styles.answerPlaceholder
                            : styles.answerDisplayText
                        }
                      >
                        {answer.length === 0 ? "Tap numbers" : answer}
                      </span>
                    </div>
                    <div className={styles.keypad}>
                      {keypadRows.map((row, rowIndex) => (
                        <div key={`row-${rowIndex}`} className={styles.keypadRow}>
                          {row.map((key) => {
                            const isActionKey = key === "CLR" || key === "DEL";
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  handleKeypadPress(key, allowNegativeAnswer)
                                }
                                disabled={answered}
                                className={`${styles.keypadButton} ${
                                  isActionKey ? styles.keypadButtonAlt : ""
                                } ${answered ? styles.keypadButtonDisabled : ""}`}
                              >
                                <span
                                  className={`${styles.keypadButtonText} ${
                                    isActionKey ? styles.keypadButtonAltText : ""
                                  } ${
                                    answered ? styles.keypadButtonTextDisabled : ""
                                  }`}
                                >
                                  {key}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.answerRow}>
                    <input
                      ref={inputRef}
                      className={styles.answerInput}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={answer}
                      onChange={(event) => {
                        const raw = event.target.value;
                        let cleaned = raw.replace(/[^0-9-]/g, "");
                        if (!allowNegativeAnswer) {
                          cleaned = cleaned.replace(/-/g, "");
                        } else if (cleaned.includes("-")) {
                          cleaned = cleaned.replace(/(?!^)-/g, "");
                        }
                        setAnswer(cleaned);
                        setError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="Type your answer"
                      autoComplete="off"
                      disabled={answered}
                      aria-label="Answer input"
                    />
                  </div>
                )}
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={answered}
                    className={`${styles.primaryButton} ${
                      answered ? styles.buttonDisabled : ""
                    }`}
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!answered}
                    className={`${styles.secondaryButton} ${
                      !answered ? styles.buttonDisabled : ""
                    }`}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTip((prev) => !prev)}
                    aria-pressed={showTip}
                    className={styles.secondaryButton}
                  >
                    {showTip ? "Hide tip" : "Show tip"}
                  </button>
                </div>
              </div>

              {error ? <p className={styles.errorText}>{error}</p> : null}
              {feedback ? (
                <div
                  className={`${styles.feedback} ${
                    feedback.correct
                      ? styles.feedbackCorrect
                      : styles.feedbackWrong
                  }`}
                >
                  <span className={styles.feedbackText}>{feedbackText}</span>
                </div>
              ) : null}
              {showTip ? (
                <div className={styles.tipBox}>
                  <span className={styles.tipLabel}>Tip</span>
                  <span className={styles.tipText}>{tipText}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className={styles.sectionSub}>Loading your question...</p>
          )}

          <div className={styles.sessionRow}>
            <div>
              <p className={styles.sessionLabel}>Session score</p>
              <p className={styles.sessionValue}>
                {session.correct} correct / {session.wrong} wrong
              </p>
            </div>
            <p className={styles.sessionHint}>Stay focused and keep moving.</p>
          </div>
        </section>
      </>
    );
  }

  if (screen === "stats") {
    content = (
      <>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Statistics</h1>
          <p className={styles.heroText}>
            Recent performance across your drills (last 12 attempts per skill).
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Overall</h2>
          <p className={styles.sectionSub}>
            Based on your recent attempts across all skills.
          </p>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Accuracy</p>
              <p className={styles.summaryValue}>{overallAccuracy}%</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Attempts</p>
              <p className={styles.summaryValue}>{allAttempts}</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Avg time</p>
              <p className={styles.summaryValue}>
                {allAttempts ? formatMs(overallAvgMs) : "-"}
              </p>
            </div>
          </div>
          <div className={styles.statBar}>
            <div
              className={styles.statBarFill}
              style={{ width: `${overallAccuracy}%` }}
            />
          </div>
        </section>

        <div className={styles.statGrid}>
          {skillKeys.map((skill) => {
            const history = stats[skill].history;
            const accuracy = getAccuracy(stats[skill]);
            const avgMs = getAverageMs(stats[skill]);
            const accuracyText =
              history.length === 0
                ? "No data"
                : `${Math.round(accuracy * 100)}%`;
            const speedText = history.length === 0 ? "-" : formatMs(avgMs);
            const barWidth =
              history.length === 0 ? "0%" : `${Math.round(accuracy * 100)}%`;

            return (
              <section key={skill} className={styles.statCard}>
                <div className={styles.statHeader}>
                  <h3 className={styles.statTitle}>{SKILL_LABELS[skill]}</h3>
                  <span className={styles.levelBadge}>
                    Level {stats[skill].level}
                  </span>
                </div>
                <div className={styles.statBar}>
                  <div
                    className={styles.statBarFill}
                    style={{ width: barWidth }}
                  />
                </div>
                <div className={styles.statMetrics}>
                  <div>
                    <p className={styles.metricLabel}>Accuracy</p>
                    <p className={styles.metricValue}>{accuracyText}</p>
                  </div>
                  <div className={styles.metricDivider} />
                  <div>
                    <p className={styles.metricLabel}>Avg time</p>
                    <p className={styles.metricValue}>{speedText}</p>
                  </div>
                </div>
                <div className={styles.dotRow}>
                  {history.length === 0 ? (
                    <span className={styles.dotEmpty}>No attempts yet</span>
                  ) : (
                    history.map((item, index) => (
                      <span
                        key={`${skill}-${index}`}
                        className={`${styles.dot} ${
                          item.correct ? styles.dotCorrect : styles.dotWrong
                        }`}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </>
    );
  }

  if (screen === "summary") {
    content = (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Session complete</h2>
        <p className={styles.sectionSub}>{modeLabel} drill</p>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Accuracy</p>
            <p className={styles.summaryValue}>{accuracy}%</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Correct</p>
            <p className={styles.summaryValue}>{session.correct}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Wrong</p>
            <p className={styles.summaryValue}>{session.wrong}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePracticeAgain}
          disabled={isMistakeSession && !hasMistakes}
          className={`${styles.primaryButton} ${
            isMistakeSession && !hasMistakes ? styles.buttonDisabled : ""
          }`}
        >
          {isMistakeSession ? "Practice mistakes again" : "Practice again"}
        </button>
        <button type="button" onClick={goToMenu} className={styles.secondaryButton}>
          Back to menu
        </button>
      </section>
    );
  }

  if (screen === "settings") {
    content = (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Settings</h2>
        <p className={styles.sectionSub}>
          Tune the session size and time per question.
        </p>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>Questions per session</p>
            <p className={styles.settingHint}>Default is 10</p>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              onClick={() => adjustQuestionCount(-1)}
              className={styles.stepperButton}
            >
              <span className={styles.stepperButtonText}>-</span>
            </button>
            <span className={styles.stepperValue}>{settings.questionCount}</span>
            <button
              type="button"
              onClick={() => adjustQuestionCount(1)}
              className={styles.stepperButton}
            >
              <span className={styles.stepperButtonText}>+</span>
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>Time per question</p>
            <p className={styles.settingHint}>Seconds allowed</p>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              onClick={() => adjustTimeLimit(-5)}
              className={styles.stepperButton}
            >
              <span className={styles.stepperButtonText}>-</span>
            </button>
            <span className={styles.stepperValue}>
              {settings.timeLimitSeconds}s
            </span>
            <button
              type="button"
              onClick={() => adjustTimeLimit(5)}
              className={styles.stepperButton}
            >
              <span className={styles.stepperButtonText}>+</span>
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>Negative answers (subtraction)</p>
            <p className={styles.settingHint}>
              Start showing negatives from a level.
            </p>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              onClick={() => adjustNegativeLevel(-1)}
              className={styles.stepperButton}
            >
              <span className={styles.stepperButtonText}>-</span>
            </button>
            <span className={styles.stepperValue}>
              {settings.negativeLevel === 0
                ? "Off"
                : `Level ${settings.negativeLevel}+`}
            </span>
            <button
              type="button"
              onClick={() => adjustNegativeLevel(1)}
              className={styles.stepperButton}
            >
              <span className={styles.stepperButtonText}>+</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={theme === "dark"}
          aria-label="Toggle theme"
          className={`${styles.themeToggle} ${
            theme === "dark" ? styles.themeToggleDark : ""
          }`}
        >
          <span className={styles.themeIcon} aria-hidden="true">
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" role="img">
                <path
                  d="M21 14.5A8.5 8.5 0 0 1 9.5 3a9 9 0 1 0 11.5 11.5Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" role="img">
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="1.6">
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                  <line x1="4.6" y1="4.6" x2="6.8" y2="6.8" />
                  <line x1="17.2" y1="17.2" x2="19.4" y2="19.4" />
                  <line x1="4.6" y1="19.4" x2="6.8" y2="17.2" />
                  <line x1="17.2" y1="6.8" x2="19.4" y2="4.6" />
                </g>
              </svg>
            )}
          </span>
          <span className={styles.themeText}>
            <span className={styles.themeLabel}>Theme</span>
            <span className={styles.themeName}>
              {theme === "dark" ? "Dark" : "Light"}
            </span>
          </span>
          <span className={styles.themeSwitch} aria-hidden="true">
            <span className={styles.themeKnob} />
          </span>
        </button>

        <button type="button" onClick={resetStats} className={styles.dangerButton}>
          Reset all stats
        </button>

        <button
          type="button"
          onClick={goToMenu}
          className={`${styles.secondaryButton} ${styles.fullWidthButton}`}
        >
          Back to menu
        </button>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.appBar}>
        <div className={styles.appBarInner}>
          <div className={styles.appBarLeft}>
            {screen === "menu" ? (
              <div className={styles.brandMark}>
                <span className={styles.brandMarkText}>MT</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={goToMenu}
                className={styles.appBarBack}
                aria-label="Back to menu"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M15 6L9 12l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <span className={styles.appBarTitle}>{appBarTitle}</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {content}
        <AdsterraNativeBanner />
      </main>
    </div>
  );
}
