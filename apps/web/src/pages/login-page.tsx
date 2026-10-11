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

  // Everything fits in one viewport (no page scroll): a compact header and footer and a
  // content area that takes the remaining height; spacing tightens on short screens.
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-card">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-12">
        <div className="flex items-center gap-4 sm:gap-6">
          <img alt="Itaú" className="h-10 w-10" height={40} src="/itau-logo.png" width={40} />
          <div>
            <p className="m-0 text-base leading-tight font-bold text-brand-navy">BFP - PJ</p>
            <p className="m-0 mt-0.5 text-xs text-ink-soft">Business Friendly Platform</p>
          </div>
        </div>
        <p className="m-0 hidden text-[13px] text-ink-soft sm:block">
          Plataforma de analytics para empresas
        </p>
      </header>

      <main className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section
          aria-label="Sobre a BFP - PJ"
          className="hidden min-h-0 flex-col justify-center overflow-hidden bg-tint px-10 py-6 md:flex lg:px-16 [@media(max-height:760px)]:py-4"
        >
          <p className="m-0 text-xs font-semibold tracking-wide text-brand-navy uppercase">
            Inteligência para o seu negócio
          </p>
          <p className="m-0 mt-4 text-[30px] leading-[1.3] font-semibold text-brand-navy [@media(max-height:760px)]:mt-2 [@media(max-height:760px)]:text-[24px]">
            Dados que aproximam.
            <br />
            Decisões que avançam.
          </p>
          <p className="m-0 mt-4 max-w-[430px] text-sm leading-relaxed text-ink-soft [@media(max-height:760px)]:mt-2">
            Um espaço para explorar dados, conhecer melhor seus clientes e orientar a próxima
            decisão.
          </p>
          <hr className="my-7 max-w-[496px] border-line [@media(max-height:760px)]:my-4" />
          <ul className="m-0 flex list-none flex-col gap-5 p-0 [@media(max-height:760px)]:gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li className="flex items-center gap-4" key={title}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-card text-brand-navy [@media(max-height:760px)]:h-8 [@media(max-height:760px)]:w-8">
                  <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-brand-navy">{title}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-soft">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-h-0 items-center justify-center overflow-y-auto px-4 py-6 sm:px-12 [@media(max-height:760px)]:py-3">
          <div className="w-full max-w-[400px]">
            <h1 className="m-0 text-[28px] font-semibold text-brand-navy [@media(max-height:760px)]:text-[24px]">
              Acesse a BFP - PJ
            </h1>
            <p className="m-0 mt-1 text-sm text-ink-soft">
              Entre com suas credenciais ou sua conta corporativa.
            </p>
            <form
              className="mt-6 flex flex-col gap-3 [@media(max-height:760px)]:mt-4"
              onSubmit={handleSubmit}
            >
              <Field htmlFor="email" label="E-mail corporativo">
                <Input
                  autoComplete="username"
                  className="h-10"
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
                  className="h-10"
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
                className="h-11 rounded-[var(--radius-control)] bg-brand-orange text-[15px] font-semibold text-white transition-colors hover:bg-brand-orange-hover disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                {pending ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <div className="my-4 flex items-center gap-4 text-xs text-ink-soft [@media(max-height:760px)]:my-3">
              <span className="h-px flex-1 bg-line" />
              ou use a conta corporativa (Single Sign-On)
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              className="h-11 w-full rounded-[var(--radius-control)] border border-brand-navy bg-card text-[15px] font-semibold text-brand-navy transition-colors hover:bg-tint"
              onClick={() =>
                setInfo(
                  'O SSO corporativo ainda não está habilitado neste ambiente. Entre com e-mail e senha.',
                )
              }
              type="button"
            >
              Entrar com SSO
            </button>

            <p className="m-0 mt-4 flex items-start gap-2 text-[13px] leading-snug text-ink-soft [@media(max-height:760px)]:mt-3">
              <CircleHelp aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold text-ink">Precisa de acesso?</span> Fale com o
                administrador da sua empresa.
              </span>
            </p>

            {import.meta.env.DEV ? (
              <details className="mt-3 text-[13px]">
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

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-line px-4 py-3 text-xs sm:px-12">
        <span className="text-ink-soft">BFP - PJ · Business Friendly Platform</span>
        <span className="font-semibold text-brand-navy">Itaú Empresas</span>
      </footer>
    </div>
  );
}
