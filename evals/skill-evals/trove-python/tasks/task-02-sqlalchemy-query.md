# Task: Write an async SQLAlchemy database query service

Create a service function that:
1. Takes a database async session and a list of user IDs
2. Fetches all posts by those users created in the last 7 days
3. Returns them grouped by user ID with post count
4. Uses proper SQLAlchemy async patterns (select, scalars, etc.)
5. Handles the case where the user list is empty

Use SQLAlchemy 2.x async patterns with proper type hints.
