# H5 — the hosted v8 reader check

Fixture: `tests/fixtures/v8-hosted-seed.json`
SHA-256: `d2f50461178a4131bca640af4ed656a057d91a9af342801f974cd5fb35dd1aa0`
Records: 4 — three `door2-v8` and one `door2-v7` control, every label prefixed `ZZ-TEST`.

This verifies the **reader**, from a fixture. It is not a save produced by a live v8
writer, because no writer can produce one: packet 1a ships the reader only. The DOM
tests carry the full matrix. **If H5 has not run, hosted acceptance remains pending.**

**Never use your ordinary browser profile.** Real saved trips are never inspected,
overwritten or deleted. The procedure detects occupied storage and stops; it never
clears it.

## Steps

1. Open a genuinely isolated signed-out session on the published app, at `/plan?key=door2`.
   A new private window is **not** by itself proof of isolation — some browsers share
   storage across private windows. Step 2 is what establishes it.

2. Open devtools → Console and run:

   ```js
   localStorage.getItem('door2_drafts_v1')
   ```

   It must return **`null`** or **`[]`**. An empty saved-trips list on screen is not
   sufficient: unreadable storage and non-listable records are both invisible there.
   **On anything else, stop. Do not erase it.** Use a different isolated session.

3. Paste the fixture's entire contents as the value (the file is one JSON array):

   ```js
   localStorage.setItem('door2_drafts_v1', `<paste the whole file here>`);
   location.reload();
   ```

4. The saved-trips list should show four `ZZ-TEST` rows. Check each:

   | Row | Expected |
   |---|---|
   | `ZZ-TEST valid v8` | Opens. The itinerary renders. Shows "This version can show this trip, but can't edit or save it." Swap, nights chips, Undo and Save are all refused |
   | `ZZ-TEST v8 identity absent` | Opens read-only with its **own** sentence: "This trip opens, but the record of your changes is missing, so it's locked." |
   | `ZZ-TEST v8 unsafe render` | **Refused by name**, naming `activity.summary`, and still listed. The itinerary must never render |
   | `ZZ-TEST v7 control` | Opens **fully editable** — this is what proves the lock is specific to v8 |

5. Confirm the seeded records are unchanged:

   ```js
   localStorage.getItem('door2_drafts_v1')
   ```

   Compare against the fixture. Locked and refused actions must leave it identical.

6. Start a separate fresh trip and confirm it is fully functional, which proves the lock
   did not leak. **If that includes saving**, compare the four seeded records afterwards
   rather than expecting the whole key to stay byte-identical — an intentional save
   legitimately appends a fifth record.

7. Close the isolated session, which discards the seeded storage.

## Record with the result

The published build identity, and this fixture's SHA-256.
