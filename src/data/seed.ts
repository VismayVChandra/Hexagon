import type { AppData, Exam, Friend, Settings, StudySession, Subject } from '../types';
import { DAY, MIN, addDays, dayKey, parseDayKey } from '../lib/time';
import { mulberry32 } from '../lib/id';

export const SUBJECT_COLORS = ['#4F8A6B', '#4A6FA5', '#C4694A', '#D4A02C', '#8E5C86', '#3F8F9A', '#C46A7D', '#6B7A8F'];

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  dailyGoalMin: 90,
  weeklyGoalMin: 8 * 60,
  pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 },
  keepAwake: true,
  sound: true,
  sharePresence: false,
  shareSubject: false,
  installHintDismissed: false,
};

const TOPICS: Record<string, string[]> = {
  biology: ['Cell respiration', 'Mitosis vs meiosis', 'Photosynthesis flashcards', 'Genetics practice problems', 'Enzyme kinetics'],
  calculus: ['Integration by parts', 'Related rates', 'Series convergence', 'Past paper 2022', 'Chain rule drills'],
  literature: ['Essay outline: Gatsby', 'Close reading notes', 'Poetry annotation', 'Thesis statement drafts'],
  chemistry: ['Equilibrium problems', 'Acid-base titration', 'Organic mechanisms', 'Lab report write-up'],
};

/** Demo content so the app looks lived-in on first launch. Everything is flagged `demo` and removable. */
export function createSeed(now = Date.now()): AppData {
  const rnd = mulberry32(20260901);
  const subjects: Subject[] = [
    { id: 'sub_biology', name: 'Biology', color: 0, demo: true },
    { id: 'sub_calculus', name: 'Calculus', color: 1, demo: true },
    { id: 'sub_literature', name: 'Literature', color: 2, demo: true },
    { id: 'sub_chemistry', name: 'Chemistry', color: 3, demo: true },
  ];
  const weights = [0.28, 0.3, 0.16, 0.26];
  const keys = ['biology', 'calculus', 'literature', 'chemistry'];
  const today = dayKey(now);
  const sessions: StudySession[] = [];
  let n = 0;

  for (let back = 1; back <= 49; back++) {
    const day = addDays(today, -back);
    const dow = (parseDayKey(day).getDay() + 6) % 7;
    // Quieter weekends, a couple of rest days, and a gentle build-up over the weeks.
    const skipChance = dow >= 5 ? 0.45 : 0.14;
    if (back > 3 && rnd() < skipChance) continue;
    const trend = 1 - back / 120;
    const count = rnd() < 0.4 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      let r = rnd();
      let si = 0;
      for (; si < weights.length - 1; si++) {
        if (r < weights[si]) break;
        r -= weights[si];
      }
      const studiedMin = Math.round((25 + rnd() * 65) * trend / 5) * 5;
      const startHour = i === 0 ? 9 + Math.floor(rnd() * 5) : 17 + Math.floor(rnd() * 4);
      const base = parseDayKey(day);
      base.setHours(startHour, Math.floor(rnd() * 4) * 15, 0, 0);
      const startedAt = base.getTime();
      const pomodoro = rnd() < 0.45;
      const breakMin = pomodoro ? Math.floor(studiedMin / 25) * 5 : 0;
      const topics = TOPICS[keys[si]];
      sessions.push({
        id: `ses_demo_${n++}`,
        subjectId: subjects[si].id,
        topic: topics[Math.floor(rnd() * topics.length)],
        goal: '',
        notes: '',
        mode: pomodoro ? 'pomodoro' : 'stopwatch',
        startedAt,
        endedAt: startedAt + (studiedMin + breakMin) * MIN,
        studiedMs: studiedMin * MIN,
        breakMs: breakMin * MIN,
        friendIds: [],
        demo: true,
      });
    }
  }

  const exams: Exam[] = [
    { id: 'exm_demo_1', subjectId: 'sub_calculus', date: addDays(today, 9), notes: 'Chapters 5-8. Bring graphing calculator.', targetHours: 12, createdAt: now - 21 * DAY, demo: true },
    { id: 'exm_demo_2', subjectId: 'sub_chemistry', date: addDays(today, 16), notes: 'Equilibrium and acids/bases.', targetHours: 10, createdAt: now - 21 * DAY, demo: true },
    { id: 'exm_demo_3', subjectId: 'sub_literature', date: addDays(today, 31), notes: 'Essay exam. Two set texts.', targetHours: 8, createdAt: now - 14 * DAY, demo: true },
  ];

  const friends: Friend[] = [
    { id: 'frd_maya', name: 'Maya', hue: 160, sharesSubject: true, sim: { periodMin: 170, offsetMin: 20, studyMin: 60, subjects: ['Organic chemistry', 'Lab report', 'Flashcards'] }, demo: true },
    { id: 'frd_leo', name: 'Leo', hue: 215, sharesSubject: false, sim: { periodMin: 200, offsetMin: 95, studyMin: 75, subjects: ['Linear algebra'] }, demo: true },
    { id: 'frd_priya', name: 'Priya', hue: 25, sharesSubject: true, sim: { periodMin: 160, offsetMin: 140, studyMin: 50, subjects: ['Anatomy', 'Biochemistry'] }, demo: true },
    { id: 'frd_sam', name: 'Sam', hue: 45, sharesSubject: true, sim: { periodMin: 230, offsetMin: 40, studyMin: 80, subjects: ['Macroeconomics', 'Statistics'] }, demo: true },
    { id: 'frd_noor', name: 'Noor', hue: 300, sharesSubject: false, sim: { periodMin: 190, offsetMin: 175, studyMin: 55, subjects: ['Essay drafting'] }, demo: true },
  ];

  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    subjects,
    sessions,
    exams,
    friends,
    active: null,
  };
}

export function emptyData(): AppData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, subjects: [], sessions: [], exams: [], friends: [], active: null };
}

export const PRESET_COUNTDOWNS = [25, 45, 60, 90];
