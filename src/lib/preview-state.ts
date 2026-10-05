import { parsePreviewState } from "@kud/amo"
import type { PreviewState, PreviewStateEntry } from "@kud/amo"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const PREVIEW_STATE_FILE = ".amo-previews.json"

export const previewStatePath = (dir: string) => join(dir, PREVIEW_STATE_FILE)

export type PreviewStateRead =
  | { kind: "found"; state: PreviewState }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string }

export const readPreviewState = async (
  dir: string,
): Promise<PreviewStateRead> => {
  const path = previewStatePath(dir)
  const text = await readFile(path, "utf8").catch(() => null)
  if (text === null) return { kind: "missing" }
  try {
    return { kind: "found", state: parsePreviewState(JSON.parse(text), path) }
  } catch (error) {
    return {
      kind: "invalid",
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export const writePreviewState = async (
  dir: string,
  previews: PreviewStateEntry[],
): Promise<string> => {
  const path = previewStatePath(dir)
  const state: PreviewState = { version: 1, previews }
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`)
  return path
}
