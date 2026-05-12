export function getScriptListenPath(scriptId: string) {
  return `/scripts/${scriptId}/listen`;
}

export function getScriptRecordPath(scriptId: string) {
  return `/scripts/${scriptId}/record`;
}

export function getScriptReviewPath(scriptId: string, takeId: string) {
  return `/scripts/${scriptId}/review/${takeId}`;
}

export function getDuplicateScriptPath(scriptId: string) {
  return `/scripts/new?from=${scriptId}`;
}
