// Reusable Inbox-style section components, extracted from Prototype.tsx so
// they can be consumed by the Profile page (and any other surface that wants
// the same visual language).
//
// The originals in Prototype.tsx still live there because the inbox detail
// rail is tightly coupled to casesApi and lots of inline state — these copies
// are intentionally generic (callback-based) so they don't drag the prototype
// into the rest of the app.
export { default as DetailSection } from './DetailSection';
export { default as DetailRow } from './DetailRow';
export { default as TagsRow } from './TagsRow';
export { default as NoteCard } from './NoteCard';
