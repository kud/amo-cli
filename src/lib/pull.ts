import { categorySlugs, localizedEnUs } from "@kud/amo"
import type { AmoAddon, Listing, LocalizedText } from "@kud/amo"
import { htmlToMarkdown } from "./html-to-markdown.js"

const TEXT_FIELDS = [
  "name",
  "summary",
  "homepage",
  "support_email",
  "support_url",
] as const

const localized = (text: string): LocalizedText => ({ "en-US": text })

export const addonToListing = (addon: AmoAddon): Listing => {
  const description = localizedEnUs(addon.description)
  const plainFields = Object.fromEntries(
    TEXT_FIELDS.flatMap((field) => {
      const text = localizedEnUs(addon[field])
      return text ? [[field, localized(text)]] : []
    }),
  )
  return {
    ...plainFields,
    ...(description
      ? { description: localized(htmlToMarkdown(description)) }
      : {}),
    categories: categorySlugs(addon.categories),
    tags: addon.tags ?? [],
  }
}
