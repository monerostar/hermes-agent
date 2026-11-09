import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { $todosBySession, clearSessionTodos, restoreSessionTodosFromSnapshot } from '@/store/todos'

import { ComposerStatusStack } from './index'

const noop = () => {}

const snapshot = {
  revision: 2,
  todos: [
    { content: 'Locked in', id: 'one', status: 'completed' },
    { content: 'Still open', id: 'two', status: 'in_progress' }
  ]
}

const stack = () => (
  <MemoryRouter>
    <ComposerStatusStack queue={<div data-testid="queue" />} sessionId="owner" />
  </MemoryRouter>
)

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  $todosBySession.set({})
  clearSessionTodos('owner')
  window.localStorage.clear()
  vi.useRealTimers()
})

it('offers a Dismiss control on the retained checklist', () => {
  restoreSessionTodosFromSnapshot('owner', snapshot, false)
  render(stack())

  expect(screen.getByRole('button', { name: /Previous tasks 1\/2/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
})

it('clears the checklist on Dismiss and keeps it gone when the same snapshot rehydrates', () => {
  restoreSessionTodosFromSnapshot('owner', snapshot, false)
  render(stack())

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

  expect(screen.queryByRole('button', { name: /Previous tasks/ })).toBeNull()

  // The exact #127429 loop: history is re-read and the settled snapshot is
  // re-derived. A per-load clear came back on the next reopen; this must not.
  act(() => {
    clearSessionTodos('owner')
    restoreSessionTodosFromSnapshot('owner', snapshot, false)
  })

  expect(screen.queryByRole('button', { name: /Previous tasks/ })).toBeNull()
})

it('re-arms the retained checklist for a newer revision', () => {
  restoreSessionTodosFromSnapshot('owner', snapshot, false)
  render(stack())

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

  act(() => {
    clearSessionTodos('owner')
    restoreSessionTodosFromSnapshot(
      'owner',
      {
        revision: 5,
        todos: [
          { content: 'Locked in', id: 'one', status: 'completed' },
          { content: 'New work', id: 'three', status: 'in_progress' }
        ]
      },
      false
    )
  })

  expect(screen.getByRole('button', { name: /Previous tasks 1\/2/ })).toBeTruthy()
})
