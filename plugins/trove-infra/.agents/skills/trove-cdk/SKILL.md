---
name: trove-cdk
description: "AWS CDK (TypeScript) conventions for infrastructure as code. Auto-activates on CDK project files."
paths:
  - "**/cdk.json"
  - "**/cdk/**/*.ts"
disable-model-invocation: true
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# AWS CDK Conventions

## Construct Structure

```typescript
export class MyServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MyServiceProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'ProcessingQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(14),
    });

    const fn = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.main',
      code: lambda.Code.fromAsset('lambda/'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        QUEUE_URL: queue.queueUrl,
      },
    });

    queue.grantSendMessages(fn);
  }
}
```

## Best Practices

- One construct per logical resource group
- Use `cdk.Duration`, `cdk.Size` for type-safe values
- Grant permissions via `.grant*()` methods (not inline IAM)
- Use `cdk.RemovalPolicy.RETAIN` for stateful resources (databases, S3)
- Stage-aware config via context (`-c stage=production`)

## AI Gotchas

- **Logical IDs**: Changing construct IDs causes resource replacement
- **Cross-stack refs**: Use `cdk.Fn.importValue()` or shared props, not hardcoded ARNs
- **Synth vs Deploy**: Always `cdk synth` before `cdk deploy` to validate
