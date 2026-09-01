### Q9 to Q12 (internal)

Q9 accessible folders and roster: folder_members by user_id; connections by either column.
Q10 folder counts: section 8.11. Q11 scheduler poll: reminders where state = 'scheduled'
and fire_at <= now(). Q12 login invites: invites where email = viewer's lowercased email
and status = 'pending'.
