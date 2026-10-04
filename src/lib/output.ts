import { isAmoError } from "@kud/amo"
import { redactSecrets } from "@kud/amo"

export const messageOf = (error: unknown): string =>
  isAmoError(error) || error instanceof Error ? error.message : String(error)

export const fail = (error: unknown): never => {
  const text = redactSecrets(`amo: ${messageOf(error)}`, [
    process.env["WEB_EXT_API_SECRET"],
  ])
  process.stderr.write(`${text}\n`)
  process.exit(1)
}

export const guarded =
  <Args>(run: (args: Args) => Promise<void>) =>
  async (args: Args): Promise<void> => {
    try {
      await run(args)
    } catch (error) {
      fail(error)
    }
  }
