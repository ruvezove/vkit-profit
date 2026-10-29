import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ApiError = { message?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as ApiError)?.message ?? "Не удалось выполнить запрос.");
  return body as T;
}

function navigate(path: string) {
  window.location.assign(path);
}

function PasswordField({ id, name, label, autoComplete = "current-password" }: { id: string; name: string; label: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} name={name} type={visible ? "text" : "password"} minLength={12} maxLength={128} autoComplete={autoComplete} required className="pr-12" />
        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Скрыть пароль" : "Показать пароль"}>
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return <div className="flex gap-2" aria-label={`Шаг ${current + 1} из ${total}`}>{Array.from({ length: total }, (_, index) => <span key={index} className={index <= current ? "h-1.5 w-8 rounded-full bg-primary" : "h-1.5 w-8 rounded-full bg-border"} />)}</div>;
}

function AuthShell({ children, adminLink = true }: { children: ReactNode; adminLink?: boolean }) {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <a href="/" className="font-heading text-xl font-semibold">Profit<span className="text-primary">/</span>Hub</a>
        <div className="max-w-copy">
          <p className="eyebrow"><ShieldCheck className="size-4" /> Защищённый доступ</p>
          <h1 className="mt-5 text-h1 font-semibold text-balance">Ваш учебный маршрут начинается здесь</h1>
          <p className="mt-5 text-body-lg text-muted-foreground">Войдите в общий ритм команды: курсы, тесты и прогресс будут ждать вас в одном месте.</p>
        </div>
        <p className="text-sm text-muted-foreground">Profit Hub · обучение в общем ритме</p>
      </section>
      <section className="auth-content">
        <div className="w-full max-w-auth">
          <Button variant="ghost" size="sm" asChild className="mb-5"><a href="/"><ArrowLeft className="size-4" /> На главную</a></Button>
          {children}
        </div>
        {adminLink && <a className="auth-admin-link" href="/admin-login">Войти как администратор</a>}
      </section>
    </main>
  );
}

function FormError({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p> : null;
}

export function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }) });
      navigate("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка входа."); } finally { setLoading(false); }
  }
  return <AuthShell><Card><CardHeader><span className="icon-shell mb-3"><UserRound className="size-5" /></span><CardTitle className="text-h2">Вход в аккаунт</CardTitle><CardDescription>Используйте почту или логин и установленный пароль.</CardDescription></CardHeader><CardContent><form className="grid gap-5" onSubmit={submit}><div className="grid gap-2"><Label htmlFor="identifier">Почта или логин</Label><Input id="identifier" name="identifier" autoComplete="username" required /></div><PasswordField id="login-password" name="password" label="Пароль" /><div className="flex justify-end"><a href="/forgot-password" className="font-label text-sm text-primary hover:underline">Забыли пароль?</a></div><FormError message={error} /><Button size="lg" disabled={loading}>{loading ? "Входим…" : "Войти"}<ArrowRight className="size-4" /></Button><p className="text-center text-sm text-muted-foreground">Нет аккаунта? <a className="font-label font-semibold text-primary hover:underline" href="/register">Зарегистрироваться</a></p></form></CardContent></Card></AuthShell>;
}

