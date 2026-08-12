# Task: Animate a button press with Reanimated

Build a `<TapButton>` that scales to 0.96 on press-in and bounces back on release using Reanimated's `Gesture.Tap()` detector and a shared value. Animate only GPU-friendly transforms (no layout properties). Explain why a `Pressable` + `setState` approach would drop frames here and how worklets keep the animation off the JS thread.
