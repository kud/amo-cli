import {
  buildListingPatch,
  createAmoClient,
  diffListing,
  getPublicAddon,
  planPreviewSync,
  readListingFile,
} from "@kud/amo"
import type { AmoAddon, AmoClient, ListingChange } from "@kud/amo"
import { stat } from "node:fs/promises"
import { readCredentials, requireCredentials } from "./credentials.js"
import type { PushInputs, Scope } from "./inputs.js"
import { describeRequest, planRequests } from "./plan.js"
import type { PlannedRequest } from "./plan.js"
import { readScreenshots } from "./screenshots.js"
import type { Screenshot } from "./screenshots.js"

export type PushOptions = {
  inputs: PushInputs
  only: Scope[]
  apply: boolean
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

const livePreviewSummaries = (live: AmoAddon) =>
  [...(live.previews ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(({ id, caption }) => ({ id, caption }))

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

const execute = async (
  client: AmoClient,
  guid: string,
  request: PlannedRequest,
  shots: Screenshot[],
) => {
  switch (request.kind) {
    case "listing":
      return client.updateListing(guid, request.body)
    case "icon":
      return client.uploadIcon(guid, request.file)
    case "delete-preview":
      return client.removePreview(guid, request.id)
    case "add-preview": {
      const shot = shots.find((candidate) => candidate.file === request.file)
      return client.addPreview(guid, shot?.path ?? request.file, {
        caption: request.caption ?? undefined,
      })
    }
  }
}

export const runPush = async ({
  inputs,
  only,
  apply,
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
  const shots =
    only.includes("previews") && screenshotsDir
      ? await readScreenshots(screenshotsDir)
      : []
  const previewPlan = planPreviewSync(
    shots.map(({ file, caption }) => ({ file, caption })),
    livePreviewSummaries(live),
  )

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
    }
  }
  if (requests.length === 0) {
    log("nothing to send")
    return requests
  }
  log("planned requests:")
  requests.forEach((request) => describeRequest(request).forEach(log))
  if (!keys) return requests

  const client = createAmoClient(keys)
  for (const request of requests) {
    await execute(client, guid, request, shots)
    log(`sent: ${request.method} ${request.url}`)
  }
  return requests
}
