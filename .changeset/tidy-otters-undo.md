---
'triiiceratops': minor
---

Annotation editor: undo/redo is back, and it is persistence-aware. The plugin now keeps a per-canvas operation stack and replays inverses **through the storage adapter** — undoing a create deletes it, undoing an update restores the previous copy, undoing a delete re-creates it — so what is on screen and what is in storage never disagree (the old Annotorious-backed buttons resurrected deleted annotations on reload). Undo of a server-reconciled create deletes the canonical id; a redo that mints a fresh id re-reconciles. A failed replay reports through the error surface and leaves the operation on the stack. History is capped at 50 and cleared on canvas change. The Undo/Redo buttons return to the panel (available in both edit and create mode).
