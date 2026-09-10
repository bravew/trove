---
title: Install Native Dependencies in App Directory
impact: CRITICAL
impactDescription: required for autolinking to work
tags: monorepo, native, autolinking, installation
---

## Install Native Dependencies in App Directory

In a monorepo, packages with native code must be installed in the native app's
directory directly. Autolinking only scans the app's `node_modules`—it won't
find native dependencies installed in other packages.

**Incorrect (native dep in shared package only):**

```
packages/
  ui/
    package.json  # has react-native-reanimated
  app/
    package.json  # missing react-native-reanimated
```

Autolinking fails—native code not linked.

**Correct (native dep in app directory):**

```
packages/
  ui/
    package.json  # has react-native-reanimated
  app/
    package.json  # also has react-native-reanimated
```

```json
// packages/app/package.json
{
  "dependencies": {
    "react-native-reanimated": "4.0.0",
    "react-native-worklets": "0.4.0"
  }
}
```

Even if the shared package uses the native dependency, the app must also list it
for autolinking to detect and link the native code. Reanimated v4 split the
worklets runtime into the separate `react-native-worklets` package — both must
be installed in the app directory. Pin the pair rather than using caret ranges:
each Reanimated minor requires a matching Worklets minor, so a floating range
can resolve to an incompatible combination. Check Reanimated's compatibility
table for the pairing that matches your version.
