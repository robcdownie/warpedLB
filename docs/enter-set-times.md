# Entering the official set times

Warped doesn't publish stage times ahead of the show. They go up on a big board near the entrance about an hour before the first set: **one column per stage**, each column a list of **time then band** running down the day.

**Board mode is built to match that board**, so you read straight down a column instead of hunting for bands alphabetically.

## On the day

1. Photograph the board (everyone does — you'll want it to check against).
2. **Schedule tab → Enter Times.** It opens in **Board** mode.
3. Pick the **day**, then tap the **stage** whose column you're reading.
4. For each line in that column:
   - Type the time as **plain digits** — `205` is 2:05 PM. No AM/PM tapping.
   - The cursor jumps to the band box on its own as soon as the time can only mean one thing.
   - Type **three or four letters** of the band and tap it in the list.
5. The set drops into the column below in time order, and the cursor returns to the time field ready for the next line.
6. Move to the next stage chip and repeat.

The chips show a count as each stage fills, and the line above the entry box tracks the day (`23/76 Saturday sets placed`), so you can check yourself against the board.

### Why digits are enough

The festival runs 11:00–22:00, so a bare number is never ambiguous:

| You type | You get |
|---|---|
| `1153` | 11:53 AM |
| `1254` | 12:54 PM |
| `205`  | 2:05 PM |
| `931`  | 9:31 PM |

The field shows its reading (`→ 2:05 PM`) before you commit, so a mistyped time is caught immediately. `3:05 pm` and `15:05` still work too — an explicit AM/PM always wins.

## You don't need end times

Only start times are on the board, and that's all the app wants. Each set's end is estimated from the next set on the same stage (minus the turnover buffer under **Menu → Travel & Crowd**) and is always labeled “est.”. Enter a column in order and every estimate fills itself in. Type an exact **End** in the A–Z list only if you happen to know one.

## Fixing things

- **Wrong band or time** — tap **Undo** at the top of the entry box. Each entry undoes individually.
- **Remove a set** — tap the **×** on its row in the column.
- **Band already placed elsewhere** — it still appears in the list, marked with where it is (`on Ghost · 3:24 PM`). Tapping it **moves** it; it's never duplicated.
- **Anything fiddly** — switch to the **A–Z list** tab. That's the original alphabetical editor, with search and **No stage / No time** filters for hunting down whatever is still blank.

The app warns you if two performers land on the same stage at the same time, and never overwrites an exact end time you typed.

## Unplugged sets

The Unplugged stage works the same way and also assigns the **day** — unplugged appearances have no announced day until the board goes up. Pick the day, tap the Unplugged chip, enter times as normal.

## Share it with the crew

After entering, **Menu → Schedule Import / Export → Export**, and send the QR/code to the others so they don't each have to type it. Imports **merge** — they never wipe what someone already entered. See [data import/export](data-import-export.md).

## Photo import

Reading the schedule from a photo (OCR) is intentionally **not** included — typing it in Board mode is faster and can't silently guess a wrong stage or time. If it's ever added, any photo-read result must be reviewed by a person before saving.
