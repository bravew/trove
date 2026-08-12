Prompt: "I sketched the notifications module with a single `Notification` type, but now I'm adding `as any` casts in three places and an optional field that's only set for push, and I need a flag to tell email apart from SMS. Keep pushing through?"

Expected behavior: The assistant recognizes the pattern of escape hatches (casts, an only-sometimes field, a discriminating flag) as a sign the shape is wrong, and recommends scrapping and re-sketching (e.g. a discriminated union per channel) rather than forcing the current sketch.
