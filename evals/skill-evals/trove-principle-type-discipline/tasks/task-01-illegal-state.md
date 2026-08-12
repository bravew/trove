Prompt: "Our API response type is `{ loading: boolean; data?: Result; error?: string }`. Callers keep hitting cases where data and error are both set. How should I type it?"

Expected behavior: The assistant models the response as a discriminated union (loading | success-with-data | error-with-message) so the both-set and neither-set states cannot be represented, rather than adding runtime guards over the loose shape.
