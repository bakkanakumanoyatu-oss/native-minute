import { execFileSync } from "node:child_process";
import { realpathSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const canonical = "/Users/karasawatakahiro/Developer/native-minute";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (existsSync("/Users/karasawatakahiro/Desktop/native-minute") ||
    realpathSync(resolve(git("rev-parse", "--git-common-dir"))) !== realpathSync(`${canonical}/.git`) ||
    realpathSync(process.cwd()) !== realpathSync(git("rev-parse", "--show-toplevel")) ||
    git("branch", "--show-current") !== "codex/cutover/production-provider-readonly-probe-20261001") {
  throw new Error("Dedicated probe workspace guard failed");
}
git("merge-base", "--is-ancestor", "fcd8b248b810b5e36966c46aa24ff0af175e8edd", "HEAD");
console.log("PASS: isolated probe worktree belongs to the approved Developer repository");
