import { passwordHint } from "@/entities/user/lib/password";

/**
 * PasswordHint — минимальная визуализация passwordHint (FR-6): текстовая
 * подсказка о правиле длины + трёхсегментный индикатор уровня. Без
 * словарей/энтропии — level считает ровно ту же длину, что и текст.
 */
export function PasswordHint({ value }: { value: string }) {
  const hint = passwordHint(value);

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((segment) => (
          <span
            key={segment}
            className={
              "h-1 w-6 rounded-full " +
              (segment < hint.level
                ? hint.ok
                  ? "bg-success"
                  : "bg-destructive"
                : "bg-border")
            }
          />
        ))}
      </div>
      {hint.text && (
        <p className="text-xs text-caption-foreground">{hint.text}</p>
      )}
    </div>
  );
}
