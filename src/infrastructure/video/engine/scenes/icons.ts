// The ambient wall's icons, from Lucide (ISC licence): each icon's shapes as Path2D, drawn on its
// 24-unit grid with a 2-unit stroke, like the originals.
import {
  Bell,
  Calendar,
  ChartColumn,
  Cloud,
  Code,
  CreditCard,
  Database,
  FileText,
  Globe,
  Heart,
  Image,
  Inbox,
  Layers,
  Lock,
  Mail,
  MessageCircle,
  Receipt,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  Users,
  Wallet,
  Workflow,
  Zap,
  Clock,
  Check,
} from 'lucide';
import type { IconId } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';

// each icon is a list of [svg tag, attributes]
type IconNode = readonly (readonly [string, Record<string, unknown>])[];

const NODES: Record<IconId | 'check', IconNode> = {
  'file-text': FileText,
  receipt: Receipt,
  chart: ChartColumn,
  shield: ShieldCheck,
  zap: Zap,
  users: Users,
  clock: Clock,
  mail: Mail,
  lock: Lock,
  globe: Globe,
  code: Code,
  terminal: Terminal,
  sparkles: Sparkles,
  message: MessageCircle,
  calendar: Calendar,
  'credit-card': CreditCard,
  database: Database,
  cloud: Cloud,
  bell: Bell,
  heart: Heart,
  star: Star,
  image: Image,
  search: Search,
  inbox: Inbox,
  rocket: Rocket,
  wallet: Wallet,
  layers: Layers,
  workflow: Workflow,
  check: Check,
};

const cache = new Map<string, Path2D>();

// one Path2D for all of an icon's shapes
function pathOf(id: IconId | 'check'): Path2D {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = new Path2D();
  for (const [tag, a] of NODES[id] as unknown as [string, Record<string, string | number>][]) {
    const n = (k: string) => Number(a[k] ?? 0);
    if (tag === 'path') p.addPath(new Path2D(String(a.d)));
    else if (tag === 'circle') {
      p.moveTo(n('cx') + n('r'), n('cy'));
      p.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    } else if (tag === 'rect') {
      const r = n('rx');
      const q = new Path2D();
      q.roundRect(n('x'), n('y'), n('width'), n('height'), r);
      p.addPath(q);
    } else if (tag === 'line') {
      p.moveTo(n('x1'), n('y1'));
      p.lineTo(n('x2'), n('y2'));
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = String(a.points)
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      for (let i = 0; i + 1 < pts.length; i += 2) {
        if (i) p.lineTo(pts[i], pts[i + 1]);
        else p.moveTo(pts[i], pts[i + 1]);
      }
      if (tag === 'polygon') p.closePath();
    } else if (tag === 'ellipse') {
      p.moveTo(n('cx') + n('rx'), n('cy'));
      p.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
    }
  }
  cache.set(id, p);
  return p;
}

// draws an icon centred on (x, y), `size` pixels across
export function drawIcon(
  g: Ctx2D,
  id: IconId | 'check',
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 2,
) {
  const k = size / 24;
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(k, k);
  g.strokeStyle = color;
  g.lineWidth = weight;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(pathOf(id));
  g.restore();
}
