### Q7: Folder detail (member only, else 404)

Two regions over folder F. The open region is one composed sequence of Sections, prose,
images and real pending/abandoned task rows. Its tasks use the Q3/Q2 predicates with
`folder_id = F`, but every item reads in the shared fractional `page_position` order of
4.5 and 4.17; ties are broken by kind then id so the preamble's byte-identical guarantee
holds under concurrent insertion. A task without a page position trails positioned items
under Q3/Q2's prior keys, preserving rolling-deploy compatibility. The Done region uses
Q6's predicate, order and pagination with `folder_id = F`, and renders collapsed; it is
hidden while empty. Header: name, completion count per section 8.11, member avatars, share
entry point. An empty open region still renders the compose seam from 9.6: a writable page
does not replace its writing surface with task-only empty copy.
