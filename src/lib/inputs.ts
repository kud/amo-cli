export const SCOPES = ["listing", "icon", "previews"] as const

export type Scope = (typeof SCOPES)[number]

export const parseOnly = (raw: string | undefined): Scope[] => {
  if (raw === undefined) return [...SCOPES]
  const requested = raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
  const unknown = requested.filter(
    (scope) => !(SCOPES as readonly string[]).includes(scope),
  )
  if (requested.length === 0 || unknown.length > 0) {
    throw new Error(
      `--only must be a comma-separated list of ${SCOPES.join("|")}`,
    )
  }
  return [...new Set(requested)] as Scope[]
}

export type PushFlags = {
  listing?: string
  guid?: string
  icon?: string
  screenshots?: string
}

export type PushInputs = {
  listingPath: string | null
  guid: string
  iconPath: string | null
  screenshotsDir: string | null
}

export const resolvePushInputs = (
  flags: PushFlags,
  env: Record<string, string | undefined>,
  only: Scope[],
): PushInputs => {
  const guid = flags.guid ?? env["AMO_GUID"]
  const listingPath = flags.listing ?? env["AMO_LISTING"] ?? null
  if (!guid) throw new Error("missing add-on guid (--guid or AMO_GUID)")
  if (only.includes("listing") && !listingPath) {
    throw new Error("missing listing file (--listing or AMO_LISTING)")
  }
  return {
    guid,
    listingPath,
    iconPath: flags.icon ?? env["AMO_ICON"] ?? null,
    screenshotsDir: flags.screenshots ?? env["AMO_SCREENSHOTS"] ?? null,
  }
}
