import { createAmoClient, localizedEnUs } from "@kud/amo"
import type { AmoAddon, VersionStatus } from "@kud/amo"
import { requireCredentials } from "./credentials.js"

export type StatusReport = {
  guid: string
  name: string | null
  slug: string
  listingStatus: string | null
  latestVersion: VersionStatus | null
}

export const buildStatusReport = (
  addon: AmoAddon,
  latestVersion: VersionStatus | null,
): StatusReport => ({
  guid: addon.guid,
  name: localizedEnUs(addon.name),
  slug: addon.slug,
  listingStatus: addon.status ?? null,
  latestVersion,
})

export const formatStatusReport = (report: StatusReport): string[] => {
  const version = report.latestVersion
  return [
    `${report.name ?? report.slug} (${report.guid})`,
    `listing:  ${report.listingStatus ?? "unknown"}`,
    version
      ? `version:  ${version.version}${version.channel ? ` (${version.channel})` : ""}`
      : "version:  none found",
    version
      ? `review:   ${version.approved ? "approved" : "not approved"} (file ${version.fileStatus ?? "unknown"})`
      : "review:   -",
  ]
}

export const fetchStatus = async (
  guid: string,
  env: Record<string, string | undefined>,
): Promise<StatusReport> => {
  const client = createAmoClient(requireCredentials(env))
  const [addon, latestVersion] = await Promise.all([
    client.getAddon(guid),
    client.getVersionStatus(guid),
  ])
  return buildStatusReport(addon, latestVersion)
}
