import type { AmoAddon } from "@kud/amo"
import { describe, it, expect } from "vitest"
import { buildStatusReport, formatStatusReport } from "./status.js"

const addon = {
  id: 1,
  guid: "a@b.c",
  slug: "widget",
  status: "public",
  name: { "en-US": "Widget" },
} as unknown as AmoAddon

describe("formatStatusReport", () => {
  it("reports an approved version", () => {
    const report = buildStatusReport(addon, {
      id: 9,
      version: "1.2.0",
      channel: "listed",
      fileStatus: "public",
      approved: true,
    })
    expect(formatStatusReport(report)).toEqual([
      "Widget (a@b.c)",
      "listing:  public",
      "version:  1.2.0 (listed)",
      "review:   approved (file public)",
    ])
  })

  it("reports a pending version and a missing one", () => {
    const pending = formatStatusReport(
      buildStatusReport(addon, {
        id: 9,
        version: "1.3.0",
        channel: null,
        fileStatus: "unreviewed",
        approved: false,
      }),
    )
    expect(pending.slice(2)).toEqual([
      "version:  1.3.0",
      "review:   not approved (file unreviewed)",
    ])
    expect(formatStatusReport(buildStatusReport(addon, null)).slice(2)).toEqual(
      ["version:  none found", "review:   -"],
    )
  })
})
