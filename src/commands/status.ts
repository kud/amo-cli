import { defineCommand } from "citty"
import { guarded } from "../lib/output.js"
import { fetchStatus, formatStatusReport } from "../lib/status.js"

export const status = defineCommand({
  meta: {
    name: "status",
    description: "Show an add-on's listing and latest version review status",
  },
  args: {
    guid: { type: "positional", description: "Add-on GUID", required: true },
    json: { type: "boolean", description: "Print JSON", default: false },
  },
  run: guarded(async ({ args }) => {
    const report = await fetchStatus(args.guid, process.env)
    const lines = args.json
      ? [JSON.stringify(report, null, 2)]
      : formatStatusReport(report)
    lines.forEach((line) => console.log(line))
  }),
})
