Prompt: "This list render is slow. I'm pretty sure it's the sort, so I'll memoize the comparator. Sound good?"

Expected behavior: The assistant declines to optimize the assumed cause without evidence and recommends profiling first; the slowdown is often elsewhere (re-renders, layout, an N+1) than the eye-catching sort. It measures, then fixes what the measurement shows.
