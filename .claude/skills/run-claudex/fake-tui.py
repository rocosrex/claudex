#!/usr/bin/env python3
"""Minimal TUI that behaves like Claude Code's fullscreen mode for mouse purposes.

It switches to the alternate screen, enables SGR mouse tracking (1000/1002/1003/1006),
prints a marker line on row 5, and then logs every byte it receives on stdin to
--log so a test can inspect exactly which mouse reports the terminal delivered.
Quit with `q` or Ctrl+C.
"""
import os
import sys
import termios
import tty


def arg(name, default):
    if name in sys.argv:
        return sys.argv[sys.argv.index(name) + 1]
    return default


log = arg('--log', None)
marker = arg('--marker', 'FAKE-TUI-MARKER')
w = sys.stdout.write

w('\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h')
w('\x1b[H\x1b[2J')
w('\x1b[5;1H' + marker)
w('\x1b[7;1Hpress q to quit')
sys.stdout.flush()

fd = sys.stdin.fileno()
old = termios.tcgetattr(fd)
tty.setraw(fd)
try:
    while True:
        data = os.read(fd, 4096)
        if not data:
            break
        if log:
            with open(log, 'ab') as f:
                f.write(data)
        if b'q' in data or b'\x03' in data:
            break
finally:
    termios.tcsetattr(fd, termios.TCSADRAIN, old)
    w('\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l\x1b[?1049l')
    sys.stdout.flush()
