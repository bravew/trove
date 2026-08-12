# Task: Create a custom hook for user profile data

Create a custom React hook `useUserProfile` that:
1. Fetches user profile data using TanStack Query
2. Handles loading, error, and success states
3. Provides a mutation to update the profile with optimistic updates
4. Invalidates related queries on successful mutation
5. Returns typed data with proper TypeScript generics
