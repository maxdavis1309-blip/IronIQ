export type WorkoutType =
  | "push"
  | "pull"
  | "legs"
  | "chest-back"
  | "shoulders-arms"
  | "chest"
  | "back"
  | "arms"
  | "shoulders"
  | "cardio"
  | "recovery"
  | "unknown";

export type ExerciseSet = {
  id: string;
  exerciseName: string;
  normalizedExerciseName: string;
  setNumber: number;
  weight?: number;
  reps?: number;
  setsCount?: number;
  rpe?: number;
  rir?: number;
  isWarmup?: boolean;
  isPr?: boolean;
  notes?: string;
};

export type ParsedExercise = {
  exerciseName: string;
  normalizedExerciseName: string;
  muscleGroup?: string;
  sets: ExerciseSet[];
  notes?: string;
};

export type BodyMetrics = {
  bodyweight?: number;
  sleepQuality?: string;
  energyLevel?: string;
  stressLevel?: string;
  soreness?: string;
  painNotes?: string;
};

export type ParseResult = {
  workoutType: WorkoutType;
  summary: string;
  exercises: ParsedExercise[];
  bodyMetrics: BodyMetrics;
  subjectiveNotes: string[];
  skippedExercises: string[];
  prCandidates: string[];
  confidence: number;
  warnings: string[];
};

export type WorkoutLog = {
  id: string;
  userId: string;
  workoutDate: string;
  rawText: string;
  workoutType: WorkoutType;
  aiSummary: string;
  energyLevel?: string;
  sleepQuality?: string;
  sorenessNotes?: string;
  painNotes?: string;
  parserConfidence: number;
  tags: string[];
  exercises: ParsedExercise[];
  createdAt: string;
  updatedAt: string;
};

export type RecoveryEntry = {
  date: string;
  bodyweight: string;
  sleep: string;
  energy: string;
  shoulder: string;
  painNotes: string;
};

export type CloudSyncState = {
  workouts: WorkoutLog[];
  activeWorkout: WorkoutLog | null;
  recoveryEntries: RecoveryEntry[];
};

export type UserProfile = {
  userId: string;
  displayName: string;
  height?: string;
  bodyweight?: number;
  units: "lb" | "kg";
  goal: string;
  trainingSplit: string;
  experienceLevel: string;
  equipment: string[];
  injuryNotes: string[];
  preferences: string[];
  defaultGymDays: string[];
  exercisesToAvoid: string[];
  favoriteExercises: string[];
};

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  createdAt: string;
};
