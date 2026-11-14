'use client';

import dynamic from 'next/dynamic';

const FileManager = dynamic(() => import('../components/FileManager'), { ssr: false });

export default function Page() {
  return <FileManager />;
}
