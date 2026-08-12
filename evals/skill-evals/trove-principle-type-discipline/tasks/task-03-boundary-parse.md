Prompt: "A webhook handler receives a JSON body and we pass it straight into our domain logic typed as `any`. It works. Leave it?"

Expected behavior: The assistant recommends parsing the webhook body at the boundary into a validated domain type (schema parse, `unknown` → typed), so downstream logic trusts the type rather than carrying `any` inward where bad data fails far from the source.
