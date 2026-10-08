---
name: asd-ste100
description: >
  Write or rewrite technical text in Simplified Technical English (ASD-STE100): docs,
  comments, commit messages, PR and issue text, error messages, tool descriptions and
  agent instructions. Not for creative or marketing copy.
license: MIT
---

# Simplified Technical English (ASD-STE100)

Condensed from [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill).

STE removes the two biggest causes of misreading: words with more than one meaning, and
sentences with more than one possible structure. This file applies the rule categories of
ASD-STE100 Issue 9. It does not include the official dictionary, so use the plainest common
word and use it the same way every time.

## Two modes

- **Strict:** procedures, error messages, tool descriptions, agent instructions. Apply
  every rule.
- **STE-flavored:** READMEs, PR descriptions, changelogs, explanations. Apply the structure
  rules in full. Treat the word rules as advice.

## Structure rules

| Rule | Do | Do not |
|---|---|---|
| Active voice | "The agent deletes the file." | "The file is deleted." (unless the actor is unknown) |
| No phrasal verbs | "Remove the panel." "Start the job." | "Take off the panel." "Spin up the job." |
| One instruction per sentence | "Open the file. Read line 3." | "Open the file and read line 3, then check it." |
| Sentence length | Max 20 words for instructions, 25 for descriptions | Long chains of clauses |
| No semicolons | Two sentences | Any semicolon |
| Noun clusters | Max 3 nouns in a row | "high pressure fuel pump inlet valve" |
| No ellipsis | Keep the subject, verb and article | "Files not backed up will be lost" |
| Keep modality | "may have failed" stays "may have failed" | Turn a hedge into a fact |
| Paragraphs | One topic, max 6 sentences | Many topics in one paragraph |
| Lists | A list for 3 or more steps or conditions | A sequence inside one sentence |
| Simple tenses | "We received the report." | "We have received the report." Keep a compound tense only when it carries meaning ("has completed", "may have failed"). |

## Word rules

- One word, one meaning: pick one word for one thing and reuse it. Do not rotate
  "check", "verify" and "confirm" for one action.
- Use the verb, not a noun made from it: "analyze the log", not "perform an analysis of".
- Define a domain term once if it is not common English.

## Scan for

1. **Synonym rotation:** one thing with many names ("user", "customer", "client").
2. **Hedge stacking:** "it is important to note that this may potentially help". State the
   claim or delete it.
3. **Nominalization:** "provides assistance to". Use "helps".
4. **Marketing adjectives:** seamless, robust, powerful, effortless. Delete them or give
   the measurement.
5. **Run-on sentences:** ideas joined by semicolons or dashes. One idea per sentence.
6. **Soft phrasal verbs:** spin up, reach out, dive into, kick off. Use start, contact,
   read, begin.

## Process

1. Pick the mode.
2. Read the text once for meaning before you change it.
3. Go sentence by sentence. Fix each rule break and each item from "Scan for".
4. Keep every fact, condition, number and hedge. Never add a fact the source did not
   state. If a shorter form loses precision, keep the longer form.
5. If the text already complies, leave it.

By default, output only the rewritten text. Show a table of rules, original and rewrite
only when asked. STE fixes the form, not the content: if the text says nothing, say so.
Stop when the sentence is clear, not when it is shortest.
