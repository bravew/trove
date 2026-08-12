# Task: Accessible modal

Review this React modal component for a11y issues. List specific findings with file:line equivalents:

```tsx
export function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content">
        {children}
        <span className="close" onClick={onClose}>x</span>
      </div>
    </div>
  )
}
```
