import { Composition } from "remotion";
import { Edit, editSchema, type EditProps } from "./Edit";

const MODES = {
  shorts: { width: 1080, height: 1920 },
  intro: { width: 1920, height: 1080 },
  longform: { width: 1920, height: 1080 },
};

export const Root = () => {
  return (
    <Composition
      id="Edit"
      component={Edit}
      schema={editSchema}
      defaultProps={{
        plan: { source: "", mode: "intro", beats: [] },
        durationInSeconds: 1,
        fps: 30,
      } satisfies EditProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInSeconds * props.fps)),
        fps: props.fps,
        ...MODES[props.plan.mode],
      })}
    />
  );
};
