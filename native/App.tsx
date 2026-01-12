import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StatusBar as RNStatusBar,
  useColorScheme,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
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
} from "./src/lib/math";

const STORAGE_KEY = "math-training-state";
const THEME_KEY = "math-training-theme";
const SETTINGS_KEY = "math-training-settings";
const DEFAULT_SETTINGS = { questionCount: 10, timeLimitSeconds: 10 };

type Feedback = {
  correct: boolean;
  expected: number;
  ms: number;
  skill: SkillKey;
  level: number;
  timedOut?: boolean;
};

type ThemeMode = "light" | "dark" | "system";

type Screen = "menu" | "drill" | "settings" | "summary" | "stats";

type Settings = {
  questionCount: number;
  timeLimitSeconds: number;
};

type Theme = {
  colors: {
    background: string;
    surface: string;
    surfaceStrong: string;
    surfaceSoft: string;
    border: string;
    borderStrong: string;
    text: string;
    muted: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    chipBg: string;
    chipText: string;
    inputBg: string;
    successBg: string;
    successText: string;
    errorBg: string;
    errorText: string;
    adBg: string;
    adText: string;
    levelBg: string;
    levelText: string;
    dotOk: string;
    dotBad: string;
  };
  gradient: string[];
  statusBarStyle: "light" | "dark";
};

const lightTheme: Theme = {
  colors: {
    background: "#f5f1ea",
    surface: "#fcfaf7",
    surfaceStrong: "#f6ede1",
    surfaceSoft: "#f9f4ec",
    border: "#e1d6c7",
    borderStrong: "#d4c5b5",
    text: "#1d1a16",
    muted: "#5c6a72",
    accent: "#f26a3d",
    accentStrong: "#d9572e",
    accentSoft: "#f5c9b2",
    chipBg: "#fff9f2",
    chipText: "#6c4630",
    inputBg: "#fffdf8",
    successBg: "#e7f4ea",
    successText: "#1f6a3a",
    errorBg: "#fff1f1",
    errorText: "#a13024",
    adBg: "#fff8ef",
    adText: "#9a6a45",
    levelBg: "#f5cfbb",
    levelText: "#8a4c2c",
    dotOk: "#45b975",
    dotBad: "#ee6b5b",
  },
  gradient: ["#f6f1ea", "#f3f0f8", "#eef4f7"],
  statusBarStyle: "dark",
};

const darkTheme: Theme = {
  colors: {
    background: "#151311",
    surface: "#1b1916",
    surfaceStrong: "#221f1b",
    surfaceSoft: "#1f1c18",
    border: "#3b332c",
    borderStrong: "#4a4037",
    text: "#f2ece6",
    muted: "#b0a6a0",
    accent: "#ff8a5b",
    accentStrong: "#ff7648",
    accentSoft: "#4a2c21",
    chipBg: "#2a251f",
    chipText: "#e2cbb7",
    inputBg: "#1b1815",
    successBg: "#1d2a22",
    successText: "#8fe3b1",
    errorBg: "#2c1c1c",
    errorText: "#f29b93",
    adBg: "#221e19",
    adText: "#d2b39a",
    levelBg: "#3a2b23",
    levelText: "#f3c9ae",
    dotOk: "#56d58d",
    dotBad: "#f4776b",
  },
  gradient: ["#141311", "#1b1916", "#151311"],
  statusBarStyle: "light",
};

const formatMs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const formatSeconds = (value: number) => `${String(value).padStart(2, "0")}s`;

const createQuestion = (selectedMode: Mode, snapshot: Stats) => {
  const skill = selectedMode === "mix" ? pickSkill(snapshot) : selectedMode;
  const level = snapshot[skill].level;
  return generateQuestion(skill, level);
};

