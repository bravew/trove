# Task: A raw clip to ingest

The user hands over `C0415.MP4`, a three minute clip from a shoot, and says
"find the usable moments, grade them, and add them to my b-roll library at
~/Footage/library." python3 and ffmpeg are installed. The skill manual has not
been read this session.

Probe the transfer characteristics, build a timestamped contact sheet, name
each moment before cutting it, cut and grade through the documented
trove-ffmpeg wrappers with the LUT that matches the probed transfer, and append
each select to the catalog under the library the user named. Do not write a raw
ffmpeg command and do not assume a library path.
