import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import type { AdminUser } from "../api/requests";

type RowAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

/** UserRow — строка списка пользователя/админа: email, имя, роль, опциональный action. */
export function UserRow({
  user,
  action,
}: {
  user: AdminUser;
  action?: RowAction;
}) {
  return (
    <Row
      align="center"
      justify="between"
      className="rounded-md border border-border/60 px-3 py-2 text-sm"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{user.email}</div>
        <Row align="center" gap={2} className="text-muted-foreground">
          <span className="truncate">{user.displayName || "—"}</span>
          <Badge variant="secondary" className="font-normal">
            {user.role}
          </Badge>
        </Row>
      </div>
      {action && (
        <Button
          size="sm"
          variant="outline"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </Row>
  );
}
