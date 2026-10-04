#!/usr/bin/env node
import { defineCommand, runMain } from "citty"
import { listing } from "./commands/listing.js"
import { screenshots } from "./commands/screenshots.js"
import { status } from "./commands/status.js"

const NAME = "amo"
const subCommands = { status, listing, screenshots }

runMain(
  defineCommand({
    meta: {
      name: NAME,
      description:
        "Sync an add-on's listing, icon and screenshots with addons.mozilla.org, and check its review status",
    },
    subCommands,
    run: ({ rawArgs }) => {
      if (rawArgs.some((arg) => arg in subCommands)) return
      console.log(
        `Usage: ${NAME} <command>\nRun \`${NAME} --help\` to list commands.`,
      )
    },
  }),
)
