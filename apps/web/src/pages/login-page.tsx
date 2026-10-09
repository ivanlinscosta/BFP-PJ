import { ArrowRight, CircleHelp, Search, Users, type LucideIcon } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Field, Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { describeError } from '@/lib/errors';
import { hasAccessToken, login } from '@/services/auth';

/** Local demo profiles (AUTH_MODE=dev only; the password is in the README). */
const DEMO_ACCOUNTS = [
  { email: 'analyst@example.local', name: 'Mariana Souza', team: 'Growth PJ · Analista' },
  { email: 'admin@example.local', name: 'Camila Rocha', team: 'Clientes PJ · Administradora' },
  { email: 'business@example.local', name: 'Rafael Lima', team: 'Onboarding PJ · Negócio' },
];

const HIGHLIGHTS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Search, title: 'Explore seus dados', text: 'Conecte perguntas a novas perspectivas.' },
  { icon: Users, title: 'Entenda seus clientes', text: 'Enxergue necessidades e oportunidades.' },
  {
    icon: ArrowRight,
    title: 'Decida suas próximas ações',
    text: 'Transforme conhecimento em direção.',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const returnTo = searchParams.get('returnTo') ?? '/explorar';

  if (hasAccessToken()) {
    return <Navigate replace to={returnTo} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
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
    <div className="flex min-h-screen flex-col bg-card">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-5 sm:px-12">
        <div className="flex items-center gap-4 sm:gap-12">
          <img alt="Itaú" className="h-12 w-12" height={48} src="/itau-logo.png" width={48} />
          <div>
            <p className="m-0 text-lg leading-tight font-bold text-brand-navy">BFP - PJ</p>
            <p className="m-0 mt-1 text-xs text-ink-soft">Business Friendly Platform</p>
          </div>
        </div>
        <p className="m-0 hidden text-[13px] text-ink-soft sm:block">
          Plataforma de analytics para empresas
        </p>
      </header>

      <main className="grid flex-1 lg:grid-cols-[minmax(0,624px)_minmax(0,1fr)]">
        <section
          aria-label="Sobre a BFP - PJ"
          className="flex flex-col justify-center bg-tint px-4 py-12 sm:px-16"
        >
          <p className="m-0 text-xs font-semibold tracking-wide text-brand-navy uppercase">
            Inteligência para o seu negócio
          </p>
          <p className="m-0 mt-5 text-[32px] leading-[1.4] font-semibold text-brand-navy">
            Dados que aproximam.
            <br />
            Decisões que avançam.
          </p>
          <p className="m-0 mt-5 max-w-[430px] text-sm leading-relaxed text-ink-soft">
            Um espaço para explorar dados, conhecer melhor seus clientes e orientar a próxima
            decisão.
          </p>
          <hr className="my-10 max-w-[496px] border-line" />
          <ul className="m-0 flex list-none flex-col gap-6 p-0">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li className="flex items-center gap-4" key={title}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-card text-brand-navy">
                  <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-brand-navy">{title}</span>
                  <span className="mt-1 block text-[13px] text-ink-soft">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-center justify-center px-4 py-12 sm:px-16">
          <div className="w-full max-w-[432px]">
            <h1 className="m-0 text-[32px] font-semibold text-brand-navy">Acesse a BFP - PJ</h1>
            <p className="m-0 mt-2 text-sm text-ink-soft">
              Entre com suas credenciais ou sua conta corporativa.
            </p>
            <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
              <Field htmlFor="email" label="E-mail corporativo">
                <Input
                  autoComplete="username"
                  className="h-11"
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@empresa.com"
                  required
                  type="email"
                  value={email}
                />
              </Field>
              <Field htmlFor="password" label="Senha">
                <Input
                  autoComplete="current-password"
                  className="h-11"
                  id="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  required
                  type="password"
                  value={password}
                />
              </Field>
              <button
                className="-mt-1 self-end text-[13px] font-semibold text-brand-navy hover:underline"
                onClick={() =>
                  setInfo(
                    'Para redefinir a senha, fale com o administrador da sua empresa na BFP - PJ.',
                  )
                }
                type="button"
              >
                Esqueci minha senha
              </button>
              {error ? (
                <Notice tone="error">
                  {describeError(error).kind === 'unauthorized'
                    ? 'E-mail ou senha inválidos.'
                    : describeError(error).description}
                </Notice>
              ) : null}
              {info ? <Notice tone="info">{info}</Notice> : null}
              <button
                className="h-12 rounded-[var(--radius-control)] bg-brand-orange text-[15px] font-semibold text-white transition-colors hover:bg-brand-orange-hover disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                {pending ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <div className="my-6 flex items-center gap-4 text-xs text-ink-soft">
              <span className="h-px flex-1 bg-line" />
              ou
              <span className="h-px flex-1 bg-line" />
            </div>

            <p className="m-0 text-base font-semibold text-brand-navy">Single Sign-On</p>
            <p className="m-0 mt-1 text-sm text-ink-soft">Use sua conta corporativa.</p>
            <button
              className="mt-4 h-12 w-full rounded-[var(--radius-control)] border border-brand-navy bg-card text-[15px] font-semibold text-brand-navy transition-colors hover:bg-tint"
              onClick={() =>
                setInfo(
                  'O SSO corporativo ainda não está habilitado neste ambiente. Entre com e-mail e senha.',
                )
              }
              type="button"
            >
              Entrar com SSO
            </button>

            <div className="mt-6 flex gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-4">
              <CircleHelp aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
              <div className="text-[13px]">
                <p className="m-0 font-semibold text-ink">Precisa de acesso?</p>
                <p className="m-0 mt-1 leading-relaxed text-ink-soft">
                  Fale com o administrador da sua empresa para solicitar acesso ou obter ajuda com o
                  SSO.
                </p>
              </div>
            </div>

            {import.meta.env.DEV ? (
              <details className="mt-4 text-[13px]">
                <summary className="cursor-pointer text-ink-soft">
                  Perfis de demonstração (ambiente local)
                </summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
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
              </details>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-between gap-4 border-t border-line px-4 py-6 text-xs sm:px-16">
        <span className="text-ink-soft">BFP - PJ · Business Friendly Platform</span>
        <span className="font-semibold text-brand-navy">Itaú Empresas</span>
      </footer>
    </div>
  );
}
