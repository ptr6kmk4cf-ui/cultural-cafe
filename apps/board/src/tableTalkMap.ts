import { convertToExcalidrawElements, FONT_FAMILY } from '@excalidraw/excalidraw';

type Skel = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];

const BOX_W = 280;
const BOX_H = 92;
const GAP = 52;

function box(id: string, x: number, y: number, fill: string, w = BOX_W, h = BOX_H): Skel {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    backgroundColor: fill,
    strokeColor: '#ced4da',
    strokeWidth: 1,
    roughness: 1,
    roundness: { type: 3 },
  };
}

function line(id: string, x: number, y: number, text: string, size = 18, color = '#f8f9fa'): Skel {
  return {
    id,
    type: 'text',
    x,
    y,
    text,
    fontSize: size,
    fontFamily: FONT_FAMILY.Helvetica,
    strokeColor: color,
    textAlign: 'left',
    autoResize: true,
  };
}

function down(id: string, fromX: number, fromY: number, length = GAP): Skel {
  return {
    id,
    type: 'arrow',
    x: fromX,
    y: fromY,
    width: 0,
    height: length,
    strokeColor: '#ffa94d',
    strokeWidth: 2,
    endArrowhead: 'arrow',
    points: [
      [0, 0],
      [0, length],
    ],
  };
}

function across(id: string, x: number, y: number, dx: number, dy: number): Skel {
  return {
    id,
    type: 'arrow',
    x,
    y,
    width: dx,
    height: dy,
    strokeColor: '#ffa94d',
    strokeWidth: 2,
    endArrowhead: 'arrow',
    points: [
      [0, 0],
      [dx, dy],
    ],
  };
}

/** Local board drawing of how a table line moves. Not a live table. */
export function tableTalkMap() {
  const left = 80;
  const mid = left + BOX_W + 100;
  const switches = mid + BOX_W + 90;
  const cx = left + BOX_W / 2;
  const personCx = mid + BOX_W / 2;
  const guestX = left - 20;

  const yType = 160;
  const ySend = yType + BOX_H + GAP;
  const yPrep = ySend + BOX_H + GAP;
  const yWho = yPrep + BOX_H + GAP;
  const yBubble = yWho + BOX_H + GAP;
  const yAfter = yBubble + BOX_H + GAP;
  const yAgain = yAfter + BOX_H + GAP;

  const skeletons: Skel[] = [
    line('title', left, 36, 'From your Send to their answer', 26, '#ffffff'),
    line('sub', left, 72, 'Fixed waits are in the café code. Model time varies (~1–8 s).', 16, '#adb5bd'),

    box('type', left, yType, '#1c7ed6'),
    line('typeA', left + 22, yType + 22, 'You type'),
    line('typeB', left + 22, yType + 50, 'Speak or type', 16),
    down('a1', cx, yType + BOX_H),
    line('a1t', cx + 14, yType + BOX_H + 14, '400 ms', 14, '#ffd8a8'),

    box('send', left, ySend, '#1971c2'),
    line('sendA', left + 22, ySend + 22, 'Send'),
    line('sendB', left + 22, ySend + 50, 'Your bubble now', 16),
    down('a2', cx, ySend + BOX_H),
    line('a2t', cx + 14, ySend + BOX_H + 14, '0.3–2 s', 14, '#ffd8a8'),

    box('prep', left, yPrep, '#1864ab'),
    line('prepA', left + 22, yPrep + 22, 'Prepare the line'),
    line('prepB', left + 22, yPrep + 50, 'Translate if needed', 16),

    across('a3', cx, yPrep + BOX_H, guestX + BOX_W / 2 - cx, yWho - (yPrep + BOX_H)),
    across('a4', cx, yPrep + BOX_H, personCx - cx, yWho - (yPrep + BOX_H)),

    box('guest', guestX, yWho, '#e8590c'),
    line('guestA', guestX + 22, yWho + 22, 'Fake guest'),
    line('guestB', guestX + 22, yWho + 50, 'Model + 1.2 s', 16),
    box('person', mid, yWho, '#2f9e44'),
    line('personA', mid + 22, yWho + 22, 'Real person'),
    line('personB', mid + 22, yWho + 50, 'Live, no pause', 16),

    across('a5', guestX + BOX_W / 2, yWho + BOX_H, cx - (guestX + BOX_W / 2), yBubble - (yWho + BOX_H)),
    across('a6', personCx, yWho + BOX_H, cx - personCx, yBubble - (yWho + BOX_H)),

    box('bubble', left, yBubble, '#9c36b5'),
    line('bubbleA', left + 22, yBubble + 22, 'Their bubble'),
    line('bubbleB', left + 22, yBubble + 50, 'On your screen', 16),

    across('a7', cx, yBubble + BOX_H, guestX + BOX_W / 2 - cx, yAfter - (yBubble + BOX_H)),
    line('a7t', guestX - 10, yBubble + BOX_H + 10, 'now', 14, '#ffd8a8'),
    across('a8', cx, yBubble + BOX_H, personCx - cx, yAfter - (yBubble + BOX_H)),
    line('a8t', mid + 16, yBubble + BOX_H + 10, 'wait 2.5 s', 14, '#ffd8a8'),

    box('hear', guestX, yAfter, '#ae3ec9'),
    line('hearA', guestX + 22, yAfter + 22, 'Hear them'),
    line('hearB', guestX + 22, yAfter + 50, 'Speaks that line', 16),
    box('auto', mid, yAfter, '#9c36b5'),
    line('autoA', mid + 22, yAfter + 22, 'Auto Answer'),
    line('autoB', mid + 22, yAfter + 50, 'Writes, then Send', 16),

    down('a9', personCx, yAfter + BOX_H),
    line('a9t', personCx + 14, yAfter + BOX_H + 14, 'next reply', 14, '#ffd8a8'),

    box('again', mid, yAgain, '#1864ab'),
    line('againA', mid + 22, yAgain + 22, 'Back to Prepare'),
    line('againB', mid + 22, yAgain + 50, 'The round starts again', 16),

    box('sw1', switches, yType, '#1c7ed6', 300, 92),
    line('sw1A', switches + 18, yType + 22, 'My language / Their language', 16),
    line('sw1B', switches + 18, yType + 50, 'You type, read, hear', 16),
    box('sw2', switches, ySend, '#ae3ec9', 300, 92),
    line('sw2A', switches + 18, ySend + 22, 'Hear them on / off', 16),
    line('sw2B', switches + 18, ySend + 50, 'Does not slow Send', 16),
    box('sw3', switches, yPrep, '#9c36b5', 300, 92),
    line('sw3A', switches + 18, yPrep + 22, 'Auto Answer on / off', 16),
    line('sw3B', switches + 18, yPrep + 50, 'Writes 2.5 s after them', 16),
    box('sw4', switches, yWho, '#1971c2', 300, 92),
    line('sw4A', switches + 18, yWho + 22, 'Suggest a reply', 16),
    line('sw4B', switches + 18, yWho + 50, 'You still tap Send', 16),
    line('footA', switches, yBubble + 8, 'Sitting-card paint ~6.8 s', 16, '#adb5bd'),
    line('footB', switches, yBubble + 36, 'is before the table.', 16, '#adb5bd'),
    line('footC', switches, yBubble + 64, 'Local drawing — not live café.', 16, '#adb5bd'),
  ];
  return convertToExcalidrawElements(skeletons, { regenerateIds: false }).map((el) => {
    if (el.type !== 'text') return el;
    return { ...el, width: el.width * 1.4 };
  });
}
