"use client";

import { useCallback, useEffect, useState } from "react";

import {
  emptyLocalWorkspace,
  LOCAL_WORKSPACE_EVENT,
  readLocalWorkspace,
  updateLocalWorkspace,
  type LocalWorkspaceState,
} from "@/core/local-workspace";
import {
  markPromptRecipeUsed as markRecipeUsed,
  markSkillWorkflowUsed as markWorkflowUsed,
  recordSkillFeedback as applySkillFeedback,
  removePromptRecipe as removeRecipe,
  removeSkillWorkflow as removeWorkflow,
  savePromptRecipe as upsertRecipe,
  saveSkillWorkflow as upsertWorkflow,
  type PromptFeedbackOutcome,
  type PromptRecipeInput,
  type SkillWorkflowInput,
} from "@/core/personal-library";

export function useLocalWorkspace() {
  const [workspace, setWorkspace] = useState<LocalWorkspaceState>(emptyLocalWorkspace);

  useEffect(() => {
    const refresh = () => setWorkspace(readLocalWorkspace());
    refresh();
    window.addEventListener(LOCAL_WORKSPACE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LOCAL_WORKSPACE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const commit = useCallback((updater: (state: LocalWorkspaceState) => LocalWorkspaceState) => {
    setWorkspace(updateLocalWorkspace(updater));
  }, []);

  const toggleFavorite = useCallback((skillId: string) => commit((state) => ({
    ...state,
    favorites: state.favorites.includes(skillId)
      ? state.favorites.filter((id) => id !== skillId)
      : [...state.favorites, skillId],
  })), [commit]);

  const togglePinned = useCallback((skillId: string) => commit((state) => ({
    ...state,
    pinned: state.pinned.includes(skillId)
      ? state.pinned.filter((id) => id !== skillId)
      : [...state.pinned, skillId],
  })), [commit]);

  const saveNote = useCallback((skillId: string, note: string) => commit((state) => {
    const nextNotes = { ...state.notes };
    const cleanNote = note.trim().slice(0, 4_000);
    if (cleanNote) nextNotes[skillId] = cleanNote;
    else delete nextNotes[skillId];
    return { ...state, notes: nextNotes };
  }), [commit]);

  const clearWorkspace = useCallback(() => commit(() => emptyLocalWorkspace()), [commit]);

  const savePromptRecipe = useCallback((input: PromptRecipeInput) => commit((state) => ({
    ...state,
    personalLibrary: upsertRecipe(state.personalLibrary, input),
  })), [commit]);

  const deletePromptRecipe = useCallback((recipeId: string) => commit((state) => ({
    ...state,
    personalLibrary: removeRecipe(state.personalLibrary, recipeId),
  })), [commit]);

  const markPromptRecipeUsed = useCallback((recipeId: string) => commit((state) => ({
    ...state,
    personalLibrary: markRecipeUsed(state.personalLibrary, recipeId),
  })), [commit]);

  const saveSkillWorkflow = useCallback((input: SkillWorkflowInput) => commit((state) => ({
    ...state,
    personalLibrary: upsertWorkflow(state.personalLibrary, input),
  })), [commit]);

  const deleteSkillWorkflow = useCallback((workflowId: string) => commit((state) => ({
    ...state,
    personalLibrary: removeWorkflow(state.personalLibrary, workflowId),
  })), [commit]);

  const markSkillWorkflowUsed = useCallback((workflowId: string) => commit((state) => ({
    ...state,
    personalLibrary: markWorkflowUsed(state.personalLibrary, workflowId),
  })), [commit]);

  const recordSkillFeedback = useCallback((skillId: string, outcome: PromptFeedbackOutcome, copyAt: string) => commit((state) => ({
    ...state,
    personalLibrary: applySkillFeedback(state.personalLibrary, skillId, outcome, copyAt),
  })), [commit]);

  return {
    workspace,
    toggleFavorite,
    togglePinned,
    saveNote,
    clearWorkspace,
    savePromptRecipe,
    deletePromptRecipe,
    markPromptRecipeUsed,
    saveSkillWorkflow,
    deleteSkillWorkflow,
    markSkillWorkflowUsed,
    recordSkillFeedback,
  };
}
