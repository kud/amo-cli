import {
  buildListingPatch,
  createAmoClient,
  diffListing,
  getPublicAddon,
  planPreviewSync,
  readListingFile,
} from "@kud/amo"
import type {
  AmoAddon,
  AmoClient,
  ListingChange,
  PreviewStateEntry,
  PreviewSyncPlan,
} from "@kud/amo"
import { stat } from "node:fs/promises"
import { readCredentials, requireCredentials } from "./credentials.js"
import type { PushInputs, Scope } from "./inputs.js"
import { describeRequest, planRequests } from "./plan.js"
import type { PlannedRequest } from "./plan.js"
import {
  PREVIEW_STATE_FILE,
  readPreviewState,
  writePreviewState,
} from "./preview-state.js"
import type { PreviewStateRead } from "./preview-state.js"
import { readScreenshots } from "./screenshots.js"
import type { Screenshot } from "./screenshots.js"

export type PushOptions = {
  inputs: PushInputs
  only: Scope[]
  apply: boolean
  force?: boolean
  env: Record<string, string | undefined>
  log: (line: string) => void
}

const readLiveAddon = async (
  guid: string,
  env: Record<string, string | undefined>,
): Promise<AmoAddon> => {
  const keys = readCredentials(env)
  return keys ? createAmoClient(keys).getAddon(guid) : getPublicAddon(guid)
}

const assertFile = async (path: string, label: string) => {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error(`${label} not found: ${path}`)
}

const logDifferences = (
  log: (line: string) => void,
  changes: ListingChange[],
) => {
  if (changes.length === 0) return log("listing: no differences")
  changes.forEach(({ field, live, patch }) => {
    log(`listing: ${field} differs`)
    log(`  live:  ${JSON.stringify(live)}`)
    log(`  local: ${JSON.stringify(patch)}`)
  })
}

const previewDriftMessage = (
  plan: PreviewSyncPlan,
  stateRead: PreviewStateRead,
): string => {
  switch (plan.reason) {
    case "forced":
      return "previews: --force, replacing all"
    case "no-state":
      return stateRead.kind === "invalid"
        ? `previews: ignoring ${PREVIEW_STATE_FILE} (${stateRead.reason}), replacing all`
        : `previews: no ${PREVIEW_STATE_FILE} yet, replacing all`
    case "live-changed":
      return `previews: AMO no longer matches ${PREVIEW_STATE_FILE}, replacing all`
    case "local-changed":
      return "previews: local screenshots changed, replacing all"
    default:
      return `previews: ${plan.reason}`
  }
}

const execute = async (
  client: AmoClient,
  guid: string,
  request: PlannedRequest,
  shots: Screenshot[],
): Promise<number | null> => {
  switch (request.kind) {
    case "listing":
      await client.updateListing(guid, request.body)
      return null
    case "icon":
      await client.uploadIcon(guid, request.file)
      return null
    case "delete-preview":
      await client.removePreview(guid, request.id)
      return null
    case "add-preview": {
      const shot = shots.find((candidate) => candidate.file === request.file)
      const preview = await client.addPreview(
        guid,
        shot?.path ?? request.file,
        { caption: request.caption ?? undefined, position: request.position },
      )
      return preview.id
    }
  }
}

const stateEntryFor = (
  shots: Screenshot[],
  request: PlannedRequest,
  id: number,
): PreviewStateEntry[] => {
  if (request.kind !== "add-preview") return []
  const shot = shots.find((candidate) => candidate.file === request.file)
  return shot
    ? [{ id, file: shot.file, sha256: shot.sha256, caption: shot.caption }]
    : []
}

export const runPush = async ({
  inputs,
  only,
  apply,
  force = false,
  env,
  log,
}: PushOptions): Promise<PlannedRequest[]> => {
  const { guid, listingPath, iconPath, screenshotsDir } = inputs
  const keys = apply ? requireCredentials(env) : null

  const live = await readLiveAddon(guid, env).catch((error: unknown) => {
    throw new Error(
      `could not fetch the live listing — ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  })

  const changes =
    only.includes("listing") && listingPath
      ? diffListing(await readListingFile(listingPath), live)
      : []
  const previewsDir = only.includes("previews") ? screenshotsDir : null
  const shots = previewsDir ? await readScreenshots(previewsDir) : []
  const stateRead: PreviewStateRead = previewsDir
    ? await readPreviewState(previewsDir)
    : { kind: "missing" }
  const previewPlan = planPreviewSync(shots, live.previews ?? [], {
    state: stateRead.kind === "found" ? stateRead.state : null,
    force,
  })

  if (only.includes("icon")) {
    if (!iconPath) throw new Error("icon scope needs --icon (or AMO_ICON)")
    await assertFile(iconPath, "icon")
  }

  const requests = planRequests({
    guid,
    only,
    patch: buildListingPatch(changes),
    iconPath: only.includes("icon") ? iconPath : null,
    previewPlan,
  })

  log(`AMO listing for ${guid} (${apply ? "--apply" : "dry run"})`)
  if (only.includes("listing")) logDifferences(log, changes)
  if (only.includes("previews")) {
    if (!screenshotsDir) {
      log(
        "previews: no screenshots dir (--screenshots or AMO_SCREENSHOTS), skipping",
      )
    } else if (shots.length === 0) {
      log(`previews: no screenshots in ${screenshotsDir}, skipping`)
    } else if (previewPlan.inSync) {
      log(`previews: in sync (${shots.length})`)
    } else {
      log(previewDriftMessage(previewPlan, stateRead))
    }
  }
  if (requests.length === 0) {
    log("nothing to send")
    return requests
  }
  log("planned requests:")
  requests.forEach((request) => {
    describeRequest(request).forEach((line) => log(line))
  })
  if (!keys) return requests

  const client = createAmoClient(keys)
  const recorded: PreviewStateEntry[] = []
  for (const request of requests) {
    const createdId = await execute(client, guid, request, shots)
    if (createdId !== null) {
      recorded.push(...stateEntryFor(shots, request, createdId))
    }
    log(`sent: ${request.method} ${request.url}`)
  }
  if (previewsDir && previewPlan.uploads.length > 0) {
    const path = await writePreviewState(previewsDir, recorded)
    log(`wrote ${path}`)
  }
  return requests
}
