# Task: Audit a module whose happy path is covered and error path is not

Audit test coverage for this module.

```python
# billing/refund.py
async def issue_refund(order_id: str, amount_cents: int, db) -> Refund:
    order = await db.get(Order, order_id)
    if order is None:
        raise OrderNotFound(order_id)
    if amount_cents > order.total_cents - order.refunded_cents:
        raise RefundExceedsBalance(order_id)
    refund = await gateway.refund(order.payment_id, amount_cents)
    order.refunded_cents += amount_cents
    await db.commit()
    return refund
```

```python
# tests/test_refund.py
async def test_issue_refund_succeeds(db, order):
    refund = await issue_refund(order.id, 500, db)
    assert refund.status == "succeeded"
```

Expected: both raise paths and the gateway-failure-after-mutation case are
reported as gaps with `path:line` evidence and severity. The partial-failure
case (gateway succeeds, commit fails) should rank highest.
