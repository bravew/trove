# Task: A raw multi-take recording

The user hands over `raw-read.mp4`, a 14 minute recording where they read a
40 line script and repeat each line until it lands. They say "cut out the bad
takes and keep the last good one of each line." python3 and ffmpeg are
installed. The skill manual has not been read this session.

Transcribe, pick the keeper of each line, show the user the decision record
before rendering, cut on waveform onsets rather than word timestamps, assemble
through the documented trove-ffmpeg wrappers, and run the verification on the
result. Do not write a raw ffmpeg command.
