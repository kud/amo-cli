import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { runPush } from "./push.js"

type Call = { url: string; method: string; headers: Record<string, string> }

const liveAddon = {
  id: 1,
  guid: "a@b.c",
  slug: "widget",
  name: { "en-US": "Widget" },
  summary: { "en-US": "Do the thing" },
  description: { "en-US": "<strong>Hello</strong>" },
  categories: { firefox: ["tabs"] },
  tags: [],
  previews: [
    { id: 11, position: 0, caption: { "en-US": "Old" } },
    { id: 12, position: 1, caption: null },
  ],
}

const stubFetch = () => {
  const calls: Call[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        headers: (init?.headers ?? {}) as Record<string, string>,
      })
      return new Response(
        init?.method === "DELETE" ? null : JSON.stringify(liveAddon),
        { status: init?.method === "DELETE" ? 204 : 200 },
      )
    }),
  )
  return calls
}

const fixture = async () => {
  const dir = await mkdtemp(join(tmpdir(), "amo-push-"))
  const listing = join(dir, "listing.json")
  await writeFile(
    listing,
    JSON.stringify({
      name: { "en-US": "Widget" },
      description: { "en-US": "**Hello**" },
      summary: { "en-US": "Do another thing" },
      categories: ["tabs"],
      tags: [],
    }),
  )
  const shots = join(dir, "shots")
  await import("node:fs/promises").then(({ mkdir }) => mkdir(shots))
  await writeFile(join(shots, "01.png"), "png")
  await writeFile(join(shots, "01.txt"), "New")
  return { listing, shots }
}

const keys = { WEB_EXT_API_KEY: "user:1:2", WEB_EXT_API_SECRET: "s3cret" }

afterEach(() => vi.unstubAllGlobals())

describe("runPush", () => {
  it("dry-runs anonymously, reports only real differences and sends nothing", async () => {
    const calls = stubFetch()
    const { listing, shots } = await fixture()
    const lines: string[] = []
    const requests = await runPush({
      inputs: {
        guid: "a@b.c",
        listingPath: listing,
        iconPath: null,
        screenshotsDir: shots,
      },
      only: ["listing", "previews"],
      apply: false,
      env: {},
      log: (line) => lines.push(line),
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.headers["Authorization"]).toBeUndefined()
    expect(lines).toContain("listing: summary differs")
    expect(lines).not.toContain("listing: description differs")
    expect(requests.map((request) => request.kind)).toEqual([
      "listing",
      "delete-preview",
      "delete-preview",
      "add-preview",
    ])
    expect(lines.join("\n")).toContain("JWT <redacted>")
  })

  it("reads the live listing with a JWT when keys are present", async () => {
    const calls = stubFetch()
    const { listing } = await fixture()
    await runPush({
      inputs: {
        guid: "a@b.c",
        listingPath: listing,
        iconPath: null,
        screenshotsDir: null,
      },
      only: ["listing"],
      apply: false,
      env: keys,
      log: () => undefined,
    })
    expect(calls[0]?.headers["Authorization"]).toMatch(/^JWT /)
  })

  it("applies the plan in order", async () => {
    const calls = stubFetch()
    const { listing, shots } = await fixture()
    await runPush({
      inputs: {
        guid: "a@b.c",
        listingPath: listing,
        iconPath: null,
        screenshotsDir: shots,
      },
      only: ["listing", "previews"],
      apply: true,
      env: keys,
      log: () => undefined,
    })
    expect(calls.map((call) => call.method)).toEqual([
      "GET",
      "PATCH",
      "DELETE",
      "DELETE",
      "POST",
    ])
    expect(calls.every((call) => call.headers["Authorization"])).toBe(true)
  })

  it("refuses --apply without keys, before touching the network", async () => {
    const calls = stubFetch()
    const { listing } = await fixture()
    await expect(
      runPush({
        inputs: {
          guid: "a@b.c",
          listingPath: listing,
          iconPath: null,
          screenshotsDir: null,
        },
        only: ["listing"],
        apply: true,
        env: {},
        log: () => undefined,
      }),
    ).rejects.toThrow(/WEB_EXT_API_KEY/)
    expect(calls).toHaveLength(0)
  })

  it("fails when the icon scope has no icon", async () => {
    stubFetch()
    await expect(
      runPush({
        inputs: {
          guid: "a@b.c",
          listingPath: null,
          iconPath: null,
          screenshotsDir: null,
        },
        only: ["icon"],
        apply: false,
        env: {},
        log: () => undefined,
      }),
    ).rejects.toThrow(/icon scope needs --icon/)
  })
})
