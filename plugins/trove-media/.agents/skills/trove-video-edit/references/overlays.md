# Overlays

Each beat in the plan is one of these. Pick the one that matches what the
speaker is doing at that moment, not the one that looks most interesting. A
moment with nothing to add gets no beat.

| Kind | Use it when | It needs |
|---|---|---|
| `caption` | The words should be readable with the sound off, and nothing else is on screen. | The phrase. |
| `title` | A section starts and the viewer needs to know where they are. | The section name. |
| `callout` | One term or claim deserves emphasis as it is said. | The term. |
| `stat` | A number is the point of the sentence. | The number and what it measures. |
| `quote` | A sentence should stay on screen longer than it takes to say. | The sentence. |
| `comparison` | The speaker sets two things against each other. | Both sides. |
| `list` | The speaker enumerates, and the items would be lost in prose. | The items, in spoken order. |
| `image` | A real thing is named and the user supplied a picture of it. | The file. |
| `zoom` | A moment is worth leaning in on. No text. | Nothing but the anchor. |

## Choosing less

- One idea at a time. A caption and a title on the same words fight each other.
  Drop the caption while another beat is up.
- An image only when the user supplied one. Never fetch stock, and never
  generate a picture to fill a gap. No picture is better than a picture of the
  wrong thing.
- A beat that could be the video's conclusion does not belong in the opening.
  The opening poses the question. The answer lands when the speaker gives it.
- Text sits in the lower third. Anything placed over the speaker's face fails
  the edit regardless of how good the wording is.

## Timing

`anchor` is the phrase the speaker is saying while the beat is visible, copied
from the transcript. The beat starts as that phrase starts and ends soon after
it ends. A beat the viewer cannot finish reading before it leaves is too short.
A beat still on screen after the speaker has moved on is too long.
