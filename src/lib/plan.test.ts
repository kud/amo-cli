import { describe, it, expect } from "vitest"
import { describeRequest, planRequests } from "./plan.js"

const base = {
  guid: "a@b.c",
  patch: { name: { "en-US": "New" } },
  iconPath: "icon.png",
  previewPlan: {
    deletes: [7, 8],
    uploads: [
      { file: "01.png", caption: "First", position: 0 },
      { file: "02.png", caption: null, position: 1 },
    ],
  },
}

describe("planRequests", () => {
  it("orders listing, icon, deletes then uploads", () => {
    const kinds = planRequests({
      ...base,
      only: ["listing", "icon", "previews"],
    }).map((request) => `${request.method} ${request.kind}`)
    expect(kinds).toEqual([
      "PATCH listing",
      "PATCH icon",
      "DELETE delete-preview",
      "DELETE delete-preview",
      "POST add-preview",
      "POST add-preview",
    ])
  })

  it("respects the requested scopes", () => {
    const requests = planRequests({ ...base, only: ["icon"] })
    expect(requests.map((request) => request.kind)).toEqual(["icon"])
  })

  it("skips an empty listing patch", () => {
    expect(planRequests({ ...base, patch: {}, only: ["listing"] })).toEqual([])
  })
})

describe("describeRequest", () => {
  it("never prints a token", () => {
    const lines = planRequests({
      ...base,
      only: ["listing", "previews"],
    }).flatMap(describeRequest)
    expect(lines.join("\n")).toContain("Authorization: JWT <redacted>")
    expect(lines.join("\n")).not.toMatch(/eyJ/)
    expect(lines).toContain("    multipart: image=01.png position=0")
    expect(lines).toContain(
      `    body: ${JSON.stringify({ caption: { "en-US": "First" } })}`,
    )
    expect(lines).toContain("    multipart: image=02.png position=1")
  })
})
