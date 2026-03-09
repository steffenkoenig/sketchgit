import type { createSketchGitApp } from "@/lib/sketchgit/createSketchGitApp";

export type SketchGitAppApi = ReturnType<typeof createSketchGitApp>;
export type SketchGitCall = (method: keyof SketchGitAppApi, ...args: any[]) => void;
