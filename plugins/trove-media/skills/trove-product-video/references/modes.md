# Production modes

Choose the mode from the user's request after a minimal, read-only inspection. The inspection gathers just enough evidence to recommend a path. Check the product's entry points, routes, primary interactions, visible styling tokens, and the safety of any data already described. Do not start the app or capture screens yet.

If the user has already named a mode, use it. Do not ask them to pick again. Ask about a choice only if neither the request nor repository evidence resolves it and the choice changes what will be made.

## Template adaptation

Choose this when the user names the video-shotcraft template, requests its film structure, or asks to adapt its effect. Find the user's checkout from a path they supplied or an existing local checkout they identify. Do not silently clone it, install packages, or fetch media.

Read `template/TEMPLATE.md` and `template/THEMES.md` inside that checkout. The template route changes product content and capture inputs while preserving the template's existing structure and component design. Select one of its supported themes through Remotion `--props`, with a JSON object such as `{"theme":"coral-burst","colors":{"surface":"#e1ecff","accent":"#2459ad"}}`. The optional palette accepts its known color keys, including `page`, `surface`, `field`, `text`, `muted`, `accent`, and `border`. Keep props and code aligned with the checkout's actual composition. Theme choice does not authorize editing the user's checkout. If the checkout is missing, explain the limitation and ask whether to use a different route or for the user to provide the path.

## Autonomous creation

Choose this when the user authorizes the agent to make creative decisions. Infer a visual direction from the product and purpose, then record the reason for each consequential choice. Do not pause for approval at every step. Report assumptions and unresolved constraints with the storyboard and final handoff.

## Guided co-creation

Choose this when the user wants to shape the visual direction or storyboard. Present a small set of evidence-based directions, then ask for a decision before building the styleframe. Ask only questions that the project and request cannot answer. After direction is set, map the main product features to shots and present the storyboard for confirmation before capture and implementation.

## Shared boundaries

All modes use real product screenshots, extract the product's visual tokens, protect sensitive data, and follow deterministic render rules. A single-shot request may use the same protections and may skip full-promo stages that do not apply. A general video question, ordinary editing request, or unrelated task does not activate this production workflow.
