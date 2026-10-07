import { FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { describeError } from '@/lib/errors';
import { hasAccessToken, login } from '@/services/auth';

const DEMO_ACCOUNTS = [
  { email: 'analyst@example.local', name: 'Mariana Souza', team: 'Growth PJ · Analista' },
  { email: 'admin@example.local', name: 'Camila Rocha', team: 'Clientes PJ · Administradora' },
  { email: 'business@example.local', name: 'Rafael Lima', team: 'Onboarding PJ · Negócio' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('analyst@example.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const returnTo = searchParams.get('returnTo') ?? '/explorar';

  if (hasAccessToken()) {
    return <Navigate replace to={returnTo} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login({ email, password });
      navigate(returnTo, { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            alt="Itaú"
            className="h-24 w-24 drop-shadow-sm"
            height={96}
            src="/itau-logo.png"
            width={96}
          />
          <p className="mt-5 text-2xl font-bold text-brand-navy">BFP - PJ</p>
          <p className="mt-1 text-sm text-ink-soft">Business Friendly Platform · Itaú Empresas</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-card p-6">
          <h1 className="m-0 text-2xl font-bold text-brand-navy">Entrar</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Explore, analise e ative dados PJ em um só lugar.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field htmlFor="email" label="E-mail corporativo">
              <Input
                autoComplete="username"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </Field>
            <Field htmlFor="password" label="Senha">
              <Input
                autoComplete="current-password"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </Field>
            {error ? (
              <Notice tone="error">
                {describeError(error).kind === 'unauthorized'
                  ? 'E-mail ou senha inválidos.'
                  : describeError(error).description}
              </Notice>
            ) : null}
            <Button disabled={pending} size="lg" type="submit" variant="primary">
              {pending ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
        <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-card p-4 text-[13px]">
          <p className="font-semibold text-brand-navy">Ambiente de demonstração</p>
          <p className="mt-1 text-ink-soft">
            Dados 100% sintéticos. Escolha um perfil (a senha local está no README):
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => setEmail(account.email)}
                  type="button"
                >
                  <span className="font-semibold text-ink">{account.name}</span>
                  <span className="text-xs text-ink-soft">{account.team}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
