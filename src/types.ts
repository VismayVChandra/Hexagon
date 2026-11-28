export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro';

/** What plays while the timer runs: the honeycomb (default), a car being built, or just a ring. */
export type Scene = 'honeycomb' | 'car' | 'minimal';

/** A background sound that can play during a session. */
export type AmbientSound = 'off' | 'rain' | 'storm' | 'waves' | 'stream' | 'forest' | 'fire' | 'night' | 'wind' | 'brown' | 'white';

/** Every ambient sound that can be chosen (also used to check saved settings). */
export const AMBIENT_IDS: readonly AmbientSound[] = ['off', 'rain', 'storm', 'waves', 'stream', 'forest', 'fire', 'night', 'wind', 'brown', 'white'];

/** The voice used for timer sounds: bell, marimba, harp or a plain beep. */
export type CueTone = 'bell' | 'marimba' | 'harp' | 'beep';
export const CUE_TONES: readonly CueTone[] = ['bell', 'marimba', 'harp', 'beep'];

/** One line of a session's plan: something to get done before finishing. */
export interface PlanTask {
  id: string;
  text: string;
  done: boolean;
}

/** How focused the student felt, 1 (scattered) to 5 (locked in). */
export type FocusRating = 1 | 2 | 3 | 4 | 5;

/** A car the student has finished building. */
export interface GarageItem {
  carId: string;
  at: number;
}

export interface PomodoroConfig {
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  /** Focus blocks before a long break. */
  cyclesBeforeLong: number;
}

export interface TimerConfig {
  mode: TimerMode;
  /** Countdown length in minutes (countdown mode). */
  targetMin?: number;
  pomodoro?: PomodoroConfig;
}

/** How a subject was last studied, so the next session can start the same way in one tap. */
export interface SetupMemory {
  config: TimerConfig;
  scene: Scene;
  /** Only for the car scene. */
  carId?: string;
}

export interface Subject {
  id: string;
  name: string;
  /** Index into the subject colour palette. */
  color: number;
  demo?: boolean;
}

export interface StudySession {
  id: string;
  subjectId: string;
  topic: string;
  goal: string;
  notes: string;
  mode: TimerMode;
  startedAt: number;
  endedAt: number;
  /** Time counted as studying (excludes pauses and Pomodoro breaks). */
  studiedMs: number;
  /** Pomodoro break time (not counted as studying). */
  breakMs: number;
  friendIds: string[];
  roomId?: string;
  scene?: Scene;
  carId?: string;
  /** Logged by hand rather than timed. */
  manual?: boolean;
  demo?: boolean;
  /** The plan the student made for this session, with what got ticked off. */
  tasks?: PlanTask[];
  /** How focused it felt, if the student said. */
  focus?: FocusRating;
}

export interface ActiveSession {
  id: string;
  subjectId: string;
  topic: string;
  goal: string;
  config: TimerConfig;
  startedAt: number;
  /** Running time accumulated before the current run segment. */
  runMs: number;
  /** Start of the current run segment, or null while paused. */
  resumedAt: number | null;
  /** Heartbeat used to detect long gaps after the app was closed. */
  lastSeenAt: number;
  friendIds: string[];
  roomId?: string;
  scene?: Scene;
  /** The car being built, when scene is 'car'. */
  carId?: string;
  /** What the student plans to get done; ticked off during the session. */
  tasks?: PlanTask[];
}

export interface Exam {
  id: string;
  subjectId: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  notes: string;
  /** Study hours the student would like to put in before the exam. */
  targetHours: number;
  createdAt: number;
  demo?: boolean;
}

export interface Friend {
  id: string;
  name: string;
  hue: number;
  /** Whether this friend chooses to show their subject. */
  sharesSubject: boolean;
  /** Parameters for the simulated presence (demo only). */
  sim: { periodMin: number; offsetMin: number; studyMin: number; subjects: string[] };
  demo: true;
}

export type ThemePref = 'system' | 'light' | 'dark';
/** The overall look. Works together with light/dark. */
export type SkinPref = 'quiet' | 'pop';

