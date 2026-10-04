import { describe, it, expect } from "vitest"
import { parseOnly, resolvePushInputs } from "./inputs.js"

describe("parseOnly", () => {
  it("defaults to every scope", () => {
    expect(parseOnly(undefined)).toEqual(["listing", "icon", "previews"])
  })

  it("accepts a comma-separated subset and dedupes", () => {
    expect(parseOnly("listing, previews,listing")).toEqual([
      "listing",
      "previews",
    ])
  })

  it("rejects unknown and empty scopes", () => {
    expect(() => parseOnly("listing,nope")).toThrow(/--only must be/)
    expect(() => parseOnly("")).toThrow(/--only must be/)
  })
})

describe("resolvePushInputs", () => {
  it("prefers flags over the environment", () => {
    const inputs = resolvePushInputs(
      { guid: "a@b.c", listing: "l.json" },
      { AMO_GUID: "env@b.c", AMO_ICON: "icon.png" },
      ["listing", "icon"],
    )
    expect(inputs).toEqual({
      guid: "a@b.c",
      listingPath: "l.json",
      iconPath: "icon.png",
      screenshotsDir: null,
    })
  })

  it("requires a guid", () => {
    expect(() => resolvePushInputs({}, {}, ["previews"])).toThrow(/guid/)
  })

  it("requires a listing file only when the listing scope is on", () => {
    expect(() => resolvePushInputs({ guid: "g" }, {}, ["listing"])).toThrow(
      /listing file/,
    )
    expect(() =>
      resolvePushInputs({ guid: "g" }, {}, ["previews"]),
    ).not.toThrow()
  })
})
