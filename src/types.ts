export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro';

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
  /** Logged by hand rather than timed. */
  manual?: boolean;
  demo?: boolean;
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

export interface Settings {
  displayName: string;
  dailyGoalMin: number;
  weeklyGoalMin: number;
  pomodoro: PomodoroConfig;
  keepAwake: boolean;
  sound: boolean;
  /** Privacy: appear to friends as "studying" while in a session. Off by default. */
  sharePresence: boolean;
  /** Privacy: also show the subject. Off by default. */
  shareSubject: boolean;
  lastSubjectId?: string;
  installHintDismissed: boolean;
  demoBannerDismissed: boolean;
}

export interface AppData {
  version: 1;
  settings: Settings;
  subjects: Subject[];
  sessions: StudySession[];
  exams: Exam[];
  friends: Friend[];
  active: ActiveSession | null;
}

export type FriendState = 'studying' | 'online' | 'finished' | 'offline';
