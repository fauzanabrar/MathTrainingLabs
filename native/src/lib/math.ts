export type SkillKey = "add" | "sub" | "mul" | "div";
export type Mode = SkillKey | "mix";

export interface Result {
  correct: boolean;
  ms: number;
}

export interface SkillStats {
  level: number;
  streak: number;
  mistakeStreak: number;
  history: Result[];
}

export type Stats = Record<SkillKey, SkillStats>;

interface LevelSpec {
  minA?: number;
  maxA: number;
  minB?: number;
  maxB: number;
  allowNegative?: boolean;
}

const MAX_HISTORY = 12;
export const MAX_LEVEL = 50;

const buildLinearLevels = (base: number[], step: number) => {
  const levels = base
    .slice(0, MAX_LEVEL)
    .map((max) => ({ maxA: max, maxB: max }));
  if (levels.length === 0) {
    return levels;
  }
  let current = levels[levels.length - 1].maxA;
  for (let i = levels.length; i < MAX_LEVEL; i += 1) {
    current += step;
    levels.push({ maxA: current, maxB: current });
  }
  return levels;
};

const buildDivLevels = (base: LevelSpec[]) => {
  const levels = base.slice(0, MAX_LEVEL);
  if (levels.length === 0) {
    return levels;
  }
  const startIndex = levels.length;
  let maxA = levels[levels.length - 1].maxA;
  let maxB = levels[levels.length - 1].maxB;
  let minA = levels[levels.length - 1].minA ?? 1;
  for (let i = startIndex; i < MAX_LEVEL; i += 1) {
    maxA += 5;
    maxB += 4;
    const added = i - startIndex + 1;
    if (added % 5 === 0) {
      minA += 1;
    }
    levels.push({ minA, maxA, minB: 0, maxB });
  }
  return levels;
};

const BASE_ADD_LEVELS = [10, 20, 30, 50, 75, 100, 150, 250, 500, 1000, 1500, 2000];
const BASE_MUL_LEVELS = [5, 9, 12, 15, 20, 25, 30, 40, 50, 60, 75, 90];
const BASE_DIV_LEVELS: LevelSpec[] = [
  { minA: 1, maxA: 5, minB: 0, maxB: 5 },
  { minA: 1, maxA: 9, minB: 0, maxB: 9 },
  { minA: 1, maxA: 12, minB: 0, maxB: 12 },
  { minA: 2, maxA: 15, minB: 0, maxB: 12 },
  { minA: 2, maxA: 20, minB: 0, maxB: 15 },
  { minA: 2, maxA: 25, minB: 0, maxB: 20 },
  { minA: 3, maxA: 30, minB: 0, maxB: 25 },
  { minA: 3, maxA: 40, minB: 0, maxB: 30 },
  { minA: 4, maxA: 50, minB: 0, maxB: 40 },
  { minA: 5, maxA: 60, minB: 0, maxB: 50 },
  { minA: 6, maxA: 75, minB: 0, maxB: 60 },
  { minA: 8, maxA: 90, minB: 0, maxB: 70 },
];

const LEVELS: Record<SkillKey, LevelSpec[]> = {
  add: buildLinearLevels(BASE_ADD_LEVELS, 250),
  sub: buildLinearLevels(BASE_ADD_LEVELS, 250),
  mul: buildLinearLevels(BASE_MUL_LEVELS, 5),
  div: buildDivLevels(BASE_DIV_LEVELS),
};

const SKILL_LIST: SkillKey[] = ["add", "sub", "mul", "div"];

export const SKILL_LABELS: Record<SkillKey, string> = {
  add: "Addition",
  sub: "Subtraction",
  mul: "Multiplication",
  div: "Division",
};

export const SKILL_SYMBOLS: Record<SkillKey, string> = {
  add: "+",
  sub: "-",
  mul: "x",
  div: "/",
};

