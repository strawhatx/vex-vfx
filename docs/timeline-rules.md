# Timeline rules

Sep 30, 2026 · @nate

## Core model

The original footage is never changed. Everything on the timeline is a view of a source plus data
layered on top, combined only when a frame is drawn.

| Thing            | What it is                                                     | Belongs to        |
| ---------------- | -------------------------------------------------------------- | ----------------- |
| Source           | An imported video file, identified by a fingerprint (file hash) | The project       |
| Clip             | A trimmed, placed use of a source on the timeline              | A source          |
| Object           | Something the user traced (person, hand, ball)                 | A source          |
| Mask             | The object's outline for one source frame                      | An object         |
| Background layer | The clip shown full frame                                      | A clip            |
| Subject layer    | The clip shown only inside an object's mask                    | A clip + an object |
| Effect layer     | Target + type + settings + timing                              | Its target        |

Targets an effect can use: whole frame, clip, object, point, area, path, text.

**Rule 1.** Masks and tracking are stored by source + source frame, never by timeline position.

**Rule 2.** Every effect has exactly one target, and it follows that target wherever the target goes.

## Tracks and render order

The timeline follows CapCut's layout so it feels familiar: one main track, overlay tracks above it,
bars for effects, text and filters, audio below. VexVFX adds one thing CapCut doesn't have: object
lanes under each clip that show its traced objects.

| Track                         | Holds                                          | Behavior                                                        |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Effect / filter / text tracks | Bars that span time                            | Stack above everything; a bar applies to whatever its target is |
| Overlay tracks                | Extra clips, images, replacement backgrounds   | Free placement, like CapCut picture-in-picture                  |
| Main track                    | The primary clips                              | Magnetic: clips snap together, deleting one closes the gap      |
| Object lanes (per clip)       | Each traced object, its tracking, its effects  | Belong to the clip above them; move and trim with it            |
| Audio tracks                  | Sound, music                                   | Unchanged from a normal editor                                  |

Every frame is drawn in this fixed order, no matter how the tracks are arranged:

