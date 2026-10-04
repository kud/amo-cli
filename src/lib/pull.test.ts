import { sameDescription } from "@kud/amo"
import type { AmoAddon } from "@kud/amo"
import { describe, it, expect } from "vitest"
import { htmlToMarkdown } from "./html-to-markdown.js"
import { addonToListing } from "./pull.js"

const PROXY =
  "https://prod.outgoing.prod.webservices.mozgcp.net/v1/0123456789abcdef"

const liveHtml = [
  "<strong>How it works</strong>",
  "<br />",
  "Press the shortcut &amp; pick a tab with <em>any</em> <code>about:</code> page.",
  "<ul><li>Fuzzy search</li><li>Jump to the <strong>last used</strong> tab</li></ul>",
  `Source: <a href="${PROXY}/https%3A//github.com/acme/widget">acme/widget</a> and <a href="${PROXY}/https%3A//acme.example/docs">acme.example/docs</a>`,
].join("\n")

describe("htmlToMarkdown", () => {
  it("turns AMO's rendered HTML back into Markdown", () => {
    expect(htmlToMarkdown(liveHtml)).toBe(
      [
        "**How it works**",
        "",
        "Press the shortcut & pick a tab with *any* `about:` page.",
        "",
        "- Fuzzy search",
        "- Jump to the **last used** tab",
        "",
        "Source: [acme/widget](https://github.com/acme/widget) and https://acme.example/docs",
      ].join("\n"),
    )
  })

  it("round-trips: the pulled Markdown compares equal to the live HTML", () => {
    expect(sameDescription(htmlToMarkdown(liveHtml), liveHtml)).toBe(true)
  })
})

describe("addonToListing", () => {
  const addon = {
    id: 1,
    guid: "a@b.c",
    slug: "widget",
    name: { "en-US": "Widget" },
    summary: { "en-US": "Do the thing" },
    description: { "en-US": liveHtml },
    homepage: { url: { "en-US": "https://acme.example" }, outgoing: "x" },
    support_email: null,
    support_url: { url: { "en-US": null }, outgoing: null },
    categories: { firefox: ["tabs", "search-tools"] },
    tags: ["tabs"],
  } as unknown as AmoAddon

  it("builds a push-ready listing with localised text and slug lists", () => {
    const listing = addonToListing(addon)
    expect(listing).toMatchObject({
      name: { "en-US": "Widget" },
      summary: { "en-US": "Do the thing" },
      homepage: { "en-US": "https://acme.example" },
      categories: ["search-tools", "tabs"],
      tags: ["tabs"],
    })
    expect(listing).not.toHaveProperty("support_email")
    expect(listing).not.toHaveProperty("support_url")
  })
})