export interface Question {
  id: string;
  text: string;
  answer: number;
  skill: SkillKey;
  level: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const randomInt = (min: number, max: number) => {
  const safeMin = Math.ceil(min);
  const safeMax = Math.floor(max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
};

const getLevelSpec = (skill: SkillKey, level: number) => {
  const specs = LEVELS[skill];
  return specs[clamp(level - 1, 0, specs.length - 1)];
};

export const createDefaultStats = (): Stats => ({
  add: { level: 1, streak: 0, mistakeStreak: 0, history: [] },
  sub: { level: 1, streak: 0, mistakeStreak: 0, history: [] },
  mul: { level: 1, streak: 0, mistakeStreak: 0, history: [] },
  div: { level: 1, streak: 0, mistakeStreak: 0, history: [] },
});

const accuracyFromHistory = (history: Result[]) => {
  if (history.length === 0) {
    return 0;
  }
  const correct = history.reduce(
    (total, item) => total + (item.correct ? 1 : 0),
    0
  );
  return correct / history.length;
};

export const getAccuracy = (stats: SkillStats) =>
  accuracyFromHistory(stats.history);

export const getAverageMs = (stats: SkillStats) => {
  if (stats.history.length === 0) {
    return 0;
  }
  const total = stats.history.reduce((sum, item) => sum + item.ms, 0);
  return total / stats.history.length;
};

export const getTargetMs = (level: number) => {
  const base = 6000;
  const drop = 300;
  return clamp(base - level * drop, 2400, 6000);
};

export const getWeakestSkill = (stats: Stats): SkillKey => {
  let weakest: SkillKey = SKILL_LIST[0];
  let weakestScore = 1;

  SKILL_LIST.forEach((skill) => {
    const history = stats[skill].history;
    const score = history.length === 0 ? 0.55 : accuracyFromHistory(history);
    if (score < weakestScore) {
      weakestScore = score;
      weakest = skill;
    }
  });

  return weakest;
};

export const pickSkill = (stats: Stats): SkillKey => {
  const weighted = SKILL_LIST.map((skill) => {
    const history = stats[skill].history;
    const accuracy = history.length === 0 ? 0.55 : accuracyFromHistory(history);
    const weight = Math.max(0.15, 1 - accuracy);
    return { skill, weight };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) {
      return item.skill;
    }
  }

  return "add";
};

export const updateStats = (
  stats: Stats,
  skill: SkillKey,
  correct: boolean,
  ms: number
): Stats => {
  const current = stats[skill];
  const nextHistory = [...current.history, { correct, ms }].slice(
    -MAX_HISTORY
  );
  const nextStreak = correct ? current.streak + 1 : 0;
  const nextMistakeStreak = correct ? 0 : current.mistakeStreak + 1;
  const levelMax = LEVELS[skill].length;
  let nextLevel = current.level;
  let leveledUp = false;
  let leveledDown = false;

  if (correct && nextStreak >= 3 && ms <= getTargetMs(current.level)) {
    nextLevel = clamp(current.level + 1, 1, levelMax);
    leveledUp = nextLevel !== current.level;
  }

  if (!correct && nextMistakeStreak >= 2) {
    nextLevel = clamp(current.level - 1, 1, levelMax);
    leveledDown = nextLevel !== current.level;
  }

  return {
    ...stats,
    [skill]: {
      ...current,
      level: nextLevel,
      streak: correct && !leveledUp ? nextStreak : 0,
      mistakeStreak: !correct && !leveledDown ? nextMistakeStreak : 0,
      history: nextHistory,
    },
  };
};

export const generateQuestion = (
  skill: SkillKey,
  level: number,
  options?: { allowNegative?: boolean }
): Question => {
  const spec = getLevelSpec(skill, level);
  const minA = spec.minA ?? 0;
  const minB = spec.minB ?? 0;
  const a = randomInt(minA, spec.maxA);
  const b = randomInt(minB, spec.maxB);

  if (skill === "add") {
    return {
      id: `${skill}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: `${a} + ${b}`,
      answer: a + b,
      skill,
      level,
    };
  }

  if (skill === "sub") {
    const allowNegative = options?.allowNegative ?? spec.allowNegative ?? false;
    const high = allowNegative ? a : Math.max(a, b);
    const low = allowNegative ? b : Math.min(a, b);
    return {
      id: `${skill}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: `${high} - ${low}`,
      answer: high - low,
      skill,
      level,
    };
  }

  if (skill === "mul") {
    return {
      id: `${skill}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: `${a} x ${b}`,
      answer: a * b,
      skill,
      level,
    };
  }

  const divisor = Math.max(1, a);
  const quotient = b;
  const dividend = divisor * quotient;
  return {
    id: `${skill}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: `${dividend} / ${divisor}`,
    answer: quotient,
    skill,
    level,
  };
};
