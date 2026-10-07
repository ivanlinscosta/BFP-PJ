import { Link } from 'react-router';
import { EmptyState } from '@/components/states/states';

export function NotFoundPage() {
  return (
    <EmptyState
      action={
        <Link className="text-sm font-semibold text-brand-navy hover:underline" to="/explorar">
          Voltar para Explorar
        </Link>
      }
      description="O endereço pode estar incorreto ou a página foi movida."
      title="Página não encontrada"
    />
  );
}
