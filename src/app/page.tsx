"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  ChevronDown,
  Dumbbell,
  History,
  Mic,
  Search,
  Settings,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { exerciseCatalog, exerciseCategories, splitCatalog, splitDays, type ExerciseCategory, type SplitDay } from "@/data/exercise-catalog";
import { demoProfile, demoWorkouts } from "@/data/seed";
import { mockCoachResponse } from "@/lib/ai/coach";
import { mockParseWorkout } from "@/lib/ai/mock-parser";
import { loadCloudSyncState, saveCloudSyncState } from "@/lib/cloud-sync";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  getExerciseHistory,
  getTopSets,
  getVolumeByMuscleGroup,
  suggestNextSet,
  suggestTodaysWorkout,
  summarizeLast30Days,
} from "@/lib/intelligence";
import type { CloudSyncState, CoachMessage, ParseResult, ParsedExercise, RecoveryEntry, WorkoutLog, WorkoutType } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import { estimatedOneRepMax, formatShortDate, normalizeExerciseName, titleCase, uid, workoutTypeLabel } from "@/lib/utils";
import { Section } from "@/components/ui/Section";
import { StatCard } from "@/components/ui/StatCard";
import { WorkoutCard } from "@/components/WorkoutCard";

const userId = "demo-user";
const WORKOUTS_STORAGE_KEY = "ironiq.workouts.v1";
const ACTIVE_WORKOUT_STORAGE_KEY = "ironiq.activeWorkout.v1";
const RECOVERY_STORAGE_KEY = "ironiq.recovery.v1";
const chips = ["Chest", "Back", "Legs", "Push", "Pull", "Arms", "Shoulders", "Cardio", "Injury note", "Bodyweight"];
const historyTypeFilters = ["all", "push", "pull", "legs", "chest-back", "shoulders-arms", "chest", "back", "arms", "shoulders", "cardio", "recovery", "unknown"] as const;
const tabs = [
  { id: "today", label: "Today", icon: Dumbbell },
  { id: "history", label: "History", icon: History },
  { id: "lifts", label: "Lifts", icon: Activity },
  { id: "coach", label: "Coach", icon: Bot },
  { id: "more", label: "More", icon: Settings },
] as const;

