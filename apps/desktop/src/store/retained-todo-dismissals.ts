import { readJson, writeJson } from '@/lib/storage'

/**
 * Durable dismissals for the composer's retained "Previous tasks" checklist.
 *
 * A settled todo list is parked in `$retainedTodosBySession` and re-derived on
 * every rehydration from the immutable `todo_list` tool result in stored
 * history, so clearing the in-memory map only hides the list until the next
 * reload or roster refresh (#127429). A dismissal is therefore bound to the
 * todo revision the user dismissed: that revision stays hidden for good, and a
 * strictly newer revision — the agent writing the plan again — re-arms the
 * section, because a fresh list is new information, not the old one returning.
 *
 * Keys are durable session identities (the lineage aliases a runtime's list
 * projects to, see `lineageAliases`), never runtime ids, which are remount-
 * scoped and would forget the dismissal on the next activation. Shape follows
 * the two existing persisted-ack families: `stale-aux-dismissal.ts`
 * (fingerprint-bound acknowledgement) and `preview-status.ts` dismissals
 * (capped, best-effort, storage-authoritative read).
 */
const DISMISSED_RETAINED_KEY = 'hermes.desktop.retainedTodoDismissals.v1'
const MAX_DISMISSED_SESSIONS = 256
const MAX_ID_LENGTH = 4096

type DismissedRevisions = Record<string, number>

function readDismissals(): DismissedRevisions {
  const value = readJson<unknown>(DISMISSED_RETAINED_KEY)

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const valid = Object.entries(value).filter(
    ([id, revision]) =>
      id.length > 0 &&
      id.length <= MAX_ID_LENGTH &&
      typeof revision === 'number' &&
      Number.isFinite(revision) &&
      revision >= 0
  )

  return Object.fromEntries(valid.slice(-MAX_DISMISSED_SESSIONS))
}

/** The newest revision the user dismissed for any of this session's durable
 *  ids, or `null` when nothing has been dismissed. `null` keeps the fallback
 *  open: a reader that cannot resolve durable ids must not invent a dismissal. */
export function dismissedRetainedRevision(scopeIds: readonly string[]): number | null {
  if (scopeIds.length === 0) {
    return null
  }

  const dismissed = readDismissals()
  let newest: number | null = null

  for (const id of scopeIds) {
    const revision = dismissed[id]

    if (typeof revision === 'number' && (newest === null || revision > newest)) {
      newest = revision
    }
  }

  return newest
}

/** Record `revision` as dismissed for every durable id of the session. Writing
 *  the whole alias set is what makes the dismissal survive compression and
 *  branching, where the surface holding the list changes identity. */
export function rememberRetainedDismissal(scopeIds: readonly string[], revision: number): void {
  if (scopeIds.length === 0 || !(revision >= 0)) {
    return
  }

  const dismissed = readDismissals()

  for (const id of scopeIds) {
    if (id.length > 0 && id.length <= MAX_ID_LENGTH) {
      dismissed[id] = revision
    }
  }

  const entries = Object.entries(dismissed)

  writeJson(DISMISSED_RETAINED_KEY, Object.fromEntries(entries.slice(-MAX_DISMISSED_SESSIONS)))
}
