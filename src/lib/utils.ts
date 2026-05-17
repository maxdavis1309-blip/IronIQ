import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function workoutTypeLabel(value: string) {
  const labels: Record<string, string> = {
    "chest-back": "Chest & Back",
    "shoulders-arms": "Shoulders & Arms",
  };
  return labels[value] ?? titleCase(value);
}

export function normalizeExerciseName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(db|dumbbell)\b/g, "dumbbell")
    .replace(/\b(bb|barbell)\b/g, "barbell")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();
}

export function estimatedOneRepMax(weight = 0, reps = 0) {
  if (!weight || !reps) return 0;
  if (reps <= 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

export function formatShortDate(value: string) {
  const date = parseDisplayDate(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatLongDate(value: string) {
  const date = parseDisplayDate(value);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function parseDisplayDate(value: string) {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateOnly) return new Date(value);
  return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
