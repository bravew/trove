# Task: TanStack mutation with optimistic update

Write a `useUpdateUser` TanStack Query mutation hook that updates `/api/users/:id`. On mutate, optimistically update the user-detail query cache; on error, roll back. Show the consumer using it.
