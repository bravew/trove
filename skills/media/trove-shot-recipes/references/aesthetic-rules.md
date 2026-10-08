# Aesthetic rules

These rules hold without the card library. Use them when no card is named, when
the library is unavailable, or when a named card leaves a choice the card does
not settle. They describe motion direction and legibility, not card-specific
timing. A named card and its demo still outrank them for that shot.

## Pacing

Pace slower than your first instinct. Nearly every review of a first cut asks
for a longer hold or a slower move. Almost none ask for more speed.

Give a subject action a full arc and three seconds to complete it when it
carries the opening. Let a viewer follow a simulated interaction, such as
typing or filtering, at the speed a person would actually do it. Reserve hold
and rest frames in the timeline budget.

Stop motion after information lands. When a wordmark, a figure, or a full grid
settles, hold it still for at least one second before the cut. Spend the clear
pause on the point you want remembered rather than on filler.

## Movement

Speed reads as acceleration, not as a fast constant. A linear move at a steady
rate looks mechanical. Use easing and staggered arrival so a group of elements
speeds up as it enters.

Stagger a batch so items do not move as one block. When a large set enters,
have it accelerate and settle, then hold briefly before the next beat.

End a fly-in on a real position in the layout. An element that stops floating
above the page reads as fake. Let it seat into the slot, the row, or the
scrolling flow it belongs to.

## Restraint

Give the opening one subject. A single element completing a full action arc
holds attention better than several moving at once.

Keep full-frame impacts scarce. A whole-frame pulse, shake, flash, or invert
belongs to a small budget across the whole video. Most beat movement should sit
on the subject or graphic layer, not on the camera. `trove-beat-sync` owns the
exact budget and the mapping to measured hits.

Do not broadcast decorative effects. A glint or a sweep is stronger given once
to a hero element than repeated across every item. Crop any light effect to the
element's rounded edge, because light spilling past a corner reads as cheap.

## Camera

Keep the camera steady by default. Product footage of a bright interface does
not want handheld shake. Reserve tiny camera noise for a dark, atmospheric
piece, and check rendered frames to confirm the motion is intentional.

Let the camera serve readability. Information-dense shots, such as lists and
stacks, read best face on. A card close-up that carries text reads best from a
level side angle. Choose a tilted or stylized angle per shot and justify it,
rather than applying one camera style across the whole video.

## Legibility

Size text by final pixels, not by `fontSize`. On a 1080p frame, a caption that
must be read should clear roughly 56 pixels of effective height, about five
percent of the frame, and supporting text such as a subtitle or a URL should
clear roughly 32 pixels. Effective height accounts for every ancestor scale and
for perspective compression on a tilted 3D shot.

Text has two jobs. It is either texture, meaning small decorative type that
should be softly blurred or dimmed so a viewer does not try to read it, or it
is meant to be read, meaning it clears the size floor and holds enough contrast
against its background. There is no useful middle state where text is rearranged but still cannot be read. When in doubt, cut the text.

Check a frame the way a viewer meets it. Scale a caption shot down to roughly
480 pixels wide and confirm every sentence still reads. The closing URL or call
to action is the last line to make small.
