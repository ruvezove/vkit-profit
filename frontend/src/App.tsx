import { useEffect, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BookOpen, Check, MessageSquareText, Sparkles, Target, UsersRound, Workflow } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AnimatedIcon } from "@/components/animated-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollProgress } from "@/components/scroll-progress";
import { AdminLoginPage, AdminPage, ForgotPasswordPage, LoginPage, RegisterPage, VerifyEmailPage } from "@/pages/auth-pages";

const features = [
  { icon: BookOpen, eyebrow: "Курсы", title: "Материал, который ведёт вперёд", text: "Собирайте уроки в понятные маршруты и сохраняйте контекст обучения в одном месте." },
  { icon: Target, eyebrow: "Тесты", title: "Проверка без лишнего давления", text: "Быстрая обратная связь показывает сильные стороны и помогает выбрать следующий шаг." },
  { icon: UsersRound, eyebrow: "Команды", title: "Прогресс виден всей группе", text: "Ученики, наставники и администраторы работают в общем ритме и не теряют договорённости." },
];

const faq = [
  ["Для кого создан Profit Hub?", "Для учебных команд, наставников и учеников, которым нужен единый рабочий контур для курсов, тестов и совместной работы."],
  ["Можно ли начать с небольшой группы?", "Да. Архитектура платформы подходит для пилотной команды и готова расти вместе с учебной программой."],
  ["Как учитывается обратная связь?", "Комментарии, пожелания и обращения проходят модерацию. Одобренные комментарии могут появляться на главной странице."],
];

type Comment = { id: string; authorName: string; message: string };
type SubmissionKind = "comments" | "requests" | "wishes";

function FeedbackForm({ kind, onSent }: { kind: SubmissionKind; onSent: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const labels = {
    comments: ["Поделиться впечатлением", "Комментарий попадёт на главную после модерации."],
    requests: ["Сообщить о проблеме", "Опишите, что пошло не так — обращение увидит администратор."],
    wishes: ["Предложить идею", "Расскажите, что сделает Profit Hub полезнее для вашей команды."],
  } as const;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authorName: form.get("authorName"), contact: form.get("contact"), message: form.get("message") }),
    }).catch(() => null);
    if (response?.ok) {
      setState("sent");
      event.currentTarget.reset();
      onSent();
    } else setState("error");
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <DialogHeader><DialogTitle>{labels[kind][0]}</DialogTitle><DialogDescription>{labels[kind][1]}</DialogDescription></DialogHeader>
      <div className="grid gap-2"><Label htmlFor={`${kind}-name`}>Имя</Label><Input id={`${kind}-name`} name="authorName" minLength={2} maxLength={80} required autoComplete="name" /></div>
      <div className="grid gap-2"><Label htmlFor={`${kind}-contact`}>Контакт <span className="text-muted-foreground">(необязательно)</span></Label><Input id={`${kind}-contact`} name="contact" maxLength={160} autoComplete="email" /></div>
      <div className="grid gap-2"><Label htmlFor={`${kind}-message`}>Сообщение</Label><Textarea id={`${kind}-message`} name="message" minLength={10} maxLength={2000} required /></div>
      {state === "sent" && <p className="flex items-center gap-2 text-sm text-success"><Check className="size-4" /> Отправлено на модерацию.</p>}
      {state === "error" && <p role="alert" className="text-sm text-destructive">Не удалось отправить. Попробуйте ещё раз.</p>}
      <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Отправляем…" : "Отправить"}</Button>
    </form>
  );
}

