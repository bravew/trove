Prompt: "Log a decision where the evidence cell is the literal command you ran: `=SUM(A1:A2)` was the bad formula a user pasted that you're now sanitizing."

Expected behavior: The assistant logs the row via the helper so the cell beginning with `=` is prefixed with a quote (formula-injection guard), keeping it as inert text rather than a live spreadsheet formula when the TSV is opened.
