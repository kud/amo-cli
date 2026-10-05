import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { readScreenshots } from "./screenshots.js"

const makeDir = async (files: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), "amo-shots-"))
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(join(dir, name), content),
    ),
  )
  return dir
}

describe("readScreenshots", () => {
  it("returns sorted images with optional captions from <name>.txt", async () => {
    const dir = await makeDir({
      "02-search.PNG": "x",
      "01-open.png": "x",
      "01-open.txt": "  Open the picker \n",
      "03-extra.jpeg": "x",
      "03-extra.txt": "   ",
      "notes.md": "ignore me",
    })
    const shots = await readScreenshots(dir)
    expect(shots.map(({ file, caption }) => ({ file, caption }))).toEqual([
      { file: "01-open.png", caption: "Open the picker" },
      { file: "02-search.PNG", caption: null },
      { file: "03-extra.jpeg", caption: null },
    ])
    expect(shots[0]?.path).toBe(join(dir, "01-open.png"))
    expect(shots[0]?.sha256).toBe(
      "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
    )
  })

  it("explains an unreadable directory", async () => {
    await expect(readScreenshots("/definitely/not/here")).rejects.toThrow(
      /cannot read screenshots dir/,
    )
  })
})
