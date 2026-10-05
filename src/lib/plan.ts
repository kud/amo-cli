import { AMO_API, redactHeaders } from "@kud/amo"
import type { PreviewSyncPlan } from "@kud/amo"
import type { Scope } from "./inputs.js"

export type PlannedRequest =
  | {
      kind: "listing"
      method: "PATCH"
      url: string
      body: Record<string, unknown>
    }
  | { kind: "icon"; method: "PATCH"; url: string; file: string }
  | { kind: "delete-preview"; method: "DELETE"; url: string; id: number }
  | {
      kind: "add-preview"
      method: "POST"
      url: string
      file: string
      caption: string | null
      position: number
    }

export type PlanArgs = {
  guid: string
  only: Scope[]
  patch: Record<string, unknown>
  iconPath: string | null
  previewPlan: Pick<PreviewSyncPlan, "deletes" | "uploads">
}

const addonUrl = (guid: string) => `${AMO_API}/addons/addon/${guid}/`

export const planRequests = ({
  guid,
  only,
  patch,
  iconPath,
  previewPlan,
}: PlanArgs): PlannedRequest[] => {
  const listing: PlannedRequest[] =
    only.includes("listing") && Object.keys(patch).length > 0
      ? [{ kind: "listing", method: "PATCH", url: addonUrl(guid), body: patch }]
      : []
  const icon: PlannedRequest[] =
    only.includes("icon") && iconPath
      ? [{ kind: "icon", method: "PATCH", url: addonUrl(guid), file: iconPath }]
      : []
  const previews: PlannedRequest[] = only.includes("previews")
    ? [
        ...previewPlan.deletes.map((id): PlannedRequest => ({
          kind: "delete-preview",
          method: "DELETE",
          url: `${addonUrl(guid)}previews/${id}/`,
          id,
        })),
        ...previewPlan.uploads.map(
          ({ file, caption, position }): PlannedRequest => ({
            kind: "add-preview",
            method: "POST",
            url: `${addonUrl(guid)}previews/`,
            file,
            caption,
            position,
          }),
        ),
      ]
    : []
  return [...listing, ...icon, ...previews]
}

export const describeRequest = (request: PlannedRequest): string[] => {
  const auth = redactHeaders({ Authorization: "JWT <token>" })["Authorization"]
  const head = [
    `  ${request.method} ${request.url}`,
    `    Authorization: ${auth}`,
  ]
  switch (request.kind) {
    case "listing":
      return [...head, `    body: ${JSON.stringify(request.body)}`]
    case "icon":
      return [...head, `    multipart: icon=${request.file}`]
    case "add-preview":
      return [
        ...head,
        `    multipart: image=${request.file} position=${request.position}`,
        ...(request.caption
          ? [
              `  then PATCH ${request.url}<new id>/`,
              `    body: ${JSON.stringify({ caption: { "en-US": request.caption } })}`,
            ]
          : []),
      ]
    case "delete-preview":
      return head
  }
}
