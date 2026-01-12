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
  pickSkill,
  SKILL_LABELS,
  type Mode,
  type Question,
  type SkillKey,
  type Stats,
  updateStats,
} from "@/lib/math";

const STORAGE_KEY = "math-training-state";
const THEME_KEY = "math-training-theme";
const ADS_ENABLED = false;

type Feedback = {
  correct: boolean;
  expected: number;
  ms: number;
  skill: SkillKey;
  level: number;
};

const formatMs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const createQuestion = (selectedMode: Mode, snapshot: Stats) => {
  const skill = selectedMode === "mix" ? pickSkill(snapshot) : selectedMode;
  const level = snapshot[skill].level;
  return generateQuestion(skill, level);
};

export default function Home() {
  const [stats, setStats] = useState<Stats>(() => createDefaultStats());
  const [mode, setMode] = useState<Mode>("mix");
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  const startTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceTimerRef = useRef<number | null>(null);

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
    if (!ready || question) {
      return;
    }
    const nextQuestion = createQuestion(mode, stats);
    setQuestion(nextQuestion);
    startTimeRef.current = Date.now();
  }, [ready, question, mode, stats]);

  useEffect(() => {
    if (question) {
      inputRef.current?.focus();
    }
  }, [question?.id]);

  const weakestSkill = useMemo(() => getWeakestSkill(stats), [stats]);
  const weakestLabel = SKILL_LABELS[weakestSkill];
  const hasAttempts = useMemo(
    () => Object.values(stats).some((entry) => entry.history.length > 0),
    [stats]
  );
  const weaknessText = hasAttempts ? weakestLabel : "No data yet";

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const handleModeChange = (nextMode: Mode) => {
    clearAdvanceTimer();
    setMode(nextMode);
    setFeedback(null);
    setError(null);
    setAnswer("");
    const nextQuestion = createQuestion(nextMode, stats);
    setQuestion(nextQuestion);
    startTimeRef.current = Date.now();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question) {
      return;
    }

    const cleaned = answer.trim();
    if (!cleaned) {
      setError("Type an answer to continue.");
      return;
    }

    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) {
      setError("Numbers only for now.");
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const correct = numeric === question.answer;
    const nextStats = updateStats(stats, question.skill, correct, elapsed);

    clearAdvanceTimer();
    setStats(nextStats);
    setFeedback({
      correct,
      expected: question.answer,
      ms: elapsed,
      skill: question.skill,
      level: question.level,
    });
    setSession((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
    }));
    setAnswer("");
    setError(null);
  };

  const handleNext = () => {
    if (!question) {
      return;
    }
    clearAdvanceTimer();
    const nextQuestion = createQuestion(mode, stats);
    setQuestion(nextQuestion);
    setFeedback(null);
    setError(null);
    setAnswer("");
    startTimeRef.current = Date.now();
  };

  const handleReset = () => {
    clearAdvanceTimer();
    const fresh = createDefaultStats();
    setStats(fresh);
    setFeedback(null);
    setError(null);
    setSession({ correct: 0, wrong: 0 });
    const nextQuestion = createQuestion(mode, fresh);
    setQuestion(nextQuestion);
    startTimeRef.current = Date.now();
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    if (!feedback?.correct) {
      return;
    }
    advanceTimerRef.current = window.setTimeout(() => {
      handleNext();
    }, 700);
    return () => {
      clearAdvanceTimer();
    };
  }, [feedback?.correct, handleNext, clearAdvanceTimer]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>MT</span>
          <div>
            <p className={styles.brandTitle}>Math Training Lab</p>
            <p className={styles.brandTag}>Adaptive drills for real progress</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={`${styles.themeToggle} ${
              theme === "dark" ? styles.themeToggleDark : ""
            }`}
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            aria-pressed={theme === "dark"}
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
            <span className={styles.themeSwitch} aria-hidden="true" />
          </button>
          <div className={styles.headerPill}>PWA ready</div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <h1>Build strength in every operation.</h1>
            <p>
              Short, adaptive sessions that turn your weakest skill into your
              next win. Start with a mode or stay in Mix for full balance.
            </p>
          </div>
          <div className={styles.modeRow}>
            {(["mix", "add", "sub", "mul", "div"] as Mode[]).map((item) => (
              <button
                key={item}
                className={`${styles.modeButton} ${
                  mode === item ? styles.modeButtonActive : ""
                }`}
                onClick={() => handleModeChange(item)}
                type="button"
              >
                {item === "mix" ? "Mix" : SKILL_LABELS[item]}
              </button>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.practice}`}>
          <div className={styles.practiceHeader}>
            <div>
              <h2>Today&apos;s drill</h2>
              <p>
                Weakest focus: <strong>{weaknessText}</strong>
              </p>
            </div>
            <button
              className={styles.ghostButton}
              type="button"
              onClick={handleReset}
            >
              Reset stats
            </button>
          </div>

          {question ? (
            <div className={styles.questionCard}>
              <div className={styles.metaRow}>
                <span className={styles.metaPill}>
                  Skill: {SKILL_LABELS[question.skill]}
                </span>
                <span className={styles.metaPill}>
                  Level {question.level}
                </span>
                <span className={styles.metaPill}>
                  Target {formatMs(getTargetMs(question.level))}
                </span>
              </div>
              <div className={styles.questionText}>{question.text}</div>
              <form className={styles.answerRow} onSubmit={handleSubmit}>
                <input
                  ref={inputRef}
                  className={styles.answerInput}
                  type="number"
                  inputMode="numeric"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Type your answer"
                />
                <button className={styles.primaryButton} type="submit">
                  Check
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={handleNext}
                >
                  Next
                </button>
              </form>
              {error ? <p className={styles.errorText}>{error}</p> : null}
              {feedback ? (
                <div
                  className={`${styles.feedback} ${
                    feedback.correct
                      ? styles.feedbackCorrect
                      : styles.feedbackWrong
                  }`}
                >
                  <strong>
                    {feedback.correct ? "Correct" : "Not yet"}
                  </strong>{" "}
                  {feedback.correct
                    ? `You answered in ${formatMs(feedback.ms)}.`
                    : `The answer is ${feedback.expected}.`}
                </div>
              ) : null}
            </div>
          ) : (
            <p>Loading your first question...</p>
          )}

          <div className={styles.sessionRow}>
            <div>
              <p className={styles.sessionLabel}>Session score</p>
              <p className={styles.sessionValue}>
                {session.correct} correct / {session.wrong} wrong
              </p>
            </div>
            <div className={styles.sessionHint}>
              Answer fast and correct to level up faster.
            </div>
          </div>

          <div className={styles.adSlot}>
            {ADS_ENABLED ? (
              <div className={styles.adPlaceholder}>Ad goes here</div>
            ) : (
              <div className={styles.adPlaceholder}>
                Ad slot ready (disabled)
              </div>
            )}
          </div>
        </section>

        <section className={`${styles.card} ${styles.stats}`}>
          <div className={styles.statsHeader}>
            <div>
              <h2>Skill map</h2>
              <p>Track accuracy and speed for each operation.</p>
            </div>
            <span className={styles.statsHint}>
              Mix mode targets your weakest skill more often.
            </span>
          </div>
          <div className={styles.statGrid}>
            {(["add", "sub", "mul", "div"] as SkillKey[]).map((skill) => {
              const accuracy = getAccuracy(stats[skill]);
              const avgMs = getAverageMs(stats[skill]);
              const history = stats[skill].history;
              const accuracyText =
                history.length === 0 ? "No data" : `${Math.round(accuracy * 100)}%`;
              const speedText =
                history.length === 0 ? "-" : formatMs(avgMs);

              return (
                <div key={skill} className={styles.statCard}>
                  <div className={styles.statTitle}>
                    <h3>{SKILL_LABELS[skill]}</h3>
                    <span className={styles.levelBadge}>
                      Level {stats[skill].level}
                    </span>
                  </div>
                  <div className={styles.statMetrics}>
                    <div>
                      <p className={styles.metricLabel}>Accuracy</p>
                      <p className={styles.metricValue}>{accuracyText}</p>
                    </div>
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
                          title={item.correct ? "Correct" : "Wrong"}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
