"use client";

/**
 * Forms post to Server Actions and show the server's reason when something is refused —
 * the same "rejections are surfaced, never silent" rule as the Android hub.
 */
import { createContext, use, useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx, Notice, type ButtonVariant } from "./kit";

export interface FormState {
  ok?: boolean;
  reason?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  at?: number;
}

const FormCtx = createContext<FormState>({});

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  id,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <FormCtx value={state}>
      <form ref={ref} id={id} action={formAction} className={cx("flex flex-col gap-4", className)} noValidate>
        {state.reason && !state.ok && <Notice tone="danger" title={state.reason} />}
        {state.ok && state.message && <Notice tone="success" title={state.message} />}
        {children}
      </form>
    </FormCtx>
  );
}

export function useFieldError(name: string): string | undefined {
  return use(FormCtx).fieldErrors?.[name];
}

export function Submit({ children, variant = "primary", block = true, pendingLabel = "Saving…" }: { children: ReactNode; variant?: ButtonVariant; block?: boolean; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} block={block} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

const inputClass =
  "w-full min-h-[56px] rounded-md border-[1.5px] border-ink bg-surface px-3 text-[18px] outline-none focus:border-[3px] focus:border-green aria-[invalid=true]:border-red aria-[invalid=true]:border-[3px]";

function FieldShell({ name, label, hint, children }: { name: string; label: string; hint?: ReactNode; children: ReactNode }) {
  const error = useFieldError(name);
  return (
    <label className="flex flex-col gap-1" htmlFor={`f-${name}`}>
      <span className="label text-[14px] text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="text-[14px] font-semibold text-red" id={`f-${name}-err`}>
          ✕ {error}
        </span>
      ) : (
        hint && <span className="text-[14px] text-muted">{hint}</span>
      )}
    </label>
  );
}

export function TextField({ name, label, hint, className, ...rest }: ComponentProps<"input"> & { name: string; label: string; hint?: ReactNode }) {
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} hint={hint}>
      <input id={`f-${name}`} name={name} aria-invalid={!!error} aria-describedby={error ? `f-${name}-err` : undefined} className={cx(inputClass, className)} {...rest} />
    </FieldShell>
  );
}

/** Pesos typed as "12,500" or "12500.50"; parsed to centavos on the server. */
export function MoneyField({ name, label, hint, defaultCents, ...rest }: Omit<ComponentProps<"input">, "defaultValue"> & { name: string; label: string; hint?: ReactNode; defaultCents?: number | null }) {
  const error = useFieldError(name);
  const dv = defaultCents === null || defaultCents === undefined ? "" : (defaultCents / 100).toFixed(2).replace(/\.00$/, "");
  return (
    <FieldShell name={name} label={label} hint={hint}>
      <div className="relative">
        <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-muted">₱</span>
        <input
          id={`f-${name}`}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={dv}
          aria-invalid={!!error}
          className={cx(inputClass, "num pl-8")}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export function SelectField({ name, label, hint, children, ...rest }: ComponentProps<"select"> & { name: string; label: string; hint?: ReactNode }) {
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} hint={hint}>
      <select id={`f-${name}`} name={name} aria-invalid={!!error} className={cx(inputClass, "appearance-none bg-[length:12px] pr-8")} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function TextArea({ name, label, hint, ...rest }: ComponentProps<"textarea"> & { name: string; label: string; hint?: ReactNode }) {
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} hint={hint}>
      <textarea id={`f-${name}`} name={name} aria-invalid={!!error} rows={3} className={cx(inputClass, "py-2")} {...rest} />
    </FieldShell>
  );
}

/** Big radio cards — 56px+ targets for thumbs at a site visit. */
export function ChoiceCards({ name, options, defaultValue }: { name: string; options: { value: string; label: string; hint?: string }[]; defaultValue?: string }) {
  const error = useFieldError(name);
  return (
    <fieldset className="flex flex-col gap-2" aria-invalid={!!error}>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-ink bg-surface px-3 py-2 has-[:checked]:border-[3px] has-[:checked]:border-green has-[:checked]:bg-[#e6f3ec]"
        >
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="size-5 accent-[#0f4d3a]" />
          <span>
            <span className="font-semibold">{o.label}</span>
            {o.hint && <span className="block text-[14px] text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
      {error && <span className="text-[14px] font-semibold text-red">✕ {error}</span>}
    </fieldset>
  );
}
