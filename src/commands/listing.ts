import { createAmoClient, getPublicAddon } from "@kud/amo"
import { defineCommand } from "citty"
import { writeFile } from "node:fs/promises"
import { readCredentials } from "../lib/credentials.js"
import { parseOnly, resolvePushInputs } from "../lib/inputs.js"
import { guarded } from "../lib/output.js"
import { addonToListing } from "../lib/pull.js"
import { runPush } from "../lib/push.js"

const pull = defineCommand({
  meta: {
    name: "pull",
    description: "Download the live listing as a listing file",
  },
  args: {
    guid: { type: "positional", description: "Add-on GUID", required: true },
    out: {
      type: "string",
      description: "Write the listing to this file instead of stdout",
    },
  },
  run: guarded(async ({ args }) => {
    const keys = readCredentials(process.env)
    const addon = keys
      ? await createAmoClient(keys).getAddon(args.guid)
      : await getPublicAddon(args.guid)
    const json = `${JSON.stringify(addonToListing(addon), null, 2)}\n`
    if (!args.out) return void process.stdout.write(json)
    await writeFile(args.out, json)
    console.log(`wrote ${args.out}`)
  }),
})

const push = defineCommand({
  meta: {
    name: "push",
    description:
      "Compare a listing file, icon and screenshots with AMO and send the differences (dry run unless --apply)",
  },
  args: {
    listing: { type: "string", description: "Listing JSON file (AMO_LISTING)" },
    guid: { type: "string", description: "Add-on GUID (AMO_GUID)" },
    icon: { type: "string", description: "128x128 icon PNG (AMO_ICON)" },
    screenshots: {
      type: "string",
      description: "Screenshots directory (AMO_SCREENSHOTS)",
    },
    only: {
      type: "string",
      description:
        "Restrict to listing, icon and/or previews (comma-separated)",
    },
    apply: {
      type: "boolean",
      description: "Send the changes to AMO",
      default: false,
    },
    force: {
      type: "boolean",
      description:
        "Replace every preview even when they look in sync with the recorded state",
      default: false,
    },
  },
  run: guarded(async ({ args }) => {
    const only = parseOnly(args.only)
    const inputs = resolvePushInputs(args, process.env, only)
    await runPush({
      inputs,
      only,
      apply: args.apply,
      force: args.force,
      env: process.env,
      log: console.log,
    })
  }),
})

export const listing = defineCommand({
  meta: { name: "listing", description: "Pull or push an add-on listing" },
  subCommands: { pull, push },
})
