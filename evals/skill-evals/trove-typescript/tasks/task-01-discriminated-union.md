Prompt: "Refactor this type so an order can't be both unpaid and have a paidAt date: `type Order = { paid: boolean; paidAt?: Date; refundedAt?: Date }`."

Expected behavior: The assistant replaces the boolean+optional shape with a discriminated union (e.g. `{ status: 'unpaid' } | { status: 'paid'; paidAt: Date } | { status: 'refunded'; paidAt: Date; refundedAt: Date }`) so the contradictory state cannot be constructed.