export function RegisterPage() {
  const [step, setStep] = useState(0);
  const [registrationId, setRegistrationId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true); const data = new FormData(event.currentTarget);
    try { const result = await api<{ registrationId: string }>("/api/auth/register/start", { method: "POST", body: JSON.stringify({ surname: data.get("surname"), givenName: data.get("givenName"), patronymic: data.get("patronymic"), login: data.get("login"), password: data.get("password") }) }); setRegistrationId(result.registrationId); setStep(1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка регистрации."); } finally { setLoading(false); }
  }
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true); const data = new FormData(event.currentTarget);
    try { await api("/api/auth/register/complete", { method: "POST", body: JSON.stringify({ registrationId, email: data.get("email"), password: data.get("password") }) }); setStep(2); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отправить письмо."); } finally { setLoading(false); }
  }
  return <AuthShell><Card><CardHeader><StepDots current={step} total={3} /><CardTitle className="mt-4 text-h2">{step === 0 ? "Создание аккаунта" : step === 1 ? "Подтвердите данные" : "Проверьте Gmail"}</CardTitle><CardDescription>{step === 0 ? "Укажите данные ученика и придумайте логин." : step === 1 ? "Введите настоящую Gmail-почту и повторите установленный пароль." : "Мы отправили ссылку подтверждения. Она действует 5 минут."}</CardDescription></CardHeader><CardContent>{step === 0 && <form className="grid gap-4" onSubmit={start}><div className="auth-name-grid"><div className="grid gap-2"><Label htmlFor="surname">Фамилия</Label><Input id="surname" name="surname" autoComplete="family-name" required /></div><div className="grid gap-2"><Label htmlFor="given-name">Имя</Label><Input id="given-name" name="givenName" autoComplete="given-name" required /></div></div><div className="grid gap-2"><Label htmlFor="patronymic">Отчество</Label><Input id="patronymic" name="patronymic" required /></div><div className="grid gap-2"><Label htmlFor="register-login">Логин</Label><Input id="register-login" name="login" minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" autoComplete="username" required /><p className="text-xs text-muted-foreground">Латинские буквы, цифры, точка, дефис или подчёркивание.</p></div><PasswordField id="register-password" name="password" label="Пароль" autoComplete="new-password" /><FormError message={error} /><Button size="lg" disabled={loading}>{loading ? "Сохраняем…" : "Продолжить"}<ArrowRight className="size-4" /></Button></form>}{step === 1 && <form className="grid gap-5" onSubmit={complete}><div className="grid gap-2"><Label htmlFor="register-email">Gmail-почта</Label><Input id="register-email" name="email" type="email" pattern="[^@\s]+@gmail\.com" placeholder="name@gmail.com" autoComplete="email" required /></div><PasswordField id="confirm-password" name="password" label="Повторите установленный пароль" autoComplete="current-password" /><FormError message={error} /><Button size="lg" disabled={loading}>{loading ? "Отправляем…" : "Отправить ссылку"}<Mail className="size-4" /></Button><Button type="button" variant="ghost" onClick={() => { setStep(0); setError(""); }}><ArrowLeft className="size-4" /> Назад</Button></form>}{step === 2 && <div className="grid gap-5 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success"><Mail className="size-6" /></span><p className="text-muted-foreground">Откройте письмо от Profit Hub и перейдите по ссылке. После подтверждения вход не будет выполнен автоматически.</p><Button variant="outline" asChild><a href="/login">Перейти ко входу</a></Button></div>}</CardContent></Card></AuthShell>;
}

export function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<"loading" | "success" | "error">(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "В ссылке отсутствует токен подтверждения.");
  useEffect(() => {
    if (!token) return;
    api<{ verified: boolean }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`).then(() => setState("success")).catch((reason) => { setState("error"); setMessage(reason instanceof Error ? reason.message : "Ссылка недействительна."); });
  }, [token]);
  return <AuthShell><Card><CardHeader><span className="icon-shell mb-3">{state === "success" ? <Check className="size-5" /> : <Mail className="size-5" />}</span><CardTitle className="text-h2">{state === "loading" ? "Проверяем ссылку…" : state === "success" ? "Почта подтверждена" : "Не удалось подтвердить почту"}</CardTitle><CardDescription>{state === "success" ? "Аккаунт готов, но вход ещё не выполнен. Войдите по новому логину или почте и паролю." : message}</CardDescription></CardHeader>{state !== "loading" && <CardContent><Button className="w-full" size="lg" asChild><a href={state === "success" ? "/login" : "/register"}>{state === "success" ? "Войти в аккаунт" : "Начать регистрацию заново"}<ArrowRight className="size-4" /></a></Button></CardContent>}</Card></AuthShell>;
}

export function ForgotPasswordPage() {
  const [step, setStep] = useState(0); const [identifier, setIdentifier] = useState(""); const [challenge, setChallenge] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function requestCode(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setLoading(true); const data = new FormData(event.currentTarget); const value = String(data.get("identifier")); try { await api("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ identifier: value }) }); setIdentifier(value); setStep(1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отправить код."); } finally { setLoading(false); } }
  async function verifyCode(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setLoading(true); const data = new FormData(event.currentTarget); try { const result = await api<{ challenge: string }>("/api/auth/password-reset/verify-code", { method: "POST", body: JSON.stringify({ identifier, code: data.get("code") }) }); setChallenge(result.challenge); setStep(2); } catch (reason) { setError(reason instanceof Error ? reason.message : "Неверный код."); } finally { setLoading(false); } }
  function savePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setPassword(String(data.get("password"))); setError(""); setStep(3); }
  async function confirmPassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setLoading(true); const data = new FormData(event.currentTarget); try { await api("/api/auth/password-reset/complete", { method: "POST", body: JSON.stringify({ challenge, password, passwordConfirmation: data.get("passwordConfirmation") }) }); navigate("/login"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить пароль."); } finally { setLoading(false); } }
  const titles = ["Восстановление пароля", "Введите код", "Новый пароль", "Повторите пароль"];
  return <AuthShell><Card><CardHeader><StepDots current={step} total={4} /><span className="icon-shell mt-4"><KeyRound className="size-5" /></span><CardTitle className="text-h2">{titles[step]}</CardTitle><CardDescription>{step === 0 ? "Укажите почту или логин. Мы отправим шестизначный код на подтверждённую Gmail-почту." : step === 1 ? "Код из письма действует 5 минут." : step === 2 ? "Придумайте новый надёжный пароль." : "Введите новый пароль ещё раз для подтверждения."}</CardDescription></CardHeader><CardContent>{step === 0 && <form className="grid gap-5" onSubmit={requestCode}><div className="grid gap-2"><Label htmlFor="reset-identifier">Почта или логин</Label><Input id="reset-identifier" name="identifier" required /></div><FormError message={error} /><Button size="lg" disabled={loading}>{loading ? "Отправляем…" : "Отправить код"}<Mail className="size-4" /></Button></form>}{step === 1 && <form className="grid gap-5" onSubmit={verifyCode}><div className="grid gap-2"><Label htmlFor="reset-code">Код подтверждения</Label><Input id="reset-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="font-code text-center text-h3 tracking-widest" required /></div><FormError message={error} /><Button size="lg" disabled={loading}>Проверить код<ArrowRight className="size-4" /></Button></form>}{step === 2 && <form className="grid gap-5" onSubmit={savePassword}><PasswordField id="new-password" name="password" label="Новый пароль" autoComplete="new-password" /><FormError message={error} /><Button size="lg">Продолжить<ArrowRight className="size-4" /></Button></form>}{step === 3 && <form className="grid gap-5" onSubmit={confirmPassword}><PasswordField id="new-password-confirm" name="passwordConfirmation" label="Повторите новый пароль" autoComplete="new-password" /><FormError message={error} /><Button size="lg" disabled={loading}>{loading ? "Сохраняем…" : "Сохранить пароль"}<Check className="size-4" /></Button></form>}</CardContent></Card></AuthShell>;
}

export function AdminLoginPage() {
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setLoading(true); const data = new FormData(event.currentTarget); try { await api("/api/auth/admin/login", { method: "POST", body: JSON.stringify({ login: data.get("login"), password: data.get("password") }) }); navigate("/admin"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка входа."); } finally { setLoading(false); } }
  return <AuthShell adminLink={false}><Card><CardHeader><span className="icon-shell mb-3"><LockKeyhole className="size-5" /></span><CardTitle className="text-h2">Вход администратора</CardTitle><CardDescription>Закрытый раздел управления Profit Hub.</CardDescription></CardHeader><CardContent><form className="grid gap-5" onSubmit={submit}><div className="grid gap-2"><Label htmlFor="admin-login">Логин</Label><Input id="admin-login" name="login" autoComplete="username" required /></div><PasswordField id="admin-password" name="password" label="Пароль" /><FormError message={error} /><Button size="lg" disabled={loading}>{loading ? "Проверяем…" : "Войти в панель"}<ShieldCheck className="size-4" /></Button><a className="text-center text-sm text-muted-foreground hover:text-primary" href="/login">Вернуться ко входу ученика</a></form></CardContent></Card></AuthShell>;
}

export function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { api<{ authenticated: boolean; role?: string }>("/api/auth/session").then((session) => { if (!session.authenticated || session.role !== "admin") navigate("/admin-login"); else setAllowed(true); }).catch(() => navigate("/admin-login")); }, []);
  async function logout() { await api("/api/auth/logout", { method: "POST" }); navigate("/admin-login"); }
  if (!allowed) return <main className="grid min-h-screen place-items-center bg-background"><p className="text-muted-foreground">Проверяем доступ…</p></main>;
  return <main className="min-h-screen bg-background"><header className="border-b border-border"><div className="container-page flex h-18 items-center justify-between"><span className="font-heading text-xl font-semibold">Profit<span className="text-primary">/</span>Hub · Admin</span><Button variant="outline" size="sm" onClick={logout}>Выйти</Button></div></header><section className="container-page grid min-h-admin place-items-center py-section text-center"><div><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><ShieldCheck className="size-6" /></span><h1 className="mt-5 text-h2 font-semibold">Админ-панель готова</h1><p className="mt-3 text-muted-foreground">Разделы управления появятся в следующих обновлениях.</p></div></section></main>;
}