type TabId = (typeof tabs)[number]["id"];
type HistoryTypeFilter = (typeof historyTypeFilters)[number];
type SetDraft = {
  weight: string;
  reps: string;
};
type WorkoutEditSetDraft = {
  id: string;
  weight: string;
  reps: string;
  notes: string;
};
type WorkoutEditExerciseDraft = {
  exerciseName: string;
  muscleGroup: string;
  notes: string;
  sets: WorkoutEditSetDraft[];
};
type WorkoutEditDraft = {
  id: string;
  workoutDate: string;
  workoutType: WorkoutType;
  aiSummary: string;
  rawText: string;
  tags: string;
  exercises: WorkoutEditExerciseDraft[];
};
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [rawText, setRawText] = useState("");
  const [workouts, setWorkouts] = useState<WorkoutLog[]>(demoWorkouts);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutLog | null>(null);
  const [lastParse, setLastParse] = useState<ParseResult | null>(null);
  const [search, setSearch] = useState("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTypeFilter>("all");
  const [editingWorkout, setEditingWorkout] = useState<WorkoutEditDraft | null>(null);
  const [finishDraft, setFinishDraft] = useState<WorkoutEditDraft | null>(null);
  const [finishError, setFinishError] = useState("");
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedSplitDay, setSelectedSplitDay] = useState<SplitDay>("Push");
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory>("Chest");
  const [selectedCatalogExercise, setSelectedCatalogExercise] = useState<string>(splitCatalog.Push[0]);
  const [quickNotes, setQuickNotes] = useState("");
  const [setDrafts, setSetDrafts] = useState<SetDraft[]>([{ weight: "", reps: "" }]);
  const [dropSetEnabled, setDropSetEnabled] = useState(false);
  const [dropSetWeight, setDropSetWeight] = useState("");
  const [dropSetReps, setDropSetReps] = useState("");
  const [recoveryEntries, setRecoveryEntries] = useState<RecoveryEntry[]>([]);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryEntry>({
    date: new Date().toISOString().slice(0, 10),
    bodyweight: "203",
    sleep: "",
    energy: "",
    shoulder: "iffy",
    painNotes: "",
  });
  const [coachInput, setCoachInput] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState("Local only");
  const [cloudReady, setCloudReady] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [backupText, setBackupText] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([
    {
      id: "m_intro",
      role: "assistant",
      content: "Your log is fresh. Once you start entering workouts, I’ll remember last sets, patterns, pain notes, and what to try next.",
      createdAt: new Date().toISOString(),
    },
  ]);

  const summary = useMemo(() => summarizeLast30Days(userId, workouts), [workouts]);
  const recommendation = useMemo(() => suggestTodaysWorkout(userId, workouts), [workouts]);
  const volumeByGroup = useMemo(() => getVolumeByMuscleGroup(userId, workouts), [workouts]);
  const loggedExerciseOptions = useMemo(() => getLoggedExerciseOptions(workouts), [workouts]);
  const selectedLoggedExercise = loggedExerciseOptions.some((option) => option.normalizedName === selectedExercise) ? selectedExercise : (loggedExerciseOptions[0]?.normalizedName ?? "");
  const exerciseHistory = useMemo(() => getExerciseHistory(userId, selectedLoggedExercise, workouts), [selectedLoggedExercise, workouts]);
  const selectedLiftHistory = useMemo(() => getExerciseHistory(userId, selectedCatalogExercise, workouts), [selectedCatalogExercise, workouts]);
  const topSets = useMemo(() => getTopSets(workouts).slice(0, 5), [workouts]);
  const filteredHistory = useMemo(() => filterHistory(workouts, search, historyTypeFilter), [historyTypeFilter, search, workouts]);
  const historyTotals = useMemo(() => getWorkoutListTotals(filteredHistory), [filteredHistory]);
  const plannedSets = useMemo(() => buildPlannedSets(setDrafts, dropSetEnabled, dropSetWeight, dropSetReps), [setDrafts, dropSetEnabled, dropSetWeight, dropSetReps]);
  const quickTotalReps = plannedSets.reduce((sum, set) => sum + set.reps, 0);
  const quickVolume = plannedSets.reduce((sum, set) => sum + set.weight * set.reps, 0);
  const activeExerciseOptions = selectedSplitDay === "Custom" ? exerciseCatalog[selectedCategory] : splitCatalog[selectedSplitDay];
  const nextExercise = getNextExercise();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const activeWorkoutStats = activeWorkout ? getWorkoutTotals(activeWorkout) : null;
  const activeWorkoutInsight = activeWorkout ? getActiveWorkoutInsight(activeWorkout) : null;
  const selectedLiftInsight = useMemo(() => getLiftInsight(selectedCatalogExercise, workouts), [selectedCatalogExercise, workouts]);

  const saveCloudState = useCallback(
    async (userIdToSave: string, stateToSave: CloudSyncState) => {
      if (!supabase) return;
      try {
        const syncedAt = await saveCloudSyncState(supabase, userIdToSave, stateToSave);
        setLastCloudSyncAt(syncedAt);
        setSyncStatus("Synced");
      } catch (error) {
        setSyncStatus(error instanceof Error ? error.message : "Cloud sync failed");
      }
    },
    [supabase],
  );

  const loadCloudState = useCallback(
    async (userIdToLoad: string) => {
      if (!supabase) return;
      setSyncStatus("Loading cloud...");
      try {
        const cloud = await loadCloudSyncState(supabase, userIdToLoad);
        const localState = readLocalSyncState();
        if (cloud.state) {
          const mergedState = mergeSyncStates(cloud.state, localState);
          setWorkouts(mergedState.workouts);
          setActiveWorkout(mergedState.activeWorkout);
          setRecoveryEntries(mergedState.recoveryEntries);
          setLastCloudSyncAt(cloud.updatedAt);
          if (mergedState.workouts.length !== cloud.state.workouts.length || mergedState.recoveryEntries.length !== cloud.state.recoveryEntries.length) {
            const syncedAt = await saveCloudSyncState(supabase, userIdToLoad, mergedState);
            setLastCloudSyncAt(syncedAt);
          }
        } else {
          const syncedAt = await saveCloudSyncState(supabase, userIdToLoad, localState);
          setLastCloudSyncAt(syncedAt);
        }
        setSyncStatus("Synced");
        setCloudReady(true);
      } catch (error) {
        setSyncStatus(error instanceof Error ? error.message : "Cloud sync failed");
      }
    },
    [supabase],
  );

  useEffect(() => {
    window.queueMicrotask(() => {
      const savedWorkouts = readStoredWorkouts();
      const savedActiveWorkout = readStoredActiveWorkout();
      const savedRecovery = readStoredRecovery();
      if (savedWorkouts) setWorkouts(savedWorkouts);
      if (savedActiveWorkout) setActiveWorkout(savedActiveWorkout);
      if (savedRecovery) setRecoveryEntries(savedRecovery);
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted || !supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) {
        loadCloudState(data.user.id);
      } else {
        setSyncStatus("Local only");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadCloudState(session.user.id);
      } else {
        setCloudReady(false);
        setSyncStatus("Local only");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadCloudState, mounted, supabase]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
  }, [mounted, workouts]);

  useEffect(() => {
    if (!mounted) return;
    if (activeWorkout) {
      localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, JSON.stringify(activeWorkout));
      return;
    }
    localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
  }, [activeWorkout, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(recoveryEntries));
  }, [mounted, recoveryEntries]);

  useEffect(() => {
    if (!mounted || !supabase || !user || !cloudReady) return;
    const timeout = window.setTimeout(() => {
      setSyncStatus("Syncing...");
      saveCloudState(user.id, { workouts, activeWorkout, recoveryEntries });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [activeWorkout, cloudReady, mounted, recoveryEntries, saveCloudState, supabase, user, workouts]);

  async function signInWithEmail() {
    if (!supabase || !authEmail.trim()) return;
    setSyncStatus("Sending login link...");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSyncStatus(error ? error.message : "Check your email for the login link");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setCloudReady(false);
    setLastCloudSyncAt(null);
    setSyncStatus("Local only");
  }

  function pushCloudState() {
    if (!user) return;
    setSyncStatus("Syncing...");
    saveCloudState(user.id, { workouts, activeWorkout, recoveryEntries });
  }

  function pullCloudState() {
    if (!user) return;
    loadCloudState(user.id);
  }

  function updateCategory(category: ExerciseCategory) {
    setSelectedCategory(category);
    setSelectedSplitDay("Custom");
    setSelectedCatalogExercise(exerciseCatalog[category][0]);
  }

  function updateSplitDay(day: SplitDay) {
    setSelectedSplitDay(day);
    if (day !== "Custom") {
      setSelectedCategory(categoryForSplitDay(day));
      setSelectedCatalogExercise(splitCatalog[day][0]);
    } else {
      setSelectedCatalogExercise(exerciseCatalog[selectedCategory][0]);
    }
  }

  function getNextExercise() {
    if (selectedSplitDay === "Custom") return null;
    const exercises = splitCatalog[selectedSplitDay];
    const currentIndex = exercises.indexOf(selectedCatalogExercise as never);
    if (currentIndex < 0 || currentIndex >= exercises.length - 1) return null;
    return exercises[currentIndex + 1];
  }

  function selectNextExercise() {
    if (!nextExercise) return;
    setSelectedCatalogExercise(nextExercise);
  }

  function startSelectedSplitWorkout() {
    if (selectedSplitDay === "Custom") return;
    const now = new Date().toISOString();
    const workoutType = splitDayToWorkoutType(selectedSplitDay);
    const plannedExercises = splitCatalog[selectedSplitDay].map((exerciseName) => createPlannedExercise(exerciseName));
    const plannedNames = plannedExercises.map((exercise) => exercise.exerciseName).join(", ");

    setActiveWorkout((current) => {
      if (!current) {
        return {
          id: uid("workout"),
          userId,
          workoutDate: now.slice(0, 10),
          rawText: `${selectedSplitDay} - planned: ${plannedNames}`,
          workoutType,
          aiSummary: `${selectedSplitDay} planned: ${plannedNames}.`,
          parserConfidence: 1,
          tags: [selectedSplitDay.toLowerCase(), workoutType],
          exercises: plannedExercises,
          createdAt: now,
          updatedAt: now,
        };
      }

      const existingNames = new Set(current.exercises.map((exercise) => exercise.normalizedExerciseName));
      const missingExercises = plannedExercises.filter((exercise) => !existingNames.has(exercise.normalizedExerciseName));
      if (!missingExercises.length) return current;

      return {
        ...current,
        rawText: `${current.rawText}\nAdded ${selectedSplitDay} outline: ${missingExercises.map((exercise) => exercise.exerciseName).join(", ")}`,
        aiSummary: `${current.aiSummary} Added ${selectedSplitDay} outline.`,
        tags: Array.from(new Set([...current.tags, selectedSplitDay.toLowerCase(), workoutType])),
        exercises: [...current.exercises, ...missingExercises],
        updatedAt: now,
      };
    });
  }

  function updateSetDraft(index: number, field: keyof SetDraft, value: string) {
    setSetDrafts((current) => current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, [field]: value } : draft)));
  }

  function addSetDraft() {
    setSetDrafts((current) => [
      ...current,
      {
        weight: current[current.length - 1]?.weight ?? "",
        reps: current[current.length - 1]?.reps ?? "",
      },
    ]);
  }

  function removeSetDraft(index: number) {
    setSetDrafts((current) => (current.length === 1 ? current : current.filter((_, draftIndex) => draftIndex !== index)));
  }

  function submitStructuredLift() {
    const planned = plannedSets;
    if (!selectedCatalogExercise || !planned.length) return;

    const normalized = normalizeExerciseName(selectedCatalogExercise);
    const now = new Date().toISOString();
    const parsedExercise: ParsedExercise = {
      exerciseName: selectedCatalogExercise,
      normalizedExerciseName: normalized,
      muscleGroup: selectedCategory.toLowerCase(),
      sets: planned.map((set, index) => ({
        id: uid("set"),
        exerciseName: selectedCatalogExercise,
        normalizedExerciseName: normalized,
        setNumber: index + 1,
        weight: set.weight,
        reps: set.reps,
        setsCount: planned.length,
        notes: [quickNotes, set.isDropSet ? "drop set" : ""].filter(Boolean).join("; ") || undefined,
      })),
      notes: quickNotes || undefined,
    };

    const setText = planned.map((set) => `${set.weight}x${set.reps}${set.isDropSet ? " drop" : ""}`).join(", ");
    const sessionLabel = selectedSplitDay === "Custom" ? selectedCategory : selectedSplitDay;
    const raw = `${sessionLabel} - ${selectedCatalogExercise}: ${setText}${quickNotes ? `, ${quickNotes}` : ""}`;
    const exerciseSummary = `${selectedCatalogExercise}: ${setText}${quickNotes ? `. Notes: ${quickNotes}` : "."}`;
    const workoutType = selectedSplitDay === "Custom" ? categoryToWorkoutType(selectedCategory) : splitDayToWorkoutType(selectedSplitDay);
    const nextTags = [sessionLabel.toLowerCase(), selectedCategory.toLowerCase()];

    setActiveWorkout((current) => {
      if (!current) {
        return {
          id: uid("workout"),
          userId,
          workoutDate: now.slice(0, 10),
          rawText: raw,
          workoutType,
          aiSummary: exerciseSummary,
          parserConfidence: 1,
          tags: nextTags,
          exercises: [parsedExercise],
          createdAt: now,
          updatedAt: now,
        };
      }

      return {
        ...current,
        rawText: `${current.rawText}\n${raw}`,
        aiSummary: `${current.aiSummary} ${exerciseSummary}`,
        tags: Array.from(new Set([...current.tags, ...nextTags])),
        exercises: mergeExerciseIntoWorkout(current.exercises, parsedExercise),
        updatedAt: now,
      };
    });
    setLastParse(null);
    setQuickNotes("");
    setSetDrafts([{ weight: "", reps: "" }]);
    setDropSetEnabled(false);
    setDropSetWeight("");
    setDropSetReps("");
  }

  function removeExerciseFromActiveWorkout(exerciseIndex: number) {
    if (activeWorkout?.exercises.length === 1) {
      setFinishDraft(null);
      setFinishError("");
    }
    setActiveWorkout((current) => {
      if (!current) return current;
      const exercises = current.exercises.filter((_, index) => index !== exerciseIndex);
      if (!exercises.length) return null;
      return rebuildWorkoutFromExercises(current, exercises);
    });
  }

  function removeSetFromActiveWorkout(exerciseIndex: number, setId: string) {
    const targetExercise = activeWorkout?.exercises[exerciseIndex];
    if (activeWorkout?.exercises.length === 1 && targetExercise?.sets.length === 1) {
      setFinishDraft(null);
      setFinishError("");
    }
    setActiveWorkout((current) => {
      if (!current) return current;
      const exercises = current.exercises
        .map((exercise, index) => {
          if (index !== exerciseIndex) return exercise;
          const sets = exercise.sets
            .filter((set) => set.id !== setId)
            .map((set, setIndex) => ({ ...set, setNumber: setIndex + 1 }));
          return { ...exercise, sets };
        })
        .filter((exercise) => exercise.sets.length);
      if (!exercises.length) return null;
      return rebuildWorkoutFromExercises(current, exercises);
    });
  }

  function finishWorkout() {
    if (!activeWorkout) return;
    setFinishDraft(workoutToEditDraft(activeWorkout));
    setFinishError("");
  }

  function updateFinishWorkout<Field extends keyof WorkoutEditDraft>(field: Field, value: WorkoutEditDraft[Field]) {
    setFinishDraft((current) => (current ? { ...current, [field]: value } : current));
    setFinishError("");
  }

  function updateFinishExercise(index: number, field: keyof WorkoutEditExerciseDraft, value: string) {
    setFinishDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, exerciseIndex) => (exerciseIndex === index ? { ...exercise, [field]: value } : exercise)),
      };
    });
    setFinishError("");
  }

  function updateFinishSet(exerciseIndex: number, setIndex: number, field: keyof WorkoutEditSetDraft, value: string) {
    setFinishDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, currentExerciseIndex) => {
          if (currentExerciseIndex !== exerciseIndex) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? { ...set, [field]: value } : set)),
          };
        }),
      };
    });
    setFinishError("");
  }

  function removeFinishSet(exerciseIndex: number, setIndex: number) {
    setFinishDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises
          .map((exercise, currentExerciseIndex) =>
            currentExerciseIndex === exerciseIndex
              ? { ...exercise, sets: exercise.sets.filter((_, currentSetIndex) => currentSetIndex !== setIndex) }
              : exercise,
          )
          .filter((exercise) => exercise.sets.length),
      };
    });
    setFinishError("");
  }

  function addFinishSet(exerciseIndex: number) {
    setFinishDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, currentExerciseIndex) =>
          currentExerciseIndex === exerciseIndex
            ? {
                ...exercise,
                sets: [...exercise.sets, { id: uid("set"), weight: "", reps: "", notes: "" }],
              }
            : exercise,
        ),
      };
    });
    setFinishError("");
  }

  function saveFinishedWorkout() {
    if (!activeWorkout || !finishDraft) return;
    const finishedWorkout = editDraftToWorkout(finishDraft, activeWorkout);
    if (!finishedWorkout.exercises.length) {
      setFinishError("Add at least one valid set before saving this workout.");
      return;
    }
    setWorkouts((current) => [{ ...finishedWorkout, updatedAt: new Date().toISOString() }, ...current]);
    setActiveWorkout(null);
    setFinishDraft(null);
    setFinishError("");
  }

  function deleteWorkout(workoutId: string) {
    const target = workouts.find((workout) => workout.id === workoutId);
    const label = target ? `${formatShortDate(target.workoutDate)} ${workoutTypeLabel(target.workoutType)}` : "this workout";
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
    if (editingWorkout?.id === workoutId) setEditingWorkout(null);
  }

  function startEditingWorkout(workoutId: string) {
    const workout = workouts.find((item) => item.id === workoutId);
    if (!workout) return;
    setEditingWorkout(workoutToEditDraft(workout));
  }

  function updateEditingWorkout<Field extends keyof WorkoutEditDraft>(field: Field, value: WorkoutEditDraft[Field]) {
    setEditingWorkout((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateEditingExercise(index: number, field: keyof WorkoutEditExerciseDraft, value: string) {
    setEditingWorkout((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, exerciseIndex) => (exerciseIndex === index ? { ...exercise, [field]: value } : exercise)),
      };
    });
  }

  function updateEditingSet(exerciseIndex: number, setIndex: number, field: keyof WorkoutEditSetDraft, value: string) {
    setEditingWorkout((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, currentExerciseIndex) => {
          if (currentExerciseIndex !== exerciseIndex) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? { ...set, [field]: value } : set)),
          };
        }),
      };
    });
  }

  function removeEditingSet(exerciseIndex: number, setIndex: number) {
    setEditingWorkout((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises
          .map((exercise, currentExerciseIndex) =>
            currentExerciseIndex === exerciseIndex
              ? { ...exercise, sets: exercise.sets.filter((_, currentSetIndex) => currentSetIndex !== setIndex) }
              : exercise,
          )
          .filter((exercise) => exercise.sets.length),
      };
    });
  }

  function addEditingSet(exerciseIndex: number) {
    setEditingWorkout((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, currentExerciseIndex) =>
          currentExerciseIndex === exerciseIndex
            ? {
                ...exercise,
                sets: [...exercise.sets, { id: uid("set"), weight: "", reps: "", notes: "" }],
              }
            : exercise,
        ),
      };
    });
  }

  function saveEditedWorkout() {
    if (!editingWorkout) return;
    setWorkouts((current) =>
      current.map((workout) => (workout.id === editingWorkout.id ? editDraftToWorkout(editingWorkout, workout) : workout)),
    );
    setEditingWorkout(null);
  }

  function discardActiveWorkout() {
    setActiveWorkout(null);
    setFinishDraft(null);
    setFinishError("");
  }

  function clearAllData() {
    if (!confirm("Clear all IronIQ workout data on this browser?")) return;
    setWorkouts([]);
    setActiveWorkout(null);
    setRecoveryEntries([]);
    setLastParse(null);
    localStorage.removeItem(WORKOUTS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
  }

  function saveRecoveryEntry() {
    setRecoveryEntries((current) => {
      const withoutSameDate = current.filter((entry) => entry.date !== recoveryDraft.date);
      return [recoveryDraft, ...withoutSameDate].sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  function exportBackup() {
    const payload = buildBackupPayload(workouts, activeWorkout, recoveryEntries);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ironiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyBackup() {
    const payload = buildBackupPayload(workouts, activeWorkout, recoveryEntries);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setBackupStatus("Copied all IronIQ data");
    } catch {
      setBackupStatus("Copy failed. Use Export instead.");
    }
  }

  async function copyLatestWorkout() {
    const latest = workouts[0];
    if (!latest) {
      setBackupStatus("No finished workout to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(formatWorkoutForSharing(latest));
      setBackupStatus("Copied latest workout");
    } catch {
      setBackupStatus("Copy failed. Use Export instead.");
    }
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    importBackupPayload(await file.text());
  }

  function importBackupPayload(rawPayload: string) {
    try {
      const payload = JSON.parse(rawPayload) as {
        workouts?: WorkoutLog[];
        activeWorkout?: WorkoutLog | null;
        recoveryEntries?: RecoveryEntry[];
      };
      if (Array.isArray(payload.workouts)) setWorkouts(payload.workouts.map(normalizeWorkoutSplitType));
      if ("activeWorkout" in payload) setActiveWorkout(payload.activeWorkout ? normalizeWorkoutSplitType(payload.activeWorkout) : null);
      if (Array.isArray(payload.recoveryEntries)) setRecoveryEntries(payload.recoveryEntries);
      setBackupStatus(`Imported ${payload.workouts?.length ?? 0} workouts`);
      setBackupText("");
    } catch {
      setBackupStatus("Import failed. Check that the pasted data is valid JSON.");
    }
  }

  function submitLog() {
    if (!rawText.trim()) return;
    const parsed = mockParseWorkout(rawText);
    const now = new Date().toISOString();
    const workout: WorkoutLog = {
      id: uid("workout"),
      userId,
      workoutDate: now.slice(0, 10),
      rawText,
      workoutType: parsed.workoutType,
      aiSummary: parsed.summary,
      energyLevel: parsed.bodyMetrics.energyLevel,
      sleepQuality: parsed.bodyMetrics.sleepQuality,
      sorenessNotes: parsed.bodyMetrics.soreness,
      painNotes: parsed.bodyMetrics.painNotes,
      parserConfidence: parsed.confidence,
      tags: buildTags(parsed),
      exercises: parsed.exercises,
      createdAt: now,
      updatedAt: now,
    };
    setWorkouts((current) => [workout, ...current]);
    setLastParse(parsed);
    setRawText("");
  }

  function sendCoachMessage(prompt = coachInput) {
    if (!prompt.trim()) return;
    const userMessage: CoachMessage = {
      id: uid("msg"),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    const response = mockCoachResponse(userId, prompt);
    const assistantMessage: CoachMessage = {
      id: uid("msg"),
      role: "assistant",
      content: response.content,
      citations: response.citations,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setCoachInput("");
  }

  if (!mounted) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-28 pt-4 sm:px-5">
        <header className="mb-4 border-b border-white/10 px-0 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">IronIQ</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">Loading</h1>
        </header>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="h-36 rounded-3xl bg-white/[0.04]" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-16 rounded-2xl bg-white/[0.04]" />
            <div className="h-16 rounded-2xl bg-white/[0.04]" />
            <div className="h-16 rounded-2xl bg-white/[0.04]" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-28 pt-4 sm:px-5">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">IronIQ</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50">
              {activeTab === "today" ? "What did you do?" : tabs.find((tab) => tab.id === activeTab)?.label}
            </h1>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <Sparkles className="h-5 w-5 text-emerald-200" />
          </div>
        </div>
      </header>

      {activeTab === "today" && (
        <div className="space-y-4">
          <Section title="Fast Entry" action={<span className="text-xs font-semibold text-emerald-200">category first</span>}>
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Split slot</div>
              <div className="grid grid-cols-2 gap-2">
                {splitDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => updateSplitDay(day)}
                    className={`min-h-11 rounded-2xl border px-3 text-sm font-semibold ${
                      selectedSplitDay === day
                        ? "border-emerald-200/50 bg-emerald-200 text-zinc-950"
                        : "border-white/10 bg-white/[0.04] text-zinc-300"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {selectedSplitDay !== "Custom" && (
                <button
                  type="button"
                  onClick={startSelectedSplitWorkout}
                  className="mt-3 min-h-12 w-full rounded-2xl border border-emerald-200/25 bg-emerald-200/10 px-4 font-semibold text-emerald-100"
                >
                  {activeWorkout ? `Add ${selectedSplitDay} outline` : `Start ${selectedSplitDay}`}
                </button>
              )}
            </div>

            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Body part</div>
            <div className="grid grid-cols-2 gap-2">
              {exerciseCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => updateCategory(category)}
                  className={`min-h-11 rounded-2xl border px-3 text-sm font-semibold ${
                    selectedCategory === category
                      ? "border-amber-200/50 bg-amber-200 text-zinc-950"
                      : "border-white/10 bg-white/[0.04] text-zinc-300"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Exercise
              <select
                value={selectedCatalogExercise}
                onChange={(event) => setSelectedCatalogExercise(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-base normal-case tracking-normal text-zinc-100"
              >
                {activeExerciseOptions.map((exercise) => (
                  <option key={exercise} value={exercise}>
                    {exercise}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Last time</div>
              {selectedLiftHistory.length ? (
                <div className="mt-2">
                  <div className="text-sm font-semibold text-zinc-100">{formatShortDate(selectedLiftHistory[0].workout.workoutDate)}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedLiftHistory[0].exercise.sets.map((set) => (
                      <span key={set.id} className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-zinc-300">
                        {set.weight ?? "BW"} x {set.reps ?? "?"}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">No history for this lift yet.</p>
              )}
            </div>
            <div className="mt-3 rounded-2xl border border-emerald-200/20 bg-emerald-200/[0.06] p-3">
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="sessions" value={selectedLiftInsight.sessions} />
                <StatCard label="best" value={selectedLiftInsight.bestSet} tone="gold" />
                <StatCard label="last" value={selectedLiftInsight.lastSet} tone="mint" />
              </div>
              <p className="mt-3 text-sm text-emerald-100">{selectedLiftInsight.nextTarget}</p>
            </div>

            <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Sets</div>
                <button type="button" onClick={addSetDraft} className="rounded-full bg-emerald-200 px-3 py-1.5 text-xs font-semibold text-zinc-950">
                  Add set
                </button>
              </div>
              {setDrafts.map((draft, index) => (
                <div key={index} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2">
                  <div className="pb-3 text-sm font-semibold text-zinc-500">#{index + 1}</div>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Weight
                    <input
                      value={draft.weight}
                      onChange={(event) => updateSetDraft(index, "weight", event.target.value)}
                      inputMode="decimal"
                        type="number"
                        min="0"
                        placeholder="185"
                        className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-base normal-case tracking-normal text-zinc-100"
                      />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Reps
                    <input
                      value={draft.reps}
                      onChange={(event) => updateSetDraft(index, "reps", event.target.value)}
                      inputMode="numeric"
                        type="number"
                        min="1"
                        placeholder="8"
                        className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-base normal-case tracking-normal text-zinc-100"
                      />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSetDraft(index)}
                    className="mb-1 min-h-10 min-w-10 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-zinc-400"
                    aria-label={`Remove set ${index + 1}`}
                  >
                    -
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => setDropSetEnabled((value) => !value)}
                className={`min-h-11 rounded-2xl border px-3 text-sm font-semibold ${
                  dropSetEnabled ? "border-amber-200/40 bg-amber-200/15 text-amber-100" : "border-white/10 bg-white/[0.04] text-zinc-300"
                }`}
              >
                Drop set
              </button>
            </div>

            {dropSetEnabled && (
              <div className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-200/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">Last-set drop</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Drop weight
                    <input
                      value={dropSetWeight}
                      onChange={(event) => setDropSetWeight(event.target.value)}
                      inputMode="decimal"
                      type="number"
                      min="0"
                      placeholder="135"
                      className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-base normal-case tracking-normal text-zinc-100"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Drop reps
                    <input
                      value={dropSetReps}
                      onChange={(event) => setDropSetReps(event.target.value)}
                      inputMode="numeric"
                      type="number"
                      min="1"
                      placeholder="10"
                      className="mt-1 min-h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-base normal-case tracking-normal text-zinc-100"
                    />
                  </label>
                </div>
              </div>
            )}

            <input
              value={quickNotes}
              onChange={(event) => setQuickNotes(event.target.value)}
              placeholder="Notes optional: felt heavy, elbow sore, easy"
              className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
            />

            <div className="mt-3 rounded-2xl border border-emerald-200/15 bg-emerald-200/10 p-3 text-sm font-medium text-emerald-100">
              {quickTotalReps} total reps{quickVolume ? ` - ${quickVolume.toLocaleString()} lb volume` : ""}
            </div>

            <button
              type="button"
              onClick={submitStructuredLift}
              className="mt-3 min-h-12 w-full rounded-2xl bg-amber-200 px-4 font-semibold text-zinc-950"
            >
              Add to Workout
            </button>
            {nextExercise && (
              <button
                type="button"
                onClick={selectNextExercise}
                className="mt-2 min-h-11 w-full rounded-2xl border border-emerald-200/20 bg-emerald-200/10 px-4 text-sm font-semibold text-emerald-100"
              >
                Next exercise: {nextExercise}
              </button>
            )}
          </Section>

          {activeWorkout && (
            <Section title="Current Workout" action={<span className="text-xs font-semibold text-amber-100">{activeWorkout.exercises.length} exercises</span>}>
              {activeWorkoutStats && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <StatCard label="sets" value={activeWorkoutStats.sets} />
                  <StatCard label="reps" value={activeWorkoutStats.reps} tone="mint" />
                  <StatCard label="volume" value={`${Math.round(activeWorkoutStats.volume).toLocaleString()} lb`} tone="gold" />
                </div>
              )}
              {activeWorkoutInsight && (
                <div className="mb-3 rounded-2xl border border-emerald-200/15 bg-emerald-200/[0.07] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">{workoutTypeLabel(activeWorkout.workoutType)}</div>
                      <div className="mt-1 text-sm text-zinc-300">{activeWorkoutInsight.completedExercises}/{activeWorkoutInsight.totalExercises} lifts logged</div>
                    </div>
                    <div className="text-right text-xs text-zinc-500">{formatShortDate(activeWorkout.workoutDate)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-black/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Top set</div>
                      <div className="mt-1 font-semibold text-amber-100">{activeWorkoutInsight.topSet}</div>
                    </div>
                    <div className="rounded-2xl bg-black/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Last lift</div>
                      <div className="mt-1 font-semibold text-zinc-100">{activeWorkoutInsight.lastLift}</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {activeWorkout.exercises.map((exercise, exerciseIndex) => (
                  <div key={`${exercise.normalizedExerciseName}-${exerciseIndex}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-amber-100">{exercise.exerciseName}</div>
                        {exercise.notes && <div className="mt-1 text-xs text-zinc-500">{exercise.notes}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExerciseFromActiveWorkout(exerciseIndex)}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-400"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {exercise.sets.length ? (
                        exercise.sets.map((set) => (
                          <button
                            key={set.id}
                            type="button"
                            onClick={() => removeSetFromActiveWorkout(exerciseIndex, set.id)}
                            className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-zinc-300"
                            title="Tap to remove set"
                          >
                            {set.weight ?? "BW"} x {set.reps ?? "?"}
                            {set.notes?.includes("drop set") ? " drop" : ""}
                          </button>
                        ))
                      ) : (
                        <span className="rounded-full border border-dashed border-white/10 px-2.5 py-1 text-xs font-medium text-zinc-500">Planned</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={discardActiveWorkout} className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-zinc-300">
                  Discard
                </button>
                <button type="button" onClick={finishWorkout} className="min-h-12 rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
                  Review & Finish
                </button>
              </div>
              {finishDraft && (
                <div className="mt-3">
                  <WorkoutEditPanel
                    draft={finishDraft}
                    title="Finish workout"
                    body="Review date, type, tags, and sets before this joins History."
                    saveLabel="Save workout"
                    error={finishError}
                    onCancel={() => {
                      setFinishDraft(null);
                      setFinishError("");
                    }}
                    onSave={saveFinishedWorkout}
                    onWorkoutChange={updateFinishWorkout}
                    onExerciseChange={updateFinishExercise}
                    onSetChange={updateFinishSet}
                    onAddSet={addFinishSet}
                    onRemoveSet={removeFinishSet}
                  />
                </div>
              )}
            </Section>
          )}

          <Section title="Quick Log" action={<Mic className="h-4 w-4 text-zinc-500" />}>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={"bench 185x8, 205x5, 225x2 felt heavy\nlegs today squat 275 3x5, RDL 225 3x8, slept bad"}
              className="min-h-36 w-full resize-none rounded-3xl border border-white/10 bg-black/40 p-4 text-base leading-6 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-200/40"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setRawText((value) => `${value}${value ? " " : ""}${chip.toLowerCase()}`)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-300"
                >
                  {chip}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={submitLog}
              className="mt-4 min-h-12 w-full rounded-2xl bg-amber-200 px-4 font-semibold text-zinc-950"
            >
              Parse and Save
            </button>
          </Section>

          {lastParse && (
            <Section title="AI Parse Review" action={<span className="text-xs text-emerald-200">{Math.round(lastParse.confidence * 100)}% confidence</span>}>
              <p className="text-sm text-zinc-300">{lastParse.summary}</p>
              <div className="mt-3 space-y-3">
                {lastParse.exercises.map((exercise) => (
                  <div key={exercise.normalizedExerciseName} className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="font-semibold text-amber-100">{exercise.exerciseName}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {exercise.sets.map((set) => (
                        <span key={set.id} className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-zinc-300">
                          {set.weight} x {set.reps}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-3 text-sm font-semibold text-emerald-200">Edit parsed data</button>
            </Section>
          )}

          <div className="grid grid-cols-3 gap-2">
            <StatCard label="workouts" value={summary.workouts} />
            <StatCard label="sets" value={summary.sets} tone="mint" />
            <StatCard label="volume" value={`${Math.round(summary.volume / 1000)}k`} tone="gold" />
          </div>

          <Section title="Suggested Next">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-300/15 to-amber-300/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <Target className="h-4 w-4" />
                {titleCase(recommendation.type)} day
              </div>
              <div className="mt-2 text-xl font-semibold">{recommendation.mainLift}</div>
              <p className="mt-1 text-sm text-zinc-300">{recommendation.target}</p>
              <details className="mt-3">
                <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-amber-100">
                  Why this workout? <ChevronDown className="h-4 w-4" />
                </summary>
                <p className="mt-2 text-sm text-zinc-400">{recommendation.why} {recommendation.caution}</p>
              </details>
            </div>
          </Section>

          <Section title="Recent">
            <div className="space-y-3">
              {workouts.length ? (
                workouts.slice(0, 2).map((workout) => <WorkoutCard key={workout.id} workout={workout} compact />)
              ) : (
                <EmptyState title="No finished workouts yet" body="Add lifts to Current Workout, then hit Finish Workout when you leave the gym." />
              )}
            </div>
          </Section>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs, lifts, notes"
              className="min-h-10 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="grid min-h-9 min-w-9 place-items-center rounded-full bg-white/[0.04] text-zinc-400" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {historyTypeFilters.map((type) => {
              const isActive = historyTypeFilter === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setHistoryTypeFilter(type)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${
                    isActive ? "border-emerald-200/40 bg-emerald-200/15 text-emerald-100" : "border-white/10 bg-white/[0.04] text-zinc-400"
                  }`}
                >
                  {type === "all" ? "All" : workoutTypeLabel(type)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="shown" value={filteredHistory.length} />
            <StatCard label="sets" value={historyTotals.sets} tone="mint" />
            <StatCard label="volume" value={`${Math.round(historyTotals.volume / 1000)}k`} tone="gold" />
          </div>
          {editingWorkout && (
            <WorkoutEditPanel
              draft={editingWorkout}
              onCancel={() => setEditingWorkout(null)}
              onSave={saveEditedWorkout}
              onWorkoutChange={updateEditingWorkout}
              onExerciseChange={updateEditingExercise}
              onSetChange={updateEditingSet}
              onAddSet={addEditingSet}
              onRemoveSet={removeEditingSet}
            />
          )}
          {filteredHistory.map((workout) => (
              <WorkoutCard key={workout.id} workout={workout} onEdit={startEditingWorkout} onDelete={deleteWorkout} />
            ))}
          {!workouts.length && <EmptyState title="History is empty" body="No fake workouts loaded. Once you log tomorrow, this becomes your feed." />}
          {workouts.length > 0 && !filteredHistory.length && (
            <EmptyState
              title="No matching workouts"
              body="Clear search or switch the type filter to bring more sessions back into view."
            />
          )}
        </div>
      )}

      {activeTab === "lifts" && (
        <div className="space-y-4">
          <Section title="Your Lifts">
            {loggedExerciseOptions.length ? (
              <>
                <select
                  value={selectedLoggedExercise}
                  onChange={(event) => setSelectedExercise(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-zinc-100"
                >
                  {loggedExerciseOptions.map((option) => (
                    <option key={option.normalizedName} value={option.normalizedName}>
                      {option.displayName}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {loggedExerciseOptions.map((option) => {
                    const isActive = selectedLoggedExercise === option.normalizedName;
                    return (
                      <button
                        key={option.normalizedName}
                        type="button"
                        onClick={() => setSelectedExercise(option.normalizedName)}
                        className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${
                          isActive ? "border-amber-200/40 bg-amber-200/15 text-amber-100" : "border-white/10 bg-white/[0.04] text-zinc-400"
                        }`}
                      >
                        {option.displayName}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatCard label="sessions" value={new Set(exerciseHistory.map(({ workout }) => workout.id)).size} />
                  <StatCard label="best e1rm" value={exerciseHistory.length ? Math.max(...exerciseHistory.map(({ set }) => estimatedOneRepMax(set.weight, set.reps))) : 0} tone="gold" />
                  <StatCard label="last" value={exerciseHistory[0] ? formatShortDate(exerciseHistory[0].workout.workoutDate) : "-"} tone="mint" />
                </div>
                <p className="mt-3 rounded-2xl bg-emerald-300/10 p-3 text-sm text-emerald-100">
                  {suggestNextSet(userId, selectedLoggedExercise, workouts)}
                </p>
              </>
            ) : (
              <EmptyState title="No lifts logged yet" body="Finish a workout and your lift list will build itself from what you actually do." />
            )}
          </Section>

          <Section title="Recent Sets">
            <div className="space-y-2">
              {exerciseHistory.length ? (
                exerciseHistory.slice(0, 8).map(({ workout, set }) => (
                  <div key={`${workout.id}-${set.id}`} className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-3 text-sm">
                    <span className="text-zinc-300">{formatShortDate(workout.workoutDate)}</span>
                    <span className="font-semibold text-amber-100">
                      {set.weight ?? "BW"} x {set.reps ?? "?"}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="No sets for this lift yet" body="Choose a logged lift above to see recent sets." />
              )}
            </div>
          </Section>

          <Section title="Top Sets">
            <div className="space-y-2">
              {topSets.length ? (
                topSets.map((item) => (
                  <div key={`${item.workout.id}-${item.set.id}`} className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-3 text-sm">
                    <span>{item.exercise}</span>
                    <span className="text-zinc-400">{item.set.weight} x {item.set.reps} - e1RM {item.e1rm}</span>
                  </div>
                ))
              ) : (
                <EmptyState title="No top sets yet" body="Your best sets will appear after you log a few lifts." />
              )}
            </div>
          </Section>
        </div>
      )}

      {activeTab === "coach" && (
        <div className="space-y-4">
          <Section title="Ask Coach">
            <div className="space-y-3">
              {messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "ml-8 rounded-3xl bg-amber-200 p-3 text-sm text-zinc-950" : "mr-8 rounded-3xl bg-white/[0.06] p-3 text-sm text-zinc-200"}>
                  {message.content}
                  {message.citations?.length ? <div className="mt-2 text-xs opacity-70">Based on {message.citations.join(", ")}</div> : null}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={coachInput}
                onChange={(event) => setCoachInput(event.target.value)}
                placeholder="Ask about training..."
                className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              />
              <button onClick={() => sendCoachMessage()} className="rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
                Send
              </button>
            </div>
          </Section>
          <div className="grid gap-2">
            {["What did I bench last time?", "What should I train today?", "What has been hurting lately?", "Summarize my last 30 days."].map((prompt) => (
              <button key={prompt} onClick={() => sendCoachMessage(prompt)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left text-sm text-zinc-300">
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === "more" && (
        <div className="space-y-4">
          <Section title="Progress Dashboard">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(volumeByGroup).map(([group, volume]) => (
                <StatCard key={group} label={group} value={`${Math.round(volume / 1000)}k`} />
              ))}
            </div>
          </Section>

          <Section title="Body & Recovery">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={recoveryDraft.date}
                onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, date: event.target.value }))}
                className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              />
              <input
                value={recoveryDraft.bodyweight}
                onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, bodyweight: event.target.value }))}
                placeholder="Bodyweight"
                inputMode="decimal"
                className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              />
              <select
                value={recoveryDraft.sleep}
                onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, sleep: event.target.value }))}
                className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              >
                <option value="">Sleep</option>
                <option value="great">Great</option>
                <option value="good">Good</option>
                <option value="meh">Meh</option>
                <option value="bad">Bad</option>
              </select>
              <select
                value={recoveryDraft.energy}
                onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, energy: event.target.value }))}
                className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              >
                <option value="">Energy</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="wrecked">Wrecked</option>
              </select>
              <select
                value={recoveryDraft.shoulder}
                onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, shoulder: event.target.value }))}
                className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              >
                <option value="good">Shoulder good</option>
                <option value="iffy">Shoulder iffy</option>
                <option value="bad">Shoulder bad</option>
              </select>
              <input
                value={recoveryDraft.painNotes}
                onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, painNotes: event.target.value }))}
                placeholder="Pain notes"
                className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
              />
            </div>
            <button type="button" onClick={saveRecoveryEntry} className="mt-3 min-h-12 w-full rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
              Save recovery
            </button>
            <div className="mt-3 space-y-2">
              {recoveryEntries.slice(0, 3).map((entry) => (
                <div key={entry.date} className="rounded-2xl bg-white/[0.04] p-3 text-sm text-zinc-300">
                  <div className="font-semibold text-zinc-100">{formatShortDate(entry.date)}</div>
                  <div className="mt-1 text-zinc-400">
                    {entry.bodyweight ? `${entry.bodyweight} lb` : "bodyweight blank"} · sleep {entry.sleep || "blank"} · energy {entry.energy || "blank"} · shoulder {entry.shoulder}
                  </div>
                  {entry.painNotes && <div className="mt-1 text-amber-100">{entry.painNotes}</div>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Profile">
            <div className="space-y-3 text-sm text-zinc-300">
              <ProfileRow label="Name" value={demoProfile.displayName} />
              <ProfileRow label="Goal" value={demoProfile.goal} />
              <ProfileRow label="Split" value={demoProfile.trainingSplit} />
              <ProfileRow label="Equipment" value={demoProfile.equipment.join(", ")} />
              <ProfileRow label="Cautions" value={demoProfile.injuryNotes.join(", ")} />
            </div>
          </Section>

          <Section title="Split Settings">
            <div className="space-y-2 text-sm text-zinc-300">
              {splitDays.filter((day) => day !== "Custom").map((day) => (
                <div key={day} className="rounded-2xl bg-white/[0.04] p-3">
                  <div className="font-semibold text-zinc-100">{day}</div>
                  <div className="mt-1 text-zinc-400">{splitCatalog[day].join(" → ")}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Cloud Sync">
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Status</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{supabase ? syncStatus : "Supabase not configured"}</div>
              {user?.email && <div className="mt-1 text-sm text-zinc-400">{user.email}</div>}
              {lastCloudSyncAt && <div className="mt-1 text-xs text-zinc-500">Last cloud write {formatSyncTime(lastCloudSyncAt)}</div>}
            </div>

            {!supabase && (
              <p className="mt-3 text-sm text-zinc-400">
                Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable cross-device sync.
              </p>
            )}

            {supabase && !user && (
              <div className="mt-3 flex gap-2">
                <input
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="Email for magic link"
                  type="email"
                  className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm"
                />
                <button type="button" onClick={signInWithEmail} className="rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
                  Send
                </button>
              </div>
            )}

            {supabase && user && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={pushCloudState} className="min-h-12 rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
                  Push now
                </button>
                <button type="button" onClick={pullCloudState} className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-zinc-300">
                  Pull cloud
                </button>
                <button type="button" onClick={signOut} className="col-span-2 min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-zinc-300">
                  Sign out
                </button>
              </div>
            )}
          </Section>

          <Section title="Storage">
            <p className="text-sm text-zinc-400">Workouts are saved locally in this browser. When cloud sync is configured and signed in, this same state syncs through Supabase.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={exportBackup} className="min-h-12 rounded-2xl bg-amber-200 px-4 font-semibold text-zinc-950">
                Export
              </button>
              <button type="button" onClick={copyBackup} className="min-h-12 rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
                Copy data
              </button>
              <button type="button" onClick={copyLatestWorkout} className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-zinc-300">
                Copy latest
              </button>
              <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-zinc-300">
                Import
                <input type="file" accept="application/json" className="hidden" onChange={(event) => importBackup(event.target.files?.[0])} />
              </label>
            </div>
            <textarea
              value={backupText}
              onChange={(event) => setBackupText(event.target.value)}
              placeholder="Paste backup data"
              className="mt-3 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-200/50"
            />
            <button
              type="button"
              onClick={() => importBackupPayload(backupText)}
              disabled={!backupText.trim()}
              className="mt-2 min-h-12 w-full rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-500"
            >
              Import pasted data
            </button>
            {backupStatus && <div className="mt-2 rounded-2xl bg-white/[0.04] p-3 text-sm text-zinc-300">{backupStatus}</div>}
            <button type="button" onClick={clearAllData} className="mt-2 min-h-12 w-full rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 font-semibold text-rose-100">
              Clear local data
            </button>
          </Section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-xl grid-cols-5 gap-1 border-t border-white/10 bg-zinc-950/90 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-semibold ${isActive ? "bg-white/[0.08] text-amber-100" : "text-zinc-500"}`}
            >
              <Icon className="mb-1 h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function buildTags(parsed: ReturnType<typeof mockParseWorkout>) {
  const tags: string[] = parsed.workoutType !== "unknown" ? [parsed.workoutType] : [];
  if (parsed.bodyMetrics.sleepQuality === "bad") tags.push("bad sleep");
  if (parsed.bodyMetrics.painNotes) tags.push("pain");
  if (parsed.prCandidates.length) tags.push("PR?");
  if (parsed.skippedExercises.length) tags.push("skipped exercise");
  if (parsed.confidence < 0.75) tags.push("review");
  return tags;
}

function categoryToWorkoutType(category: ExerciseCategory): WorkoutType {
  const map: Record<ExerciseCategory, WorkoutType> = {
    Chest: "chest",
    Back: "back",
    Legs: "legs",
    Shoulders: "shoulders",
    Arms: "arms",
    Core: "recovery",
    Cardio: "cardio",
  };
  return map[category];
}

function splitDayToWorkoutType(day: SplitDay): WorkoutType {
  const map: Record<SplitDay, WorkoutType> = {
    Push: "push",
    Pull: "pull",
    "Shoulders & Arms": "shoulders-arms",
    "Chest & Back": "chest-back",
    Legs: "legs",
    Custom: "unknown",
  };
  return map[day];
}

function categoryForSplitDay(day: SplitDay): ExerciseCategory {
  const map: Record<SplitDay, ExerciseCategory> = {
    Push: "Shoulders",
    Pull: "Back",
    "Shoulders & Arms": "Shoulders",
    "Chest & Back": "Chest",
    Legs: "Legs",
    Custom: "Chest",
  };
  return map[day];
}

function createPlannedExercise(exerciseName: string): ParsedExercise {
  return {
    exerciseName,
    normalizedExerciseName: normalizeExerciseName(exerciseName),
    muscleGroup: categoryForExercise(exerciseName).toLowerCase(),
    sets: [],
  };
}

function categoryForExercise(exerciseName: string): ExerciseCategory {
  const normalized = normalizeExerciseName(exerciseName);
  return exerciseCategories.find((category) => exerciseCatalog[category].some((name) => normalizeExerciseName(name) === normalized)) ?? "Chest";
}

function mergeExerciseIntoWorkout(exercises: ParsedExercise[], nextExercise: ParsedExercise) {
  const existingIndex = exercises.findIndex((exercise) => exercise.normalizedExerciseName === nextExercise.normalizedExerciseName);
  if (existingIndex < 0) return [...exercises, nextExercise];

  return exercises.map((exercise, index) => {
    if (index !== existingIndex) return exercise;
    const sets = [...exercise.sets, ...nextExercise.sets].map((set, setIndex) => ({ ...set, setNumber: setIndex + 1, setsCount: exercise.sets.length + nextExercise.sets.length }));
    return {
      ...exercise,
      muscleGroup: exercise.muscleGroup ?? nextExercise.muscleGroup,
      notes: [exercise.notes, nextExercise.notes].filter(Boolean).join("; ") || undefined,
      sets,
    };
  });
}

function rebuildWorkoutFromExercises(workout: WorkoutLog, exercises: ParsedExercise[]): WorkoutLog {
  const rawText = exercises.map((exercise) => `${exercise.exerciseName}: ${formatSetList(exercise)}`).join("\n");
  return {
    ...workout,
    rawText,
    aiSummary: rawText,
    exercises,
    updatedAt: new Date().toISOString(),
  };
}

function formatSetList(exercise: ParsedExercise) {
  return exercise.sets
    .map((set) => `${set.weight ?? "BW"}x${set.reps ?? "?"}${set.notes?.includes("drop set") ? " drop" : ""}`)
    .join(", ");
}

function buildPlannedSets(setDrafts: SetDraft[], dropSetEnabled: boolean, dropSetWeight: string, dropSetReps: string) {
  const baseSets = setDrafts
    .map((draft) => ({
      weight: Number(draft.weight),
      reps: Number(draft.reps),
      isDropSet: false,
    }))
    .filter((set) => Number.isFinite(set.weight) && Number.isFinite(set.reps) && set.weight >= 0 && set.reps > 0);

  if (dropSetEnabled) {
    const weight = Number(dropSetWeight);
    const reps = Number(dropSetReps);
    if (Number.isFinite(weight) && Number.isFinite(reps) && weight >= 0 && reps > 0) {
      baseSets.push({ weight, reps, isDropSet: true });
    }
  }

  return baseSets;
}

function getWorkoutTotals(workout: WorkoutLog) {
  return workout.exercises.reduce(
    (totals, exercise) => {
      exercise.sets.forEach((set) => {
        totals.sets += 1;
        totals.reps += set.reps ?? 0;
        totals.volume += (set.weight ?? 0) * (set.reps ?? 0);
      });
      return totals;
    },
    { sets: 0, reps: 0, volume: 0 },
  );
}

function getLoggedExerciseOptions(workouts: WorkoutLog[]) {
  const exerciseMap = new Map<string, { normalizedName: string; displayName: string; lastDate: string; setCount: number }>();

  workouts.forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      if (!exercise.sets.length) return;
      const normalizedName = exercise.normalizedExerciseName || normalizeExerciseName(exercise.exerciseName);
      const existing = exerciseMap.get(normalizedName);
      const setCount = (existing?.setCount ?? 0) + exercise.sets.length;

      if (!existing || workout.workoutDate.localeCompare(existing.lastDate) > 0) {
        exerciseMap.set(normalizedName, {
          normalizedName,
          displayName: exercise.exerciseName,
          lastDate: workout.workoutDate,
          setCount,
        });
      } else {
        exerciseMap.set(normalizedName, { ...existing, setCount });
      }
    });
  });

  return Array.from(exerciseMap.values()).sort((a, b) => {
    const dateSort = b.lastDate.localeCompare(a.lastDate);
    if (dateSort) return dateSort;
    return b.setCount - a.setCount;
  });
}

function getActiveWorkoutInsight(workout: WorkoutLog) {
  const completedExercises = workout.exercises.filter((exercise) => exercise.sets.length).length;
  const allSets = workout.exercises.flatMap((exercise) => exercise.sets.map((set) => ({ exerciseName: exercise.exerciseName, set })));
  const topSet = allSets
    .map((entry) => ({ ...entry, score: (entry.set.weight ?? 0) * (entry.set.reps ?? 0) }))
    .sort((a, b) => b.score - a.score)[0];
  const lastLift = [...workout.exercises].reverse().find((exercise) => exercise.sets.length)?.exerciseName ?? "Nothing logged yet";

  return {
    completedExercises,
    totalExercises: workout.exercises.length,
    topSet: topSet ? `${topSet.exerciseName} ${topSet.set.weight ?? "BW"} x ${topSet.set.reps ?? "?"}` : "No sets yet",
    lastLift,
  };
}

function getWorkoutListTotals(workouts: WorkoutLog[]) {
  return workouts.reduce(
    (totals, workout) => {
      const workoutTotals = getWorkoutTotals(workout);
      return {
        sets: totals.sets + workoutTotals.sets,
        reps: totals.reps + workoutTotals.reps,
        volume: totals.volume + workoutTotals.volume,
      };
    },
    { sets: 0, reps: 0, volume: 0 },
  );
}

function getLiftInsight(exerciseName: string, workouts: WorkoutLog[]) {
  const history = getExerciseHistory(userId, exerciseName, workouts);
  const sets = history.map(({ set }) => set).filter((set) => set.weight || set.reps);
  const best = sets
    .map((set) => ({ set, e1rm: estimatedOneRepMax(set.weight, set.reps) }))
    .sort((a, b) => b.e1rm - a.e1rm)[0]?.set;
  const last = history[0]?.set;
  const sessions = new Set(history.map(({ workout }) => workout.id)).size;

  return {
    sessions,
    bestSet: best ? `${best.weight ?? "BW"}x${best.reps ?? "?"}` : "-",
    lastSet: last ? `${last.weight ?? "BW"}x${last.reps ?? "?"}` : "-",
    nextTarget: suggestNextSet(userId, exerciseName, workouts),
  };
}

function buildBackupPayload(workouts: WorkoutLog[], activeWorkout: WorkoutLog | null, recoveryEntries: RecoveryEntry[]) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
    activeWorkout,
    recoveryEntries,
    profile: demoProfile,
  };
}

function formatWorkoutForSharing(workout: WorkoutLog) {
  const lines = [
    `${workout.workoutDate} - ${workoutTypeLabel(workout.workoutType)}`,
    workout.aiSummary,
    "",
    ...workout.exercises.flatMap((exercise) => [
      exercise.exerciseName,
      ...exercise.sets.map((set) => `- ${set.weight ?? "BW"} x ${set.reps ?? "?"}${set.notes ? ` (${set.notes})` : ""}`),
      "",
    ]),
  ];

  return lines.join("\n").trim();
}

function filterHistory(workouts: WorkoutLog[], search: string, typeFilter: HistoryTypeFilter) {
  const query = normalizeExerciseName(search);
  return workouts.filter((workout) => {
    if (typeFilter !== "all" && workout.workoutType !== typeFilter) return false;
    if (!query) return true;
    return getWorkoutSearchText(workout).includes(query);
  });
}

function getWorkoutSearchText(workout: WorkoutLog) {
  return normalizeExerciseName(
    [
      workout.rawText,
      workout.aiSummary,
      workout.workoutType,
      workout.tags.join(" "),
      ...workout.exercises.flatMap((exercise) => [
        exercise.exerciseName,
        exercise.normalizedExerciseName,
        exercise.muscleGroup ?? "",
        exercise.notes ?? "",
        ...exercise.sets.map((set) => `${set.weight ?? ""} ${set.reps ?? ""} ${set.notes ?? ""}`),
      ]),
    ].join(" "),
  );
}

function readLocalSyncState(): CloudSyncState {
  return {
    workouts: readStoredWorkouts() ?? demoWorkouts,
    activeWorkout: readStoredActiveWorkout(),
    recoveryEntries: readStoredRecovery() ?? [],
  };
}

function mergeSyncStates(cloudState: CloudSyncState, localState: CloudSyncState): CloudSyncState {
  return {
    workouts: mergeWorkouts(cloudState.workouts, localState.workouts),
    activeWorkout: cloudState.activeWorkout ?? localState.activeWorkout,
    recoveryEntries: mergeRecoveryEntries(cloudState.recoveryEntries, localState.recoveryEntries),
  };
}

function mergeWorkouts(cloudWorkouts: WorkoutLog[], localWorkouts: WorkoutLog[]) {
  const workoutsById = new Map<string, WorkoutLog>();
  [...cloudWorkouts, ...localWorkouts].forEach((workout) => {
    const normalizedWorkout = normalizeWorkoutSplitType(workout);
    const existing = workoutsById.get(workout.id);
    if (!existing || new Date(workout.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      workoutsById.set(workout.id, normalizedWorkout);
    }
  });

  return Array.from(workoutsById.values()).sort((a, b) => {
    const dateSort = b.workoutDate.localeCompare(a.workoutDate);
    if (dateSort) return dateSort;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function normalizeWorkoutSplitType(workout: WorkoutLog): WorkoutLog {
  const splitText = [workout.rawText, workout.aiSummary, ...workout.tags].join(" ").toLowerCase();
  if (workout.workoutType === "chest" && /chest\s*(&|and|-|\/)\s*back/.test(splitText)) {
    return { ...workout, workoutType: "chest-back" };
  }
  if (workout.workoutType === "shoulders" && /shoulders?\s*(&|and|-|\/)\s*arms?/.test(splitText)) {
    return { ...workout, workoutType: "shoulders-arms" };
  }
  return workout;
}

function mergeRecoveryEntries(cloudEntries: RecoveryEntry[], localEntries: RecoveryEntry[]) {
  const entriesByDate = new Map<string, RecoveryEntry>();
  [...cloudEntries, ...localEntries].forEach((entry) => entriesByDate.set(entry.date, entry));
  return Array.from(entriesByDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function workoutToEditDraft(workout: WorkoutLog): WorkoutEditDraft {
  return {
    id: workout.id,
    workoutDate: workout.workoutDate,
    workoutType: workout.workoutType,
    aiSummary: workout.aiSummary,
    rawText: workout.rawText,
    tags: workout.tags.join(", "),
    exercises: workout.exercises.map((exercise) => ({
      exerciseName: exercise.exerciseName,
      muscleGroup: exercise.muscleGroup ?? "",
      notes: exercise.notes ?? "",
      sets: exercise.sets.map((set) => ({
        id: set.id,
        weight: set.weight?.toString() ?? "",
        reps: set.reps?.toString() ?? "",
        notes: set.notes ?? "",
      })),
    })),
  };
}

function editDraftToWorkout(draft: WorkoutEditDraft, fallback: WorkoutLog): WorkoutLog {
  const exercises = draft.exercises
    .map((exercise) => {
      const exerciseName = exercise.exerciseName.trim();
      const normalizedExerciseName = normalizeExerciseName(exerciseName);
      const sets = exercise.sets
        .map((set, index) => {
          const weight = set.weight.trim() === "" ? undefined : Number(set.weight);
          const reps = set.reps.trim() === "" ? undefined : Number(set.reps);
          return {
            id: set.id,
            exerciseName,
            normalizedExerciseName,
            setNumber: index + 1,
            weight: Number.isFinite(weight) ? weight : undefined,
            reps: Number.isFinite(reps) ? reps : undefined,
            notes: set.notes.trim() || undefined,
          };
        })
        .filter((set) => set.weight !== undefined || set.reps !== undefined || set.notes);

      return {
        exerciseName,
        normalizedExerciseName,
        muscleGroup: exercise.muscleGroup.trim() || undefined,
        notes: exercise.notes.trim() || undefined,
        sets,
      };
    })
    .filter((exercise) => exercise.exerciseName && exercise.sets.length);
  const rawText = draft.rawText.trim() || exercises.map((exercise) => `${exercise.exerciseName}: ${formatSetList(exercise)}`).join("\n");

  return {
    ...fallback,
    workoutDate: draft.workoutDate || fallback.workoutDate,
    workoutType: draft.workoutType,
    aiSummary: draft.aiSummary.trim() || rawText,
    rawText,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    exercises,
    updatedAt: new Date().toISOString(),
  };
}

function readStoredWorkouts() {
  try {
    const saved = localStorage.getItem(WORKOUTS_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as WorkoutLog[]).map(normalizeWorkoutSplitType) : null;
  } catch {
    return null;
  }
}

function readStoredActiveWorkout() {
  try {
    const saved = localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    if (!saved) return null;
    return normalizeWorkoutSplitType(JSON.parse(saved) as WorkoutLog);
  } catch {
    return null;
  }
}

function readStoredRecovery() {
  try {
    const saved = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as RecoveryEntry[]) : null;
  } catch {
    return null;
  }
}

function WorkoutEditPanel({
  draft,
  title = "Edit workout",
  body = "Fix date, notes, tags, or any set that was logged wrong.",
  saveLabel = "Save",
  error,
  onCancel,
  onSave,
  onWorkoutChange,
  onExerciseChange,
  onSetChange,
  onAddSet,
  onRemoveSet,
}: {
  draft: WorkoutEditDraft;
  title?: string;
  body?: string;
  saveLabel?: string;
  error?: string;
  onCancel: () => void;
  onSave: () => void;
  onWorkoutChange: <Field extends keyof WorkoutEditDraft>(field: Field, value: WorkoutEditDraft[Field]) => void;
  onExerciseChange: (index: number, field: keyof WorkoutEditExerciseDraft, value: string) => void;
  onSetChange: (exerciseIndex: number, setIndex: number, field: keyof WorkoutEditSetDraft, value: string) => void;
  onAddSet: (exerciseIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
}) {
  const workoutTypes: WorkoutType[] = ["push", "pull", "legs", "chest-back", "shoulders-arms", "chest", "back", "arms", "shoulders", "cardio", "recovery", "unknown"];

  return (
    <section className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-100">{title}</div>
          <p className="mt-1 text-xs text-zinc-400">{body}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-2xl border border-white/10 px-3 text-sm font-semibold text-zinc-300">
            Cancel
          </button>
          <button type="button" onClick={onSave} className="min-h-10 rounded-2xl bg-emerald-200 px-3 text-sm font-semibold text-zinc-950">
            {saveLabel}
          </button>
        </div>
      </div>
      {error && <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-300/10 p-3 text-sm font-semibold text-red-100">{error}</div>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <input
          type="date"
          value={draft.workoutDate}
          onChange={(event) => onWorkoutChange("workoutDate", event.target.value)}
          className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100"
        />
        <select
          value={draft.workoutType}
          onChange={(event) => onWorkoutChange("workoutType", event.target.value as WorkoutType)}
          className="min-h-12 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100"
        >
          {workoutTypes.map((type) => (
            <option key={type} value={type}>
              {workoutTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>

      <input
        value={draft.aiSummary}
        onChange={(event) => onWorkoutChange("aiSummary", event.target.value)}
        placeholder="Summary"
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      <textarea
        value={draft.rawText}
        onChange={(event) => onWorkoutChange("rawText", event.target.value)}
        placeholder="Raw log"
        className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/40 p-3 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      <input
        value={draft.tags}
        onChange={(event) => onWorkoutChange("tags", event.target.value)}
        placeholder="Tags separated by commas"
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
      />

      <div className="mt-4 space-y-3">
        {draft.exercises.map((exercise, exerciseIndex) => (
          <div key={`${draft.id}-${exerciseIndex}`} className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={exercise.exerciseName}
                onChange={(event) => onExerciseChange(exerciseIndex, "exerciseName", event.target.value)}
                placeholder="Exercise"
                className="min-h-11 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <input
                value={exercise.muscleGroup}
                onChange={(event) => onExerciseChange(exerciseIndex, "muscleGroup", event.target.value)}
                placeholder="Muscle group"
                className="min-h-11 rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <input
              value={exercise.notes}
              onChange={(event) => onExerciseChange(exerciseIndex, "notes", event.target.value)}
              placeholder="Exercise notes"
              className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <div className="mt-3 space-y-2">
              {exercise.sets.map((set, setIndex) => (
                <div key={set.id} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
                  <input
                    value={set.weight}
                    onChange={(event) => onSetChange(exerciseIndex, setIndex, "weight", event.target.value)}
                    placeholder="Weight"
                    inputMode="decimal"
                    className="min-h-10 rounded-xl border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                  <input
                    value={set.reps}
                    onChange={(event) => onSetChange(exerciseIndex, setIndex, "reps", event.target.value)}
                    placeholder="Reps"
                    inputMode="numeric"
                    className="min-h-10 rounded-xl border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                  <input
                    value={set.notes}
                    onChange={(event) => onSetChange(exerciseIndex, setIndex, "notes", event.target.value)}
                    placeholder="Notes"
                    className="min-h-10 rounded-xl border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveSet(exerciseIndex, setIndex)}
                    className="min-h-10 rounded-xl border border-red-300/20 px-3 text-sm font-semibold text-red-100"
                  >
                    Del
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onAddSet(exerciseIndex)} className="mt-3 min-h-10 rounded-2xl border border-white/10 px-3 text-sm font-semibold text-amber-100">
              Add set
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4">
      <div className="font-semibold text-zinc-100">{title}</div>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-1 text-zinc-100">{value}</div>
    </div>
  );
}