export default function App() {
  const colorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const systemScheme = colorScheme ?? "light";
  const resolvedScheme = themeMode === "system" ? systemScheme : themeMode;
  const theme = resolvedScheme === "dark" ? darkTheme : lightTheme;
  const topInset =
    Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0;
  const styles = useMemo(() => createStyles(theme, topInset), [theme, topInset]);
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

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
  const startTimeRef = useRef<number>(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsRef = useRef(stats);
  const modeRef = useRef(mode);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { stats?: Stats; mode?: Mode };
          if (saved.stats) {
            setStats(saved.stats);
          }
          if (saved.mode) {
            setMode(saved.mode);
          }
        }
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (
          savedTheme === "light" ||
          savedTheme === "dark" ||
          savedTheme === "system"
        ) {
          setThemeMode(savedTheme);
        }
        const savedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings) as Partial<Settings>;
          setSettings((prev) => ({
            questionCount: parsed.questionCount ?? prev.questionCount,
            timeLimitSeconds: parsed.timeLimitSeconds ?? prev.timeLimitSeconds,
          }));
          if (typeof parsed.timeLimitSeconds === "number") {
            setTimeLeft(parsed.timeLimitSeconds);
          }
        }
      } catch {
        // Ignore storage errors.
      } finally {
        setReady(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        stats,
        mode,
      })
    ).catch(() => {
      // Ignore storage errors.
    });
  }, [ready, stats, mode]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    AsyncStorage.setItem(THEME_KEY, themeMode).catch(() => {
      // Ignore storage errors.
    });
  }, [ready, themeMode]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (screen === "menu") {
          return false;
        }
        goToMenu();
        return true;
      }
    );
    return () => subscription.remove();
  }, [goToMenu, screen]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {
      // Ignore storage errors.
    });
  }, [ready, settings]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
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
      const nextQuestion = createQuestion(nextMode, statsRef.current);
      beginQuestion(nextQuestion);
    },
    [beginQuestion, clearAdvanceTimer]
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
      setError("Tap numbers to continue.");
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
  }, [answered, answer, applyResult, clearAdvanceTimer, question]);

  const handleKeypadPress = useCallback(
    (key: string) => {
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
      setAnswer((prev) => {
        if (prev === "0") {
          return key;
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
      return;
    }
    setQuestionIndex(nextIndex);
    const nextQuestion = createQuestion(modeRef.current, statsRef.current);
    beginQuestion(nextQuestion);
  }, [
    answered,
    beginQuestion,
    clearAdvanceTimer,
    question,
    questionIndex,
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
    setThemeMode(resolvedScheme === "dark" ? "light" : "dark");
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

  useEffect(() => {
    if (screen !== "drill" || !question || answered) {
      return;
    }
    setTimeLeft(settings.timeLimitSeconds);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(interval);
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
    advanceTimerRef.current = setTimeout(() => {
      handleNext();
    }, 700);
    return () => {
      clearAdvanceTimer();
    };
  }, [feedback, clearAdvanceTimer, handleNext]);

  if (!fontsLoaded) {
    return (
      <LinearGradient colors={theme.gradient} style={styles.background} />
    );
  }

  const hasAttempts = Object.values(stats).some(
    (entry) => entry.history.length > 0
  );
  const weakestSkill = getWeakestSkill(stats);
  const weaknessText = hasAttempts ? SKILL_LABELS[weakestSkill] : "No data yet";
  const keypadRows = [
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
      icon: "shuffle",
    },
    {
      mode: "add" as const,
      label: "Addition",
      subtitle: "Sum drills",
      icon: "plus",
    },
    {
      mode: "sub" as const,
      label: "Subtraction",
      subtitle: "Minus drills",
      icon: "minus",
    },
    {
      mode: "mul" as const,
      label: "Multiplication",
      subtitle: "Times tables",
      icon: "x",
    },
    {
      mode: "div" as const,
      label: "Division",
      subtitle: "Quotient practice",
      icon: "divide",
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

  let content: JSX.Element | null = null;

  if (screen === "menu") {
    content = (
      <View>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Choose a drill</Text>
          <Text style={styles.heroText}>
            Pick a focus or use Random mix to adapt to your weakest skill.
          </Text>
          <View style={styles.menuMetaRow}>
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>
                {settings.questionCount} questions
              </Text>
            </View>
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>
                {settings.timeLimitSeconds}s per question
              </Text>
            </View>
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>
                Weakest: {weaknessText}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.menuGrid}>
          {menuItems.map((item) => (
            <Pressable
              key={item.mode}
              onPress={() => startSession(item.mode)}
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.menuButtonPressed,
              ]}
            >
              <View style={styles.menuIcon}>
                <Feather
                  name={item.icon as keyof typeof Feather.glyphMap}
                  size={18}
                  color={theme.colors.accentStrong}
                />
              </View>
              <View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub}>{item.subtitle}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.menuActions}>
          <Pressable
            onPress={() => setScreen("stats")}
            style={({ pressed }) => [
              styles.settingsButton,
              styles.menuActionButton,
              pressed && styles.settingsButtonPressed,
            ]}
          >
            <Feather name="bar-chart-2" size={18} color={theme.colors.text} />
            <Text style={styles.settingsButtonText}>Statistics</Text>
          </Pressable>
          <Pressable
            onPress={() => setScreen("settings")}
            style={({ pressed }) => [
              styles.settingsButton,
              styles.menuActionButton,
              pressed && styles.settingsButtonPressed,
            ]}
          >
            <Feather name="settings" size={18} color={theme.colors.text} />
            <Text style={styles.settingsButtonText}>Settings</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (screen === "drill") {
    content = (
      <View>
        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>
              Question {questionIndex}/{settings.questionCount}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              timeLeft <= 3 && styles.statusPillWarning,
            ]}
          >
            <Text style={styles.statusText}>Time {timeLeftLabel}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{modeLabel} drill</Text>
          <Text style={styles.sectionSub}>
            Answer fast and correct to level up.
          </Text>

          {question ? (
            <View style={styles.questionCard}>
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>
                    Skill: {SKILL_LABELS[question.skill]}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>
                    Level {question.level}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>
                    Target {formatMs(getTargetMs(question.level))}
                  </Text>
                </View>
              </View>

              <Text style={styles.questionText}>{question.text}</Text>

              <View style={styles.answerBlock}>
                <View style={styles.answerDisplay}>
                  <Text
                    style={
                      answer.length === 0
                        ? styles.answerPlaceholder
                        : styles.answerDisplayText
                    }
                  >
                    {answer.length === 0 ? "Tap numbers" : answer}
                  </Text>
                </View>
                <View style={styles.keypad}>
                  {keypadRows.map((row, rowIndex) => (
                    <View key={`row-${rowIndex}`} style={styles.keypadRow}>
                      {row.map((key) => {
                        const isActionKey = key === "CLR" || key === "DEL";
                        return (
                          <Pressable
                            key={key}
                            onPress={() => handleKeypadPress(key)}
                            disabled={answered}
                            style={({ pressed }) => [
                              styles.keypadButton,
                              isActionKey && styles.keypadButtonAlt,
                              answered && styles.keypadButtonDisabled,
                              pressed && styles.keypadButtonPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.keypadButtonText,
                                isActionKey && styles.keypadButtonAltText,
                                answered && styles.keypadButtonTextDisabled,
                              ]}
                            >
                              {key}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={answered}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      answered && styles.buttonDisabled,
                      pressed && styles.primaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>Check</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleNext}
                    disabled={!answered}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      !answered && styles.buttonDisabled,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Next</Text>
                  </Pressable>
                </View>
              </View>

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}
              {feedback ? (
                <View
                  style={[
                    styles.feedback,
                    feedback.correct
                      ? styles.feedbackCorrect
                      : styles.feedbackWrong,
                  ]}
                >
                  <Text style={styles.feedbackText}>{feedbackText}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.sectionSub}>Loading your question...</Text>
          )}

          <View style={styles.sessionRow}>
            <View>
              <Text style={styles.sessionLabel}>Session score</Text>
              <Text style={styles.sessionValue}>
                {session.correct} correct / {session.wrong} wrong
              </Text>
            </View>
            <Text style={styles.sessionHint}>Stay focused and keep moving.</Text>
          </View>
        </View>
      </View>
    );
  }

  if (screen === "stats") {
    content = (
      <View>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Statistics</Text>
          <Text style={styles.heroText}>
            Recent performance across your drills (last 12 attempts per skill).
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Overall</Text>
          <Text style={styles.sectionSub}>
            Based on your recent attempts across all skills.
          </Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Accuracy</Text>
              <Text style={styles.summaryValue}>{overallAccuracy}%</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Attempts</Text>
              <Text style={styles.summaryValue}>{allAttempts}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Avg time</Text>
              <Text style={styles.summaryValue}>
                {allAttempts ? formatMs(overallAvgMs) : "-"}
              </Text>
            </View>
          </View>
          <View style={styles.statBar}>
            <View
              style={[
                styles.statBarFill,
                { width: `${overallAccuracy}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.statGrid}>
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
              <View key={skill} style={styles.statCard}>
                <View style={styles.statHeader}>
                  <Text style={styles.statTitle}>{SKILL_LABELS[skill]}</Text>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelBadgeText}>
                      Level {stats[skill].level}
                    </Text>
                  </View>
                </View>
                <View style={styles.statBar}>
                  <View style={[styles.statBarFill, { width: barWidth }]} />
                </View>
                <View style={styles.statMetrics}>
                  <View>
                    <Text style={styles.metricLabel}>Accuracy</Text>
                    <Text style={styles.metricValue}>{accuracyText}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View>
                    <Text style={styles.metricLabel}>Avg time</Text>
                    <Text style={styles.metricValue}>{speedText}</Text>
                  </View>
                </View>
                <View style={styles.dotRow}>
                  {history.length === 0 ? (
                    <Text style={styles.dotEmpty}>No attempts yet</Text>
                  ) : (
                    history.map((item, index) => (
                      <View
                        key={`${skill}-${index}`}
                        style={[
                          styles.dot,
                          item.correct ? styles.dotCorrect : styles.dotWrong,
                        ]}
                      />
                    ))
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  if (screen === "summary") {
    content = (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Session complete</Text>
        <Text style={styles.sectionSub}>{modeLabel} drill</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Accuracy</Text>
            <Text style={styles.summaryValue}>{accuracy}%</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Correct</Text>
            <Text style={styles.summaryValue}>{session.correct}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Wrong</Text>
            <Text style={styles.summaryValue}>{session.wrong}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => startSession(mode)}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Practice again</Text>
        </Pressable>
        <Pressable
          onPress={goToMenu}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Back to menu</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === "settings") {
    content = (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <Text style={styles.sectionSub}>
          Tune the session size and time per question.
        </Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Questions per session</Text>
            <Text style={styles.settingHint}>Default is 10</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => adjustQuestionCount(-1)}
              style={({ pressed }) => [
                styles.stepperButton,
                pressed && styles.stepperButtonPressed,
              ]}
            >
              <Text style={styles.stepperButtonText}>-</Text>
            </Pressable>
            <Text style={styles.stepperValue}>{settings.questionCount}</Text>
            <Pressable
              onPress={() => adjustQuestionCount(1)}
              style={({ pressed }) => [
                styles.stepperButton,
                pressed && styles.stepperButtonPressed,
              ]}
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Time per question</Text>
            <Text style={styles.settingHint}>Seconds allowed</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => adjustTimeLimit(-5)}
              style={({ pressed }) => [
                styles.stepperButton,
                pressed && styles.stepperButtonPressed,
              ]}
            >
              <Text style={styles.stepperButtonText}>-</Text>
            </Pressable>
            <Text style={styles.stepperValue}>
              {settings.timeLimitSeconds}s
            </Text>
            <Pressable
              onPress={() => adjustTimeLimit(5)}
              style={({ pressed }) => [
                styles.stepperButton,
                pressed && styles.stepperButtonPressed,
              ]}
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => [
            styles.themeToggle,
            pressed && styles.themeTogglePressed,
          ]}
        >
          <View style={styles.themeIcon}>
            <Feather
              name={resolvedScheme === "dark" ? "moon" : "sun"}
              size={16}
              color={theme.colors.accentStrong}
            />
          </View>
          <View style={styles.themeText}>
            <Text style={styles.themeLabel}>Theme</Text>
            <Text style={styles.themeName}>
              {resolvedScheme === "dark" ? "Dark" : "Light"}
            </Text>
          </View>
          <View
            style={[
              styles.themeSwitch,
              resolvedScheme === "dark" && styles.themeSwitchOn,
            ]}
          >
            <View
              style={[
                styles.themeKnob,
                resolvedScheme === "dark" && styles.themeKnobOn,
              ]}
            />
          </View>
        </Pressable>

        <Pressable
          onPress={resetStats}
          style={({ pressed }) => [
            styles.dangerButton,
            pressed && styles.dangerButtonPressed,
          ]}
        >
          <Text style={styles.dangerButtonText}>Reset all stats</Text>
        </Pressable>

        <Pressable
          onPress={goToMenu}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Back to menu</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <LinearGradient colors={theme.gradient} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={theme.statusBarStyle} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.contentWrap}>
            <View style={styles.appBar}>
              <View style={styles.appBarLeft}>
                {screen === "menu" ? (
                  <View style={styles.brandMark}>
                    <Text style={styles.brandMarkText}>MT</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={goToMenu}
                    style={({ pressed }) => [
                      styles.appBarBack,
                      pressed && styles.appBarBackPressed,
                    ]}
                  >
                    <Feather
                      name="arrow-left"
                      size={16}
                      color={theme.colors.text}
                    />
                  </Pressable>
                )}
                <Text
                  style={styles.appBarTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {appBarTitle}
                </Text>
              </View>
            </View>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {content}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (theme: Theme, topInset: number) =>
  StyleSheet.create({
    background: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    flex: {
      flex: 1,
    },
    contentWrap: {
      flex: 1,
    },
    appBar: {
      paddingTop: topInset + 12,
      paddingBottom: 12,
      paddingHorizontal: 20,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    appBarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    appBarBack: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    appBarBackPressed: {
      transform: [{ translateY: 1 }],
    },
    appBarTitle: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 18,
      color: theme.colors.text,
      flexShrink: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 16,
      paddingBottom: 80,
    },
    themeToggle: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 18,
      marginBottom: 12,
      backgroundColor: theme.colors.surface,
    },
    themeTogglePressed: {
      transform: [{ translateY: 1 }],
    },
    themeIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    themeText: {
      marginRight: 10,
    },
    themeLabel: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 10,
      color: theme.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    themeName: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 13,
      color: theme.colors.text,
      marginTop: 2,
    },
    themeSwitch: {
      width: 34,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.colors.border,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    themeSwitchOn: {
      backgroundColor: theme.colors.accent,
    },
    themeKnob: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    themeKnobOn: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.surfaceSoft,
    },
    brandMark: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    brandMarkText: {
      color: "#fff",
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 16,
      letterSpacing: -0.5,
    },
    hero: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    heroTitle: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 26,
      color: theme.colors.text,
      marginBottom: 8,
    },
    heroText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 15,
      color: theme.colors.muted,
      lineHeight: 22,
    },
    menuMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    metaBadge: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: theme.colors.surfaceSoft,
    },
    metaBadgeText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 11,
      color: theme.colors.muted,
    },
    menuGrid: {
      marginBottom: 12,
    },
    menuActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    menuActionButton: {
      flexGrow: 1,
      justifyContent: "center",
    },
    menuButton: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      padding: 14,
      backgroundColor: theme.colors.surface,
      marginBottom: 12,
    },
    menuButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    menuIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    menuLabel: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 15,
      color: theme.colors.text,
    },
    menuSub: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 12,
      color: theme.colors.muted,
      marginTop: 2,
    },
    settingsButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingVertical: 12,
      gap: 8,
      backgroundColor: theme.colors.surface,
    },
    settingsButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    settingsButtonText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 14,
      color: theme.colors.text,
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surface,
    },
    statusPillWarning: {
      borderColor: theme.colors.accentStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    statusText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 12,
      color: theme.colors.text,
    },
    statBar: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.borderStrong,
      overflow: "hidden",
      marginTop: 12,
      marginBottom: 12,
    },
    statBarFill: {
      height: "100%",
      backgroundColor: theme.colors.accent,
    },
    modeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 16,
    },
    modeButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: theme.colors.surfaceSoft,
    },
    modeButtonActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accentStrong,
    },
    modeButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    modeButtonText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 13,
      color: theme.colors.text,
    },
    modeButtonTextActive: {
      color: "#fff",
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    practiceHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      marginBottom: 14,
    },
    sectionTitle: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 18,
      color: theme.colors.text,
      marginBottom: 4,
    },
    sectionSub: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 13,
      color: theme.colors.muted,
    },
    sectionStrong: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      color: theme.colors.text,
    },
    ghostButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      alignSelf: "flex-start",
      marginTop: 6,
    },
    ghostButtonText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 12,
      color: theme.colors.muted,
    },
    questionCard: {
      backgroundColor: theme.colors.surfaceStrong,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      padding: 16,
      marginBottom: 16,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
    },
    metaPill: {
      backgroundColor: theme.colors.chipBg,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 8,
      marginBottom: 8,
    },
    metaPillText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 12,
      color: theme.colors.chipText,
    },
    questionText: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 32,
      color: theme.colors.text,
      marginBottom: 12,
    },
    answerBlock: {
      marginBottom: 12,
    },
    answerDisplay: {
      borderWidth: 2,
      borderColor: theme.colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.colors.inputBg,
      minHeight: 52,
      justifyContent: "center",
      marginBottom: 12,
    },
    answerDisplayText: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 22,
      color: theme.colors.text,
      textAlign: "right",
    },
    answerPlaceholder: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 16,
      color: theme.colors.muted,
      textAlign: "right",
    },
    keypad: {
      marginHorizontal: -4,
      marginBottom: 8,
    },
    keypadRow: {
      flexDirection: "row",
      marginBottom: 8,
    },
    keypadButton: {
      flex: 1,
      marginHorizontal: 4,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 12,
      paddingVertical: 12,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    keypadButtonAlt: {
      backgroundColor: theme.colors.surface,
    },
    keypadButtonDisabled: {
      opacity: 0.5,
    },
    keypadButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    keypadButtonText: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 16,
      color: theme.colors.text,
    },
    keypadButtonAltText: {
      color: theme.colors.muted,
    },
    keypadButtonTextDisabled: {
      color: theme.colors.muted,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 4,
    },
    primaryButton: {
      flexGrow: 1,
      backgroundColor: theme.colors.accent,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginRight: 10,
      marginBottom: 10,
      alignItems: "center",
    },
    primaryButtonPressed: {
      opacity: 0.9,
      transform: [{ translateY: 1 }],
    },
    primaryButtonText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 14,
      color: "#fff",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    secondaryButton: {
      flexGrow: 1,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 10,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
    },
    secondaryButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    secondaryButtonText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 14,
      color: theme.colors.text,
    },
    errorText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 13,
      color: theme.colors.errorText,
      marginBottom: 8,
    },
    feedback: {
      borderRadius: 12,
      padding: 10,
    },
    feedbackCorrect: {
      backgroundColor: theme.colors.successBg,
    },
    feedbackWrong: {
      backgroundColor: theme.colors.errorBg,
    },
    feedbackText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 13,
      color: theme.colors.text,
    },
    sessionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      marginTop: 8,
    },
    sessionLabel: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 11,
      color: theme.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    sessionValue: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 16,
      color: theme.colors.text,
      marginTop: 4,
    },
    sessionHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 13,
      color: theme.colors.muted,
      marginTop: 8,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 16,
      marginBottom: 20,
      gap: 12,
    },
    summaryCard: {
      flexGrow: 1,
      minWidth: 120,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
      padding: 14,
    },
    summaryLabel: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 11,
      color: theme.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    summaryValue: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 20,
      color: theme.colors.text,
      marginTop: 6,
    },
    settingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      marginTop: 16,
      marginBottom: 8,
      gap: 12,
    },
    settingInfo: {
      flexShrink: 1,
    },
    settingLabel: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 14,
      color: theme.colors.text,
    },
    settingHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 12,
      color: theme.colors.muted,
      marginTop: 4,
    },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
    },
    stepperButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surfaceSoft,
    },
    stepperButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    stepperButtonText: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 14,
      color: theme.colors.text,
    },
    stepperValue: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 14,
      color: theme.colors.text,
      marginHorizontal: 10,
    },
    dangerButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 18,
      alignItems: "center",
      backgroundColor: theme.colors.surfaceSoft,
    },
    dangerButtonPressed: {
      transform: [{ translateY: 1 }],
    },
    dangerButtonText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 13,
      color: theme.colors.errorText,
    },
    adSlot: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.colors.borderStrong,
      borderRadius: 14,
      backgroundColor: theme.colors.adBg,
      padding: 14,
      alignItems: "center",
      marginTop: 14,
    },
    adText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 12,
      color: theme.colors.adText,
    },
    statsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      marginBottom: 12,
    },
    statsHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 12,
      color: theme.colors.muted,
      marginTop: 6,
      maxWidth: 200,
    },
    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -6,
    },
    statCard: {
      backgroundColor: theme.colors.surfaceSoft,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      padding: 14,
      width: "100%",
      marginHorizontal: 6,
      marginBottom: 12,
    },
    statHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    statTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 15,
      color: theme.colors.text,
    },
    levelBadge: {
      backgroundColor: theme.colors.levelBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    levelBadgeText: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 11,
      color: theme.colors.levelText,
    },
    statMetrics: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    metricLabel: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 11,
      color: theme.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 4,
    },
    metricValue: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 14,
      color: theme.colors.text,
    },
    metricDivider: {
      width: 1,
      height: 34,
      backgroundColor: theme.colors.borderStrong,
      marginHorizontal: 16,
    },
    dotRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.borderStrong,
      marginRight: 6,
      marginBottom: 6,
    },
    dotCorrect: {
      backgroundColor: theme.colors.dotOk,
    },
    dotWrong: {
      backgroundColor: theme.colors.dotBad,
    },
    dotEmpty: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 12,
      color: theme.colors.muted,
    },
  });
