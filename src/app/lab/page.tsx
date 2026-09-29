import { notFound } from 'next/navigation';
import PresetLab from '@/components/lab/PresetLab';
import { labOn } from './enabled';

// the Preset Lab: one page, for every kind of preset
export default function Lab() {
  if (!labOn()) notFound();
  return <PresetLab />;
}
