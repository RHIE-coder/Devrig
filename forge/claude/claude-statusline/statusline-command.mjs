#!/usr/bin/env node
// Cross-platform status line for Claude Code (macOS / Linux / Windows).
// Pure Node — no jq/bash dependency. Configured via:
//   "statusLine": { "type": "command", "command": "node ~/.claude/statusline-command.mjs" }
import { execSync } from "node:child_process";
import { basename } from "node:path";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let d = {};
  try {
    d = JSON.parse(input);
  } catch {
    /* no/garbled stdin — render nothing */
  }

  const R = "\x1b[0m";
  const has = (v) => v !== undefined && v !== null && v !== "";

  const model = d.model?.display_name || "";
  const version = d.version || "";
  const cwd = d.workspace?.current_dir || d.cwd || "";
  const effort = d.effort?.level || ""; // live session value from stdin
  const remaining = d.context_window?.remaining_percentage;
  const fiveHour = d.rate_limits?.five_hour?.used_percentage;
  const sevenDay = d.rate_limits?.seven_day?.used_percentage;

  // Git info (best-effort; silent on non-repos / missing git)
  const git = (args) => {
    try {
      return execSync(`git --no-optional-locks ${args}`, {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      return "";
    }
  };
  let branch = "";
  let count = 0;
  if (cwd) {
    branch = git("rev-parse --abbrev-ref HEAD");
    const porcelain = git("status --porcelain");
    count = porcelain ? porcelain.split("\n").filter((l) => l.length).length : 0;
  }

  const lines = [];

  // Line 1: dir + git branch + dirty count
  if (cwd) {
    let l = `\x1b[36m${basename(cwd)}${R}`;
    if (branch) l += ` \x1b[38;5;100m(${branch})${R}`;
    if (count) l += ` \x1b[33m[${count}]${R}`;
    lines.push(l);
  }

  // Line 2: model + version
  if (model) {
    let l = `\x1b[33m${model}${R}`;
    if (version) l += ` \x1b[38;5;100mv${version}${R}`;
    lines.push(l);
  }

  // Line 3: effort (violet)
  if (effort) lines.push(`\x1b[38;5;135meffort: ${effort}${R}`);

  // Line 4: context remaining
  if (has(remaining)) lines.push(`\x1b[38;5;100mctx: ${remaining}%${R}`);

  // Line 5: rate limits (fg by usage: <=30 green, <=70 yellow, else red)
  const fg = (v) => {
    const n = Math.round(v);
    return n <= 30 ? "\x1b[32m" : n <= 70 ? "\x1b[33m" : "\x1b[31m";
  };
  if (has(fiveHour) || has(sevenDay)) {
    let l = `\x1b[34mrate:${R}`;
    if (has(fiveHour))
      l += ` \x1b[44;97m 5h ${R}${fg(fiveHour)}${Math.round(fiveHour)}%${R}`;
    if (has(sevenDay))
      l += ` \x1b[45;97m 7d ${R}${fg(sevenDay)}${Math.round(sevenDay)}%${R}`;
    lines.push(l);
  }

  if (lines.length) process.stdout.write(lines.join("\n") + "\n");
});
