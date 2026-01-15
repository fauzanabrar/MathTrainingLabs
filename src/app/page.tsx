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
const DEFAULT_SETTINGS = {
  questionCount: 10,
  timeLimitSeconds: 10,
  negativeLevel: 0,
};
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

type Screen = "menu" | "drill" | "settings" | "summary" | "stats";

type Settings = {
  questionCount: number;
  timeLimitSeconds: number;
  negativeLevel: number;
};

const formatMs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const formatSeconds = (value: number) => `${String(value).padStart(2, "0")}s`;

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
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
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
      startTimeRef.current = Date.now();
      setTimeLeft(settings.timeLimitSeconds);
    },
    [settings.timeLimitSeconds]
  );

  const startSession = useCallback(
    (nextMode: Mode) => {
      clearAdvanceTimer();
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

  const goToMenu = useCallback(() => {
    clearAdvanceTimer();
    setScreen("menu");
    setQuestion(null);
    setFeedback(null);
    setError(null);
    setAnswer("");
    setAnswered(false);
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
      setError(null);
      setAnswered(true);
    },
    [question]
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
    const nextIndex = questionIndex + 1;
    if (nextIndex > settings.questionCount) {
      setScreen("summary");
      setQuestion(null);
      setAnswered(false);
      showPopUnder(); // Call showPopUnder here
      return;
    }
    setQuestionIndex(nextIndex);
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
  const menuItems = [
    {
      mode: "mix" as const,
      label: "Random mix",
      subtitle: "Adaptive blend",
      icon: "M",
    },
    {
      mode: "add" as const,
      label: "Addition",
      subtitle: "Sum drills",
      icon: SKILL_SYMBOLS.add,
    },
    {
      mode: "sub" as const,
      label: "Subtraction",
      subtitle: "Minus drills",
      icon: SKILL_SYMBOLS.sub,
    },
    {
      mode: "mul" as const,
      label: "Multiplication",
      subtitle: "Times tables",
      icon: SKILL_SYMBOLS.mul,
    },
    {
      mode: "div" as const,
      label: "Division",
      subtitle: "Quotient practice",
      icon: SKILL_SYMBOLS.div,
    },
  ];
  const totalAnswered = session.correct + session.wrong;
  const accuracy = totalAnswered
    ? Math.round((session.correct / totalAnswered) * 100)
    : 0;
  const modeLabel = mode === "mix" ? "Random mix" : SKILL_LABELS[mode];
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
              key={item.mode}
              onClick={() => startSession(item.mode)}
              type="button"
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
              Question {questionIndex}/{settings.questionCount}
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
          <p className={styles.sectionSub}>
            Answer fast and correct to level up.
          </p>

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
          onClick={() => startSession(mode)}
          className={styles.primaryButton}
        >
          Practice again
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
