* Why was embedding so slow for a long file, were we re-loading the audio for disk every time?
* The checked button isn't present in the table.
* JSON file: "text": "\u00c8 solo che le cibchiera", -- crappy UTF, can it be better?
* embeddings inline with the segments in a serialized float form?  don't like having them at the beginning.





* move all python tests adjacent to code under test.
* switch all dataclasses to pydantic.

* open a new wav should clear the document model.


* ASR crashes if you don't have ffmpeg installed.
* Bring all framework and library dependencies up to date, and get test suite running again.
* The E2E tests are kind of slow -- are there redundancies there that could be removed?  Are there sleeps in there?  Could some coverage be moved to smaller tests?  Could the ASR test me marked as "manual only", so that it doesn't run as part of "run-all-tests.sh"?
* Replace waitForTimeout() calls in E2E tests with proper waitForSelector/expect patterns. merge-adjacent-segments.spec.ts has 11 such sleeps.
* Clean up CLAUDE.md.
* One thing I've noticed (to my chagrin) in this codebase is that sometimes running the tests modifies things in the code tree, especially in test_data.  This should only happen with the equivalent of --snapshot-update (and should never happen for test "inputs"), but I think the tests sometimes use the code tree copy of data as their "working copy".
* Debug:
export HEADLESS=true && npx playwright test tests/speaker-name-edit-focus.spec.ts --reporter=list


Next up is to package the python script called transcribe/embed_cli.py behind a menu item under "AI Annotations"

* Drag-n-drop vtt and media files into app.
* Loading a large video seemed to block Apple-Q to exit the app?

* Automatically run speaker id embedding after ASR.
* Make a MAS build for Apple App Store.





High:
https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM
* Rename "Play Sequential" to just be a play button.


Medium:
* Run speaker embedding right after ASR from same binary.
* Autoscroll defaults to on.
* enable merging of adjacent rows when selected.
* Truncate file names from the left and provide a copy button for them. -- Don't need the duration on the right hand side.

Low:
* Enable running speaker_id from Node.
* Run ASR from Node.
* Load SRT files to Node UI.
* Export SRT files.

# Done

* Delete the media file duration that's displayed to the right of media filepath.
* Delete the "VTT File: " text that's displayed to the left of VTT filepath.
* The "Add caption at current position" button on the bottom right should move above media playback widget.
* After sorting by speaker similarity, scroll to top of the AG Grid.
* Render and accept all times not as hh:mm:ss.000 but just a second count ssss.000.  When editing a timestamp in the AG Grid, you can use +- buttons to increase decrease the time by 0.1s.


I'd like to clean up the different modes in which we can be playing, the way they can be entered, and their state.
I'm not sure how close or far we are to this, but I think this is the desired state:

Mode A) MEDIA_PLAYING: the media file is just playing forwards normally.  Initiated via the play button near the media.
In mode A, moving the playhead manually doesn't stop playback, it just continues from the point where it was moved to.

Mode B) SEGMENTS_PLAYING: there's a list of segment ids to be played in a particular order.  Initiated in one of several ways:
  1. Clicking the play button in the AG Grid on a row creates a playlist of length one, of just that row, and plays it.
  2. If "Autoplay selected row" is turned on, and a new row is selected in the table, it's identical to #1 right above -- as if that row's play button was clicked.
  3. Clicking the "Play Segments" button above the AG Grid creates a playlist that starts with the currently selected row (first row if none selected) and goes through the AG Grid in the order they're currently displayed.
When this mode B finishes without interruption, the playhead returns to the beginning of the first row that was played.
In mode B, moving the playhead manually ends the playback of the playlist.

If either playback mode is active:
* Pausing playback pauses the playhead where it is and ends that playback mode.
* Starting any of these playback methods immediately ends any other that is active and replaces it.
* "Autoplay selected row" has no effect if the selected row changes due to playhead movement during playback.

In either playback mode, or even when playback is not happening, if "Auto-scroll" is turned on (the default), moving the playhead, either through playback or the user manually dragging it, should:
* Highlight in the AG Grid the first segment that contains the playhead (again, this shouldn't trigger "Autoplay selected row")
* Attempt to ensure this segment is "in view" in the table's scroll position -- but don't necessarily scroll this row to the top of the table, which is the current behavior -- that produces too much scrolling and the UI jumps around unpredictably.

* Try not to scroll table when possible: just make sure the active row is in view.
* "Autoplay (selected row)" is also autoadvancing to the next row somehow (perhaps when autoscroll is on)

* Delete "Seek to start" and "Delete caption" action button.
* Context menu: Merge adjacent selected rows.
* Play table segments in table order.
* Add "Speaker" menu.
* Bulk set speaker for selected rows.
* When editing caption, try to preserve word level timestamps.
* Hide "Speaker similarity" column until its populated.  After sorting by speaker sim, scroll to top. Fix table sort on start, should be start_time
* Delete the "Open Files" button, and "add caption at current position"

* Delete the time adjustment buttons.
* electron packaging
* When text wraps inside a table column, make it have less line spacing in between lines.
* Delete with-media-reference.vtt since the main 33s file now has a media reference. (done)
* simplify asr setup
* speaker id
