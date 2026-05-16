export const exerciseCatalog = {
  Chest: ["Incline Bench Press", "Bench Press", "Flat Bench Hammer Chest Press", "Chest Fly", "Cable Fly", "Pushup"],
  Back: ["Lat Pulldown", "Row", "Cable Row", "Chest-Supported Row", "Rear Delt Fly", "Pullup"],
  Legs: ["Hamstring Curl", "Leg Press", "Leg Extension", "Calf Raise", "Squat", "Romanian Deadlift"],
  Shoulders: ["Shoulder Press", "Overhead Press", "Lateral Raise", "Rear Delt Fly", "Face Pull"],
  Arms: ["Incline Curl", "Hammer Curl", "EZ Bar Hammer Curl", "Overhead Tricep Extension", "Tricep Pushdown", "Dips"],
  Core: ["Cable Crunch", "Plank", "Hanging Leg Raise", "Ab Wheel"],
  Cardio: ["Treadmill", "Bike", "Stairmaster", "Row Erg"],
} as const;

export type ExerciseCategory = keyof typeof exerciseCatalog;

export const exerciseCategories = Object.keys(exerciseCatalog) as ExerciseCategory[];

export const splitCatalog = {
  Push: [
    "Shoulder Press",
    "Incline Bench Press",
    "Lateral Raise",
    "Flat Bench Hammer Chest Press",
    "Overhead Tricep Extension",
    "Chest Fly",
    "Tricep Pushdown",
  ],
  Pull: ["Lat Pulldown", "Row", "Incline Curl", "Rear Delt Fly", "EZ Bar Hammer Curl"],
  "Shoulders & Arms": ["Shoulder Press", "Incline Curl", "Overhead Tricep Extension", "Lateral Raise", "Hammer Curl", "Dips"],
  "Chest & Back": ["Lat Pulldown", "Incline Bench Press", "Row", "Flat Bench Hammer Chest Press", "Rear Delt Fly", "Chest Fly"],
  Legs: ["Hamstring Curl", "Leg Press", "Leg Extension", "Calf Raise"],
  Custom: [],
} as const;

export type SplitDay = keyof typeof splitCatalog;

export const splitDays = Object.keys(splitCatalog) as SplitDay[];
