import { Construction } from 'lucide-react';
import { EmptyState, PageHeader } from '../../ui';

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Construction className="size-5" />} title="Em construção" description="Este módulo está sendo montado." />
    </>
  );
}
