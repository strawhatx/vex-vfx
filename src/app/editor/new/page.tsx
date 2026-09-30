'use client';

// a new project: on to a page of its own
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProject() {
  const router = useRouter();
  useEffect(() => router.replace(`/editor/${crypto.randomUUID()}`), [router]);
  return null;
}
