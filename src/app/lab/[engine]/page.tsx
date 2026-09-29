import { notFound } from 'next/navigation';
import EngineLab from '@/components/lab/EngineLab';
import { isLabPage } from '@/domain/effects/draft';

export default async function LabPage({ params }: { params: Promise<{ engine: string }> }) {
  const { engine } = await params;
  if (!isLabPage(engine)) notFound();
  return <EngineLab key={engine} page={engine} />;
}
