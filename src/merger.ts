interface SrtCue {
  startMs: number;
  endMs: number;
  lines: string[];
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(mil, 3)}`;
}

function parseTimestamp(ts: string): number {
  const m = ts.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!m) return 0;
  return (
    parseInt(m[1], 10) * 3600000 +
    parseInt(m[2], 10) * 60000 +
    parseInt(m[3], 10) * 1000 +
    parseInt(m[4], 10)
  );
}

export function parseSrt(raw: string): SrtCue[] {
  const cues: SrtCue[] = [];
  const blocks = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find the timestamp line (may not always be the second line)
    let tsLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        tsLine = i;
        break;
      }
    }
    if (tsLine < 0) continue;

    const tsParts = lines[tsLine].split('-->');
    if (tsParts.length < 2) continue;

    const startMs = parseTimestamp(tsParts[0].trim());
    const endMs = parseTimestamp(tsParts[1].trim());
    const textLines = lines.slice(tsLine + 1).filter(l => l.trim() !== '');

    if (textLines.length === 0) continue;
    cues.push({ startMs, endMs, lines: textLines });
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

type EventType = 'start' | 'end';

interface Event {
  time: number;
  type: EventType;
  cue: SrtCue;
  track: 'primary' | 'secondary';
}

function buildMergedText(
  primaryLines: string[] | undefined,
  secondaryLines: string[] | undefined,
): string {
  const top = primaryLines?.join('\n') ?? '';
  const bottom = secondaryLines ? `<i>${secondaryLines.join('\n')}</i>` : '';
  if (top && bottom) return `${top}\n${bottom}`;
  return top || bottom;
}

function serializeSrt(cues: Array<{ startMs: number; endMs: number; text: string }>): string {
  return cues
    .map((c, i) =>
      `${i + 1}\n${msToSrtTime(c.startMs)} --> ${msToSrtTime(c.endMs)}\n${c.text}\n`,
    )
    .join('\n');
}

export function mergeSrts(primary: SrtCue[], secondary: SrtCue[]): string {
  const events: Event[] = [];

  for (const cue of primary) {
    events.push({ time: cue.startMs, type: 'start', cue, track: 'primary' });
    events.push({ time: cue.endMs, type: 'end', cue, track: 'primary' });
  }
  for (const cue of secondary) {
    events.push({ time: cue.startMs, type: 'start', cue, track: 'secondary' });
    events.push({ time: cue.endMs, type: 'end', cue, track: 'secondary' });
  }

  // Sort by time; on tie, end events come before start events
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type === 'end' && b.type === 'start') return -1;
    if (a.type === 'start' && b.type === 'end') return 1;
    return 0;
  });

  const merged: Array<{ startMs: number; endMs: number; text: string }> = [];
  let activeP: SrtCue | null = null;
  let activeS: SrtCue | null = null;
  let lastTime = 0;

  for (const event of events) {
    if (event.time > lastTime && (activeP || activeS)) {
      const text = buildMergedText(activeP?.lines, activeS?.lines);
      if (text) {
        merged.push({ startMs: lastTime, endMs: event.time, text });
      }
    }

    if (event.type === 'start') {
      if (event.track === 'primary') activeP = event.cue;
      else activeS = event.cue;
    } else {
      if (event.track === 'primary' && activeP === event.cue) activeP = null;
      else if (event.track === 'secondary' && activeS === event.cue) activeS = null;
    }

    lastTime = event.time;
  }

  return serializeSrt(merged);
}
