High:

* Delete "Seek to start" and "Delete caption" action button.
* When sorting by speaker similarity, scroll to top.
* Try not to scroll table when possible: just make sure the active row is in view.
* "Autoplay (selected row)" is also autoadvancing to the next row somehow (perhaps when autoscroll is on)
* "Add caption at current position" moves above media playback widget.

* Delete duration from right of media filepath
* Delete "VTT File: " to the left of VTT filepath
* Rename "Play Sequential" to just a play button.
* Option to not render all times as hh:mm:ss.000 but just sss.000.  Use +- buttons to move time.


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

# Done:
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
* Delete with-media-reference.vtt since the main 33s file now has a media reference.
* simplify asr setup
* speaker id
