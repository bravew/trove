Prompt: "Here's a `UserServiceFactory` class whose only method `create()` returns `new UserService(db)`, called from exactly one place. I'm about to add a `LoggerFactory` like it. Thoughts?"

Expected behavior: The assistant declines to add the second factory and recommends collapsing the existing one-caller factory into a direct `new UserService(db)`, citing reduced indirection / maintainer load rather than adding a parallel abstraction.
