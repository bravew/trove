# Task: Create a Zustand store for chat UI state

Create a Zustand store for a chat interface that:
1. Manages current thread ID, message list, and input draft
2. Supports adding messages (optimistic), removing messages, and clearing thread
3. Persists the current thread ID to localStorage
4. Uses TypeScript with proper action types
5. Follows the slice pattern for organizing related state

Messages live on the server in this fictional app. `GET /api/threads/:id/messages` returns `{ id: string; body: string; sentAt: string }[]`, and `POST /api/threads/:id/messages` with `{ body }` returns the saved message. Decide which of the state above belongs in the store and which belongs in the server cache, and wire both into a small `ChatPanel` made of a message list and a composer.
