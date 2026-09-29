import { notFound } from 'next/navigation';
import VfxStudio from '@/components/editor/VfxStudio';
import { isProjectId } from '@/components/editor/start';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isProjectId(id)) notFound();
  return <VfxStudio key={id} id={id} />;
}
