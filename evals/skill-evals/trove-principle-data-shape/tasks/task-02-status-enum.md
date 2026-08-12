Prompt: "The job record currently has `started: bool` and `finished: bool`. I need to add 'retrying' and 'cancelled'. I'll just add two more booleans."

Expected behavior: The assistant recommends replacing the boolean flags with a single status field / state enum before adding cases, recognizing the structural choice now prevents contradictory combinations and a later rewrite.
