import { createHash } from "node:crypto"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
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
      "PATCH",
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

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

const shotsOnly = (shots: string) => ({
  inputs: {
    guid: "a@b.c",
    listingPath: null,
    iconPath: null,
    screenshotsDir: shots,
  },
  only: ["previews" as const],
})

describe("runPush output", () => {
  it("prints every planned line once, as a single string", async () => {
    stubFetch()
    const { listing, shots } = await fixture()
    const printed = vi.spyOn(console, "log").mockImplementation(() => undefined)
    try {
      await runPush({
        inputs: {
          guid: "a@b.c",
          listingPath: listing,
          iconPath: null,
          screenshotsDir: shots,
        },
        only: ["listing", "previews"],
        apply: false,
        env: {},
        log: console.log,
      })
      expect(printed.mock.calls.every((args) => args.length === 1)).toBe(true)
      const lines = printed.mock.calls.map(([line]) => String(line))
      const planned = lines.slice(lines.indexOf("planned requests:") + 1)
      expect(planned).toEqual([
        "  PATCH https://addons.mozilla.org/api/v5/addons/addon/a@b.c/",
        "    Authorization: JWT <redacted>",
        '    body: {"summary":{"en-US":"Do another thing"}}',
        "  DELETE https://addons.mozilla.org/api/v5/addons/addon/a@b.c/previews/11/",
        "    Authorization: JWT <redacted>",
        "  DELETE https://addons.mozilla.org/api/v5/addons/addon/a@b.c/previews/12/",
        "    Authorization: JWT <redacted>",
        "  POST https://addons.mozilla.org/api/v5/addons/addon/a@b.c/previews/",
        "    Authorization: JWT <redacted>",
        "    multipart: image=01.png position=0",
        "  then PATCH https://addons.mozilla.org/api/v5/addons/addon/a@b.c/previews/<new id>/",
        '    body: {"caption":{"en-US":"New"}}',
      ])
    } finally {
      printed.mockRestore()
    }
  })
})

describe("runPush preview state", () => {
  it("replaces previews when there is no state, and a dry run writes none", async () => {
    stubFetch()
    const { shots } = await fixture()
    const lines: string[] = []
    const requests = await runPush({
      ...shotsOnly(shots),
      apply: false,
      env: {},
      log: (line) => lines.push(line),
    })
    expect(lines).toContain(
      "previews: no .amo-previews.json yet, replacing all",
    )
    expect(requests.map((request) => request.kind)).toEqual([
      "delete-preview",
      "delete-preview",
      "add-preview",
    ])
    await expect(stat(join(shots, ".amo-previews.json"))).rejects.toThrow()
  })

  it("records the uploaded ids, hashes and captions after --apply", async () => {
    stubFetch()
    const { shots } = await fixture()
    await runPush({
      ...shotsOnly(shots),
      apply: true,
      env: keys,
      log: () => undefined,
    })
    const state = JSON.parse(
      await readFile(join(shots, ".amo-previews.json"), "utf8"),
    )
    expect(state).toEqual({
      version: 1,
      previews: [
        { id: 1, file: "01.png", sha256: sha256("png"), caption: "New" },
      ],
    })
  })

  const writeState = (shots: string, sha: string) =>
    writeFile(
      join(shots, ".amo-previews.json"),
      JSON.stringify({
        version: 1,
        previews: [
          { id: 11, file: "01.png", sha256: sha, caption: "Old" },
          { id: 12, file: "02.png", sha256: sha256("second"), caption: null },
        ],
      }),
    )

  const matchingShots = async () => {
    const { shots } = await fixture()
    await writeFile(join(shots, "01.txt"), "Old")
    await writeFile(join(shots, "02.png"), "second")
    return shots
  }

  it("is in sync when the state matches AMO and the local files", async () => {
    stubFetch()
    const shots = await matchingShots()
    await writeState(shots, sha256("png"))
    const lines: string[] = []
    const requests = await runPush({
      ...shotsOnly(shots),
      apply: false,
      env: {},
      log: (line) => lines.push(line),
    })
    expect(lines).toContain("previews: in sync (2)")
    expect(requests).toEqual([])
  })

  it("replaces previews when an image changed but its caption did not", async () => {
    stubFetch()
    const shots = await matchingShots()
    await writeState(shots, sha256("an older png"))
    const lines: string[] = []
    const requests = await runPush({
      ...shotsOnly(shots),
      apply: false,
      env: {},
      log: (line) => lines.push(line),
    })
    expect(lines).toContain(
      "previews: local screenshots changed, replacing all",
    )
    expect(requests.map((request) => request.kind)).toEqual([
      "delete-preview",
      "delete-preview",
      "add-preview",
      "add-preview",
    ])
  })

  it("replaces previews when forced", async () => {
    stubFetch()
    const shots = await matchingShots()
    await writeState(shots, sha256("png"))
    const lines: string[] = []
    const requests = await runPush({
      ...shotsOnly(shots),
      apply: false,
      force: true,
      env: {},
      log: (line) => lines.push(line),
    })
    expect(lines).toContain("previews: --force, replacing all")
    expect(requests).toHaveLength(4)
  })

  it("ignores a malformed state file", async () => {
    stubFetch()
    const shots = await matchingShots()
    await writeFile(join(shots, ".amo-previews.json"), "{nope")
    const lines: string[] = []
    await runPush({
      ...shotsOnly(shots),
      apply: false,
      env: {},
      log: (line) => lines.push(line),
    })
    expect(lines.some((line) => line.startsWith("previews: ignoring"))).toBe(
      true,
    )
  })
})
