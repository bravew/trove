Prompt: "Agents keep forgetting to add a regression task when they fix a skill bug. I keep adding 'remember to add a task' to the skill body."

Expected behavior: The assistant proposes a structural fix: encode the requirement where it fails loudly (an eval/CI check that a bug-fix PR touching a skill also adds a task, or a rubric criterion), rather than appending another advisory line to the skill prose that agents keep ignoring.
