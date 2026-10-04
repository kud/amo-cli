import { normalizeText } from "@kud/amo"

const ANCHOR = /<a\b[^>]*?\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
const PRE = /<pre[^>]*>\s*(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi
const TAG = /<\/?[a-zA-Z][^>]*>/g

const bareUrl = (url: string) =>
  url.replace(/^https?:\/\//, "").replace(/\/+$/, "")

const anchorToMarkdown = (url: string, label: string): string => {
  const target = normalizeText(url).trim()
  const text = normalizeText(label.replace(TAG, "")).trim()
  return text === "" || bareUrl(text) === bareUrl(target)
    ? target
    : `[${text}](${target})`
}

export const htmlToMarkdown = (html: string): string =>
  normalizeText(
    html
      .replace(PRE, (_match, code: string) => `\n\n\`\`\`\n${code}\n\`\`\`\n\n`)
      .replace(ANCHOR, (_match, _quote, url: string, label: string) =>
        anchorToMarkdown(url, label),
      )
      .replace(/<\/?(?:strong|b)\b[^>]*>/gi, "**")
      .replace(/<\/?(?:em|i)\b[^>]*>/gi, "*")
      .replace(/<\/?code\b[^>]*>/gi, "`")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<blockquote\b[^>]*>/gi, "\n\n> ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|ul|ol|blockquote|h[1-6])>/gi, "\n\n")
      .replace(TAG, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
