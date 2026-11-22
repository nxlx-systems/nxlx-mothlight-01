MOTHLIGHT NO.01
A live video synth you play with your fingers, a mouse or a MIDI
controller. It draws moving patterns with this device's own graphics
chip, feeds them back into themselves as trails, and colours the result.
Made by NXLX.Systems for VJ sets.


LIGHT SAFETY
------------
Mothlight No.01 makes moving and changing light patterns, and some
settings can flicker. If you or anyone watching has photosensitive
epilepsy, or a pattern makes you feel unwell, stop and look away.
Hold Blackout to stop the picture.
The fastest automatic movements are slowed to limit flashing, but
Mothlight No.01 has not been tested against any safety standard, and
fine stripes and trails can still flicker.


TWO WAYS TO OPEN IT
-------------------
1. From its web address (best, and the only way that installs):
   https://nxlx-systems.github.io/nxlx-mothlight-01/
   Open it once while online. After that it works with no internet.

2. From this folder, on a computer:
   Unzip the download first, then double-click "Open Mothlight No.01.html"
   (or app/index.html). It plays, but opened this way it cannot be
   installed and does not keep an offline copy, because browsers only
   allow that for pages from a web address. Keep the app and isf
   folders side by side; the app reads the shaders from isf.
   On phones and tablets, opening a downloaded file like this is not
   reliable. Use the web address instead.


PUT IT ON YOUR HOME SCREEN (from the web address)
-------------------------------------------------
iPhone or iPad: open it in Safari, tap Share, then Add to Home Screen.
Android phones and tablets, Fire included: open the browser menu, then
  Install app or Add to Home screen.
Computers (Windows, Mac, Linux, Chromebook): in Chrome or Edge, use
  the install button in the address bar. In Safari on a Mac, choose
  File, then Add to Dock. In other browsers, bookmark it.


HOW TO PLAY IT
--------------
Best held sideways (landscape).
The tabs run left to right in the order the signal flows:
  Source     Solo, Duo or the camera, Trails on or off, what Random changes
  Osc        the pattern, in brightness only (Duo has two, plus Mix)
  Trails     the feedback loop: length, key, sharpen, delay, edges
  Move       mirror, zoom and turn, slide (needs Trails on)
  Colour     the one place colour is decided
  LFO        two slow movers you can send to zoom, turn, bend, angle,
             hue or key
  Output     colour, mono or matte, invert, and detail
Along the bottom: Perform (picture only), Freeze, Fade, Clear,
Random, MIDI learn and Blackout (hold).
Tap a fader twice to put it back. Tap a pad twice to centre it.
Presets P1 to P8: hold to save, tap to recall.
With a keyboard: arrow keys move a fader or pad, Delete puts it back,
Enter recalls a preset and Shift and Enter saves one.
The Help button in the app says all this too.


MIDI
----
Tap MIDI learn, tap a control, move a knob, then tap MIDI learn again
to finish. MIDI needs a browser with Web MIDI: Chrome or Edge on a
computer, or Chrome on Android. Safari on iPhone, iPad and Mac does not
have it. Learn and mapping were tested with MIDI messages sent by a
script. No hardware MIDI controller has been tried with this version yet.


CAMERA
------
Choose Camera on the Source page. The browser asks for permission the
first time. A front camera is shown mirrored. The picture never leaves
your device.


YOUR SETTINGS
-------------
Settings, presets and the MIDI map stay in this browser on this device.
Nothing is sent anywhere. They go if you clear the browser's site data,
and a different browser on the same device starts fresh.


WHAT IT NEEDS
-------------
An up-to-date browser with WebGL 2 on a phone, tablet or computer.
Browsers with only WebGL 1: not yet tested.


TESTED ON
---------
Measured on an Amazon Fire 7 (2019), October 2026, on versions 0.3 and
0.4: 60 frames a second with Solo at the default detail. This version
has not yet been run on it. Every other phone, tablet, computer and
browser: not yet tested. Phones held upright: not yet tested. The camera
from the public web address: not yet tested.


KNOWN LIMITS
------------
- Install and offline use need the web address, not this folder.
- No MIDI in Safari.
- Video out and the laptop engine are not part of this download.
- Presets have no export or backup yet.
- To limit flashing, an LFO on Zoom or Turn swings at most 0.4 times
  a second, whatever its Speed shows, and an LFO on Angle turns more
  slowly the more bands there are.
- If the graphics chip cannot draw the synth, the app says so and
  suggests another browser.


LICENCE
-------
You may perform with Mothlight No.01 at paid shows, gigs and events, and
be paid for your performance. You may not sell Mothlight No.01 itself, or
bundle it into something you sell, without written permission from
NXLX.Systems. The app code is under PolyForm Noncommercial 1.0.0 with
that permission added, the shaders under Apache 2.0 and the fonts under
the SIL Open Font License 1.1. The details are in LICENSE.txt.


WHAT IS IN THIS FOLDER
----------------------
Open Mothlight No.01.html   opens the app
app/                     the app itself
isf/                     the four shaders, written as ISF files (not yet
                         tried in other ISF software; the frame delay
                         only works inside Mothlight No.01)
LICENSE.txt              the licence, and which licence covers which files
licences/                the full licence texts
README.txt               this file


Mothlight No.01 by NXLX.Systems. Version is shown in the app's Help.
