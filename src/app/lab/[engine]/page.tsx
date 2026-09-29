import { notFound } from 'next/navigation';
import EngineLab from '@/components/lab/EngineLab';
import { isEngine } from '@/domain/effects/draft';

export default async function LabPage({ params }: { params: Promise<{ engine: string }> }) {
  const { engine } = await params;
  if (!isEngine(engine)) notFound();
  return <EngineLab key={engine} engine={engine} />;
}
