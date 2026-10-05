import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { extname, join } from "node:path"

export type Screenshot = {
  file: string
  caption: string | null
  path: string
  sha256: string
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"])

const isImage = (name: string) =>
  IMAGE_EXTENSIONS.has(extname(name).toLowerCase())

const hashFile = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const readCaption = async (dir: string, file: string) => {
  const stem = file.slice(0, file.length - extname(file).length)
  const text = await readFile(join(dir, `${stem}.txt`), "utf8").catch(() => "")
  return text.trim() || null
}

export const readScreenshots = async (dir: string): Promise<Screenshot[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: unknown) => {
      throw new Error(
        `cannot read screenshots dir ${dir}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    },
  )
  const files = entries
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => entry.name)
    .sort()
  return Promise.all(
    files.map(async (file) => ({
      file,
      caption: await readCaption(dir, file),
      path: join(dir, file),
      sha256: await hashFile(join(dir, file)),
    })),
  )
}
