import type { ScriptProgressItem } from "@/services/progress";
import type { ScriptListItem } from "@/services/scripts/types";

function compareUpdatedAtDesc(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

export function pickRecentScriptCandidate(items: ScriptListItem[]) {
  if (items.length === 0) {
    return null;
  }

  return [...items].sort((left, right) => compareUpdatedAtDesc(left.updatedAt, right.updatedAt))[0] ?? null;
}

export function getScriptsLaunchPriority(item: ScriptProgressItem, canRecord: boolean) {
  if (item.takeCount === 0) {
    return 0;
  }

  if (!canRecord) {
    return 1;
  }

  if (item.improvementTrend === "up") {
    return 2;
  }

  if (item.improvementTrend === "down") {
    return 3;
  }

  return 4;
}

export function pickScriptsLaunchCandidate(items: ScriptProgressItem[], canRecord: boolean) {
  if (items.length === 0) {
    return null;
  }

  return (
    [...items].sort((left, right) => {
      const leftPriority = getScriptsLaunchPriority(left, canRecord);
      const rightPriority = getScriptsLaunchPriority(right, canRecord);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return compareUpdatedAtDesc(left.script.updatedAt, right.script.updatedAt);
    })[0] ?? null
  );
}

function getLatestTakeTimestamp(item: ScriptProgressItem) {
  return item.latestTake?.reviewedAt ?? item.latestTake?.createdAt ?? "";
}

export function pickLatestReviewedScriptCandidate(items: ScriptProgressItem[]) {
  const reviewedItems = items.filter((item) => item.latestTake);

  if (reviewedItems.length === 0) {
    return null;
  }

  return (
    [...reviewedItems].sort((left, right) => {
      const leftTimestamp = getLatestTakeTimestamp(left);
      const rightTimestamp = getLatestTakeTimestamp(right);

      if (leftTimestamp !== rightTimestamp) {
        return compareUpdatedAtDesc(leftTimestamp, rightTimestamp);
      }

      return compareUpdatedAtDesc(left.script.updatedAt, right.script.updatedAt);
    })[0] ?? null
  );
}
