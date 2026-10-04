import { defineCommand } from "citty"
import { resolvePushInputs } from "../lib/inputs.js"
import { guarded } from "../lib/output.js"
import { runPush } from "../lib/push.js"

const sync = defineCommand({
  meta: {
    name: "sync",
    description:
      "Make AMO's screenshots match a directory (dry run unless --apply)",
  },
  args: {
    guid: { type: "string", description: "Add-on GUID (AMO_GUID)" },
    screenshots: {
      type: "string",
      description: "Screenshots directory (AMO_SCREENSHOTS)",
    },
    apply: {
      type: "boolean",
      description: "Send the changes to AMO",
      default: false,
    },
  },
  run: guarded(async ({ args }) => {
    const only = ["previews" as const]
    const inputs = resolvePushInputs(args, process.env, only)
    if (!inputs.screenshotsDir) {
      throw new Error(
        "missing screenshots dir (--screenshots or AMO_SCREENSHOTS)",
      )
    }
    await runPush({
      inputs,
      only,
      apply: args.apply,
      env: process.env,
      log: console.log,
    })
  }),
})

export const screenshots = defineCommand({
  meta: { name: "screenshots", description: "Manage an add-on's screenshots" },
  subCommands: { sync },
})
