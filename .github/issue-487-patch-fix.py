from pathlib import Path

path = Path(__file__).with_name('issue-487-backend-patch.py')
text = path.read_text()
start = text.index('# Duplication/copy behavior:')
end = text.index('# Test harness:', start)
replacement = '''# Duplication/copy behavior: carry Start endpoint time without changing existing Due semantics.
acts = "app/src/server/domain/acts.ts"
replace_n(
    acts,
    "                   to_char(start_date, 'YYYY-MM-DD') AS start_date,\\n                   to_char(due_date, 'YYYY-MM-DD') AS due_date,\\n",
    "                   to_char(start_date, 'YYYY-MM-DD') AS start_date,\\n"
    "                   to_char(start_time, 'HH24:MI') AS start_time,\\n"
    "                   to_char(due_date, 'YYYY-MM-DD') AS due_date,\\n",
    2,
)
replace_n(
    acts,
    "(folder_id, title, notes, important, start_date, due_date, recurrence_rule,\\n",
    "(folder_id, title, notes, important, start_date, start_time, due_date, recurrence_rule,\\n",
    2,
)
replace_once(
    acts,
    "                      ${task.start_date === null || task.start_date === undefined ? null : String(task.start_date)}::date,\\n"
    "                      ${task.due_date === null ? null : String(task.due_date)}::date,\\n",
    "                      ${task.start_date === null || task.start_date === undefined ? null : String(task.start_date)}::date,\\n"
    "                      ${task.start_time === null || task.start_time === undefined ? null : String(task.start_time)}::time,\\n"
    "                      ${task.due_date === null ? null : String(task.due_date)}::date,\\n",
)
replace_once(
    acts,
    "                  ${startForCopy}::date,\\n                  ${dueForCopy}::date,\\n",
    "                  ${startForCopy}::date,\\n"
    "                  ${row?.start_time === null || row?.start_time === undefined ? null : String(row.start_time)}::time,\\n"
    "                  ${dueForCopy}::date,\\n",
)

'''
path.write_text(text[:start] + replacement + text[end:])
print('copy patch staging corrected')
