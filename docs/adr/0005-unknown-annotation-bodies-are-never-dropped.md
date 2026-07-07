# The built-in body editor never drops annotation bodies it doesn't understand

Unknown/structured body shapes (no string `value`, unrecognized `type`) render as
read-only entries with a note and pass through save untouched (decision D4). The
built-in editor's empty-`value` filtering applies only to bodies it created or edited
itself. The obvious alternatives — hiding unknown bodies or filtering them on save —
were how the editor previously destroyed structured bodies silently (review finding
F29); any future "cleanup" of the read-only rendering must preserve this pass-through
guarantee.