function LandingPage() {
  const reduceMotion = useReducedMotion();
  const [comments, setComments] = useState<Comment[]>([]);
  const [notice, setNotice] = useState(0);

  useEffect(() => {
    fetch("/api/comments").then((response) => response.ok ? response.json() : { comments: [] }).then((data) => setComments(data.comments ?? [])).catch(() => setComments([]));
  }, [notice]);

  const enter = reduceMotion ? {} : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-10%" }, transition: { duration: 0.55 } };

  return (
    <div className="min-h-screen overflow-clip bg-background text-foreground">
      <ScrollProgress />
      <header className="sticky top-0 z-header border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="container-page flex h-18 items-center justify-between">
          <a href="#top" className="font-heading text-xl font-semibold tracking-tight" aria-label="Profit Hub — на главную">Profit<span className="text-primary">/</span>Hub</a>
          <nav className="font-label hidden items-center gap-7 text-sm md:flex" aria-label="Основная навигация">
            <a className="nav-link" href="#possibilities">Возможности</a><a className="nav-link" href="#process">Как это работает</a><a className="nav-link" href="#feedback">Обратная связь</a>
          </nav>
          <Button asChild size="sm"><a href="/login">Войти <ArrowRight className="size-4" /></a></Button>
        </div>
      </header>

      <main id="top">
        <section className="relative border-b border-border">
          <div className="grid-field absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="container-page relative grid min-h-hero items-center gap-12 py-section lg:grid-cols-hero">
            <motion.div className="max-w-copy" initial={reduceMotion ? undefined : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
              <p className="eyebrow mb-5"><Sparkles className="size-4" /> Учиться вместе — проще</p>
              <h1 className="text-display font-semibold text-balance">Место, где знания становятся <span className="text-primary">общим движением</span></h1>
              <p className="mt-6 max-w-prose text-body-lg text-muted-foreground">Курсы, тесты и командная работа собраны в спокойной, понятной среде. Каждый видит цель, прогресс и следующий шаг.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button size="lg" asChild><a href="/register">Создать аккаунт <ArrowRight className="size-5" /></a></Button><Button size="lg" variant="outline" asChild><a href="/login">Войти</a></Button></div>
            </motion.div>
            <motion.div className="relative mx-auto w-full max-w-visual" initial={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.12 }}>
              <div className="orbit-panel aspect-square rounded-full border border-border bg-card p-8 shadow-lift">
                <div className="flex size-full flex-col items-center justify-center rounded-full border border-dashed border-primary/40 bg-secondary text-center">
                  <span className="font-code text-label text-primary">01 — 04</span><strong className="mt-3 font-heading text-h2">Общий ритм</strong><span className="mt-2 max-w-caption text-sm text-muted-foreground">от первого урока до уверенного результата</span>
                </div>
              </div>
              <div className="absolute -bottom-3 left-2 rounded-2xl border border-border bg-background p-4 shadow-soft"><span className="font-code text-sm">+24%</span><p className="mt-1 text-xs text-muted-foreground">ясности в процессе</p></div>
            </motion.div>
          </div>
        </section>

        <section id="possibilities" className="container-page py-section">
          <motion.div {...enter} className="section-heading"><p className="eyebrow">Всё связано</p><h2 className="text-h1 font-semibold">Одна среда — три опоры обучения</h2><p>Без переключений между разрозненными сервисами и потерянного контекста.</p></motion.div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {features.map((feature, index) => <motion.div key={feature.title} {...enter} transition={{ duration: 0.5, delay: reduceMotion ? 0 : index * 0.08 }}><Card className="h-full transition-transform duration-slow hover:-translate-y-1"><CardHeader><div className="mb-6 flex items-center justify-between"><span className="icon-shell"><AnimatedIcon icon={feature.icon} /></span><span className="font-code text-label text-muted-foreground">0{index + 1}</span></div><p className="eyebrow">{feature.eyebrow}</p><CardTitle>{feature.title}</CardTitle></CardHeader><CardContent><CardDescription className="text-base leading-relaxed">{feature.text}</CardDescription></CardContent></Card></motion.div>)}
          </div>
        </section>

        <section id="process" className="border-y border-border bg-secondary/60">
          <div className="container-page grid gap-12 py-section lg:grid-cols-process">
            <motion.div {...enter}><p className="eyebrow"><Workflow className="size-4" /> Понятный процесс</p><h2 className="mt-4 text-h1 font-semibold">От материала к результату — без разрывов</h2><p className="mt-5 text-muted-foreground">Наставник задаёт направление, команда проходит путь, а платформа сохраняет темп и обратную связь.</p></motion.div>
            <ol className="grid gap-3">
              {["Соберите курс из последовательных шагов", "Проверьте понимание короткими тестами", "Обсудите результат и скорректируйте маршрут"].map((item, index) => <motion.li {...enter} key={item} className="flex items-center gap-5 rounded-2xl border border-border bg-background p-5"><span className="font-code flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{index + 1}</span><span className="font-label font-medium">{item}</span></motion.li>)}
            </ol>
          </div>
        </section>

        <section id="feedback" className="container-page py-section">
          <motion.div {...enter} className="section-heading"><p className="eyebrow"><MessageSquareText className="size-4" /> Голос команды</p><h2 className="text-h1 font-semibold">Платформа растёт вместе с вами</h2><p>Одобренные отзывы появляются здесь, а обращения и идеи отправляются напрямую администратору.</p></motion.div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {(comments.length ? comments.slice(0, 4) : [{ id: "intro", authorName: "Команда Profit Hub", message: "Здесь скоро появятся первые отзывы участников. Оставьте свой — после модерации он станет частью этой страницы." }]).map((comment) => <Card key={comment.id}><CardContent className="pt-6"><p className="text-body-lg leading-relaxed">«{comment.message}»</p><p className="font-label mt-5 text-sm font-semibold text-primary">{comment.authorName}</p></CardContent></Card>)}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {(["comments", "requests", "wishes"] as const).map((kind, index) => <Dialog key={kind}><DialogTrigger asChild><Button variant={index === 0 ? "default" : "outline"}>{["Оставить отзыв", "Сообщить о проблеме", "Предложить идею"][index]}</Button></DialogTrigger><DialogContent><FeedbackForm kind={kind} onSent={() => setNotice((value) => value + 1)} /></DialogContent></Dialog>)}
          </div>
        </section>

        <section className="container-page pb-section"><div className="grid gap-10 border-t border-border pt-section lg:grid-cols-process"><div><p className="eyebrow">Коротко о главном</p><h2 className="mt-4 text-h2 font-semibold">Вопросы до старта</h2></div><Accordion type="single" collapsible>{faq.map(([question, answer], index) => <AccordionItem value={`item-${index}`} key={question}><AccordionTrigger>{question}</AccordionTrigger><AccordionContent>{answer}</AccordionContent></AccordionItem>)}</Accordion></div></section>

        <section id="start" className="border-t border-border bg-primary text-primary-foreground"><div className="container-page flex flex-col items-start justify-between gap-8 py-14 md:flex-row md:items-center"><div><p className="font-label text-sm font-semibold opacity-80">Готовы собрать обучение в одном месте?</p><h2 className="mt-2 text-h2 font-semibold">Начните с общей цели.</h2></div><Button variant="secondary" size="lg" asChild><a href="/register">Зарегистрироваться <ArrowRight className="size-5" /></a></Button></div></section>
      </main>

      <footer className="border-t border-border"><div className="container-page flex flex-col gap-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between"><span className="font-heading font-semibold text-foreground">Profit/Hub</span><p>Курсы, тесты и командная работа в общем ритме.</p><a className="nav-link" href="#top">Наверх ↑</a></div></footer>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;
  if (path === "/verify-email") return <VerifyEmailPage />;
  if (path === "/forgot-password") return <ForgotPasswordPage />;
  if (path === "/admin-login") return <AdminLoginPage />;
  if (path === "/admin") return <AdminPage />;
  return <LandingPage />;
}

