/*
The conversation a folder arrives with.

It lived inside `folder-page-v2` as a module const, which was fine while the
page was the only thing that read it — and then search needed "even messages"
(Imran, 2026-08-23) and could not see a word of it. Exactly the shape the page
seeds had when duplicate became their second reader: **a fixture only one
screen can see is one the rest of the product cannot use.**
*/

import { voiceBars } from "@/components/comments"
import { PEOPLE, type ConceptComment } from "@/lib/task-model"

export const FOLDER_THREADS: Record<string, ConceptComment[]> = {
  Travel: [
    {
      id: "folder-wedding-1",
      author: PEOPLE[1]!,
      at: "Yesterday 19:04",
      body: "Florist confirmed for the 12th. She asked for the table count by Friday.",
    },
    {
      id: "folder-wedding-2",
      author: PEOPLE[0]!,
      at: "Yesterday 19:20",
      mine: true,
      body: "I'll close the guest list tomorrow, then the count falls out of it.",
      replies: [
        {
          id: "folder-wedding-2r",
          author: PEOPLE[1]!,
          at: "Yesterday 19:31",
          body: "Perfect — I'll hold her until Saturday morning.",
        },
      ],
    },
    {
      id: "folder-wedding-3",
      author: PEOPLE[2]!,
      at: "Today 8:41",
      voice: { seconds: 9, bars: voiceBars(9) },
    },
  ],
  "Office": [
    {
      id: "folder-cpc-1",
      author: PEOPLE[2]!,
      at: "Mon 11:18",
      body: "Committee meets on the 20th — anything for the agenda goes here.",
    },
  ],
}

/* Every word said on a folder, for the one control whose job is finding
   words. Replies included: a search that found a question and missed its
   answer would be worse than useless. */
export function folderThreadWords(name: string) {
  const say = (comment: ConceptComment): string[] => [
    comment.body ?? "",
    ...(comment.replies ?? []).flatMap(say),
  ]
  return (FOLDER_THREADS[name] ?? []).flatMap(say).filter(Boolean).join(" ")
}