export interface Settings {
  displayName: string;
  dailyGoalMin: number;
  weeklyGoalMin: number;
  pomodoro: PomodoroConfig;
  /** Appearance. `system` follows the device. */
  theme: ThemePref;
  /** The look: Quiet Hive (calm) or Honey Pop (playful). Stays on this device, like the light/dark choice. */
  skin: SkinPref;
  /** The first-run welcome has been completed (or skipped). */
  onboarded: boolean;
  /** The scene used for the next session (remembered from the last one). */
  scene: Scene;
  keepAwake: boolean;
  /** Timer sounds: start, pause, block end, timer done, rewards. */
  sound: boolean;
  /** Which voice the timer sounds use. */
  cueTone: CueTone;
  /** Timer sound volume, 0 to 1. */
  cueVolume: number;
  /** Ring the "time's up" alarm three times (until the student taps), not just once. */
  cueRepeat: boolean;
  /** Stopwatch: a soft chime every this many minutes (0 = never). */
  stopwatchChimeMin: number;
  /** Background sound while studying (rain, waves, forest, brown noise and more). Generated on the device, so it works offline. */
  ambient: AmbientSound;
  /** Background sound volume, 0 to 1. */
  ambientVolume: number;
  /** Short vibrations on key actions, where the browser supports them. */
  haptics: boolean;
  /** Privacy: appear to friends as "studying" while in a session. On by default, and easy to switch off in Settings. */
  sharePresence: boolean;
  /** Privacy: also show the subject. Off by default. */
  shareSubject: boolean;
  lastSubjectId?: string;
  /** The timer and scene last used for each subject (by subject id). Stays on this device. */
  lastSetups: Record<string, SetupMemory>;
  installHintDismissed: boolean;
  /** Privacy: send anonymous usage counts (opens, sessions started) so the app's owner can see what is used. On by default, with a note on Home. */
  analytics: boolean;
  analyticsNoticeDismissed: boolean;
  /** Notifications the student asked for (the browser's permission is separate). */
  notify: boolean;
  /** Tell me when a timer, focus block or break ends while Hexagon is in the background. */
  notifyTimer: boolean;
  /** Tell me what I earned (honey, cars, streaks, daily goal). */
  notifyRewards: boolean;
  /** Gently remind me if I haven't studied for a day or more. */
  notifyNudges: boolean;
  /** Hour of day (0 to 23) for come-back reminders. */
  nudgeHour: number;
  /** The one-time "want notifications?" card on Home was answered or dismissed. */
  notifyPromptDismissed: boolean;
  /** While signed in, keep a copy of my study data in my account so every device I sign in on has it. */
  cloudSync: boolean;
  /** The one-time "keep your hive safe, make an account" card on Home was dismissed. */
  accountPromptDismissed: boolean;
  /** The one-time "let friends see when you study?" card on Home was answered (or the switch was used in Settings). */
  presencePromptDismissed: boolean;
}

export interface AppData {
  version: 1;
  settings: Settings;
  subjects: Subject[];
  sessions: StudySession[];
  exams: Exam[];
  friends: Friend[];
  active: ActiveSession | null;
  /** Cars finished. */
  garage: GarageItem[];
  /** Focus time put into each unfinished car (milliseconds, by car id). */
  builds: Record<string, number>;
}

export type FriendState = 'studying' | 'online' | 'finished' | 'offline';

/** What the celebration card shows right after a session is saved. */
export interface SessionSummary {
  sessionId: string;
  subjectId: string;
  studiedMs: number;
  todayMs: number;
  dailyGoalMs: number;
  /** This session is what took today past the daily goal. */
  goalReached: boolean;
  streakDays: number;
  /** Today counted toward the streak for the first time. */
  streakExtended: boolean;
  /** The current streak is the longest the student has had. */
  newBestStreak: boolean;
  weekMs: number;
  weeklyGoalMs: number;
  /** Honey cells this session added to the hive. */
  cellsAdded: number;
  hiveCells: number;
  rankUp?: { from: string; to: string };
  /** This session earned today's golden cell. */
  goldenEarned: boolean;
  car?: { id: string; name: string; completed: boolean; progress: number };
  /** The session's plan, if it had one. */
  tasks?: { done: number; total: number };
}
