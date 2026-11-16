// Frontend half of the planner feature flag. Must match PLANNER_ENABLED on the backend.
export const plannerEnabled = (): boolean => import.meta.env.VITE_PLANNER_ENABLED === "true";
