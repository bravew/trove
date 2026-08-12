# Task: Replace a slow image gallery

A photo gallery uses `<Image>` from React Native and stores the active scroll position in component state, causing re-renders on every scroll frame. Migrate to `expo-image` with appropriate `cachePolicy` and `contentFit`, and move the scroll position to a ref or shared value. Justify each platform-API choice over a JS-only equivalent.
