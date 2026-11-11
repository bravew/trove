import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import type { Beat, EditPlan } from "./plan";

/** Remotion reads the composition's props off this schema. It mirrors EditProps. */
export const editSchema = z.object({
  plan: z.object({
    source: z.string(),
    mode: z.enum(["shorts", "intro", "longform"]),
    music: z.string().optional(),
    beats: z.array(z.object({
      kind: z.enum(["caption", "title", "callout", "stat", "quote", "comparison", "list", "image", "zoom"]),
      start: z.number(),
      end: z.number(),
      anchor: z.string(),
      reason: z.string(),
      text: z.string().optional(),
      asset: z.string().optional(),
    })),
  }),
  durationInSeconds: z.number(),
  fps: z.number(),
});

export interface EditProps {
  plan: EditPlan;
  durationInSeconds: number;
  fps: number;
}

/** The speaker sits under the overlays, so a zoom scales the picture without
 * cropping anything placed above it. */
const Speaker = ({ source, beats }: { source: string; beats: Beat[] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const zoomed = beats.some((beat) => beat.kind === "zoom" && time >= beat.start && time < beat.end);
  return (
    <AbsoluteFill style={{ transform: zoomed ? "scale(1.06)" : undefined }}>
      <OffthreadVideo src={staticFile(source)} />
    </AbsoluteFill>
  );
};

/** Overlays sit in the lower third. Check placement against the source preview. */
const Overlay = ({ beat }: { beat: Beat }) => {
  const { width, height } = useVideoConfig();
  const margin = Math.round(height * (height > width ? 0.2 : 0.08));
  if (beat.kind === "image") {
    if (!beat.asset) throw new Error("An image beat needs a local asset");
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: margin }}>
        <Img
          src={staticFile(beat.asset)}
          style={{ width: "100%", height: "30%", objectFit: "contain" }}
        />
      </AbsoluteFill>
    );
  }
  if (!beat.text) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: margin }}>
      <div style={{ color: "white", fontSize: 64, textAlign: "center", textShadow: "0 2px 16px black" }}>
        {beat.text}
      </div>
    </AbsoluteFill>
  );
};

export const Edit = ({ plan }: { plan: EditPlan }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Speaker source={plan.source} beats={plan.beats} />
      {plan.beats.filter((beat) => beat.kind !== "zoom").map((beat, index) => (
        <Sequence
          key={index}
          from={Math.round(beat.start * fps)}
          durationInFrames={Math.max(1, Math.round((beat.end - beat.start) * fps))}
        >
          <Overlay beat={beat} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