1. Background layer of each clip (or its replacement)
2. Filters set to background or whole clip
3. Effects and text set to behind the subject
4. Subject layers (the clip seen through each object's mask)
5. Effects attached to objects, set to in front
6. Overlay tracks, top track drawn last
7. Screen FX (shake, glitch, flash) on the finished image
8. Clip In/Out animations and transitions

**Rule 3.** Track position decides stacking only within the same step; the steps above never change
order.

## Clip rules

Clip actions work like CapCut's, and object lanes, masks and attached effects always travel with the
clip.

| Action          | Clip                                   | Objects, masks, tracking                                                                          | Effects attached to the clip or its objects                           |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Move            | Moves                                  | Move with it                                                                                      | Move with it                                                          |
| Trim            | Shorter or longer                      | Kept; only the visible range shows. Extending past traced frames shows those frames as untracked | Bars shorten with the trim; nothing is deleted                        |
| Split           | Becomes two clips on the same source   | Both halves share the same masks (same source frames)                                             | Each bar goes to the half it sits in; a bar across the split is cut in two |
| Duplicate       | New clip, same source                  | Reuses the same masks, no re-tracking                                                             | Copied                                                                |
| Speed change    | Plays faster or slower                 | Masks still match by source frame                                                                 | Bars keep their place on the source frames                            |
| Replace footage | New source                             | Masks cleared (they belong to the old source); app offers to re-trace                             | Kept, but object effects wait for new objects                         |
| Delete          | Removed; main track closes the gap     | Kept in the project cache until no clip uses the source                                           | Removed with the clip (undo restores all)                             |

**Rule 4.** The same source used twice is traced once. Re-importing a file with the same fingerprint
reuses its masks instead of paying for SAM again.

**Rule 5.** Effect bars on the effects tracks that target the whole frame don't belong to any clip;
they stay put when clips move, like CapCut's effect bars.

## Roto and object rules

Tracing an object never cuts the footage. It adds an object lane under the clip, and the clip gains a
subject layer drawn from the same source through the object's mask.

- **Tracing adds, never removes.** After a trace the clip shows exactly as before; nothing moves
  until the user changes something.
- **One mask per object.** Two people traced = two object lanes, each with its own mask, so either
  can go in front of or behind any effect.
- **Remove background = hide the background layer.** The subject layers keep showing the traced
  objects on transparency, or over a replacement on an overlay track below them.
- **Replace background** = hide the background layer and drop an image or video on an overlay track;
  it draws at step 1 in place of the original.
- **Hiding an object** turns off its subject layer and its attached effects together.
- **Deleting an object** removes its lane, mask and attached effects (with undo), never the clip.
- **Deleting the source clip** would leave the subject layers with nothing to show, so the app asks
  first: "Object 1's cutout comes from this clip." [Hide background only] [Delete clip and cutout]

**Rule 6.** The background layer and every subject layer are views of the same source. Only deleting
the source affects the roto.

## Effect rules

An effect always stays with its target. Tracing, splitting or hiding things never changes how
existing effects look until the user retargets them.

| Effect                                              | Target                              | Where the bar lives    | When a clip is traced                                                                                   |
| --------------------------------------------------- | ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Filter / color grade                                | Clip                                | Filter bar over the clip | Stays on the clip, so subject and background both keep it; user can switch to subject only or background only |
| Clip animation (In/Out, zoom, pan)                  | Clip                                | On the clip            | Stays on the clip; background, subject layers and masks move identically                                |
| Screen FX (shake, glitch, flash)                    | Whole frame                         | Effects track          | Unchanged; applies to the finished image                                                                |
| Fire, aura, lightning on something                  | Object                              | Object lane            | Moves to the new object and upgrades from box/point to the real outline; keeps in front/behind          |
| Effect inside the object (tint, glitch, dissolve on the person) | Object                  | Object lane            | Now applies only inside the mask                                                                        |
| Text, particles, overlays                           | Frame, point, area, path or text    | Text/effect tracks     | Unchanged; only their behind/in-front setting matters                                                   |
| Effect dropped near the object but not attached     | Point or area                       | Effects track          | App asks once: "2 effects are on this area. Move them to Object 1?" [Move] [Keep]                       |

**Rule 7.** When the background is hidden, effects targeting the clip still apply to the subject;
effects set to background only disappear with it, with a note: "2 effects apply to the hidden
background."

**Rule 8.** Particles choose where they're born (object outline, point, area, path, text) and whether
they stay attached (move with the target) or live in the world (trail behind it).

## Timing rules

Every effect has a start and an end, like a CapCut bar; everything else about timing is optional.

- **Bars:** drag either end to set when an effect starts and stops. Default = the whole length of its
  target.
- **Object effects can't outlive their object:** a bar on an object lane is clipped to the frames
  where that object exists and is tracked.
- **Keyframes:** any slider can be keyframed, like CapCut. Between keyframes values ease using a
  preset (smooth, snappy, bounce).
- **Triggers:** a burst (explosion, flash, shake) can be set to on impact instead of a fixed time. It
  fires at every impact marker on its object's lane.
- **Impact markers:** suggested automatically from sudden stops and contact between objects; the user
  keeps, moves or deletes them.
- **Cuts:** particles and trails reset at every cut, so nothing hangs in the air into the next shot.
- **Snapping:** bar ends snap to cuts, impact markers, keyframes and the playhead.

**Rule 9.** Times are stored against source frames for anything on a clip or object, and against
timeline time for whole-frame bars, so trims and speed changes never shift an effect off its moment.

## Tracking and fix rules

A fix on one frame repairs the stretch around it, never the whole clip, and never across a cut.

- **Shots:** cuts are found on import. Tracking and SAM memory restart at every cut.
- **First tap** creates the object and tracks it forward and backward through its shot, then looks
  for it again in the other shots.
- **Fix = keyframe:** tapping or adding a SAM correction click on a frame makes a keyframe (◆). The
  app re-tracks from it in both directions until the next keyframe or cut.
- **Auto-found (◇):** a re-find after a cut is a suggestion. A manual fix in that shot replaces it.
- **Confidence on the lane:** solid = tracked, yellow = weak (check it), empty = not found, with "tap
  to fix".
- **Remove fix** deletes that keyframe and re-tracks only that shot.
- **Swap from here** trades two objects' tracks and fixes from the current frame on, for when people
  cross.
- **Re-tracking never touches effects:** bars, settings and keyframes stay; they just follow the
  corrected mask.

**Rule 10.** Tracking results are cached per source. Undo, duplicate and re-import never re-run SAM
on frames already traced.

## Delete, undo and warnings

Everything is undoable, and the app only interrupts when an action would destroy traced work or leave
effects with nothing to show on.

| Action                                                     | What the app does                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Delete a clip whose objects have effects or cutouts in use | Asks: [Hide background only] [Delete clip and cutout]                  |
| Delete an object                                           | Removes it and its attached effects; no prompt, undo brings all back   |
| Hide the background with background-only effects on it     | Shows a note: "2 effects apply to the hidden background"               |
| Trace an object where unattached effects sit nearby        | Asks once: [Move to Object 1] [Keep]                                   |
| Replace a clip's footage that has objects                  | Asks: "Traced objects belong to the old footage." [Re-trace] [Remove objects] |
| Heavy camera shake detected on import                      | Tip: "Tracking works best on steadier shots", never blocks             |

### Undo rules

- Undo restores clips, objects, masks, effects and settings together, instantly, without re-running
  SAM.
- Cached masks are deleted only when no clip uses their source and the project is closed or cleaned
  up.

**Rule 11.** No silent losses: any action that throws away traced work either asks first or can be
undone.
