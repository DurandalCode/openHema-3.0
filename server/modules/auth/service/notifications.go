package service

import (
	"context"
	"fmt"

	"github.com/hema/server/modules/auth/domain"
)

// UpdateNotificationSettings правит личные переключатели уведомлений
// (FR-20). Выключение видов разрешено всегда; попытка включить вид,
// которого не было включено раньше, при неподтверждённом адресе
// отклоняется (FR-21) — иначе уведомления уходили бы на адрес, которым
// никто не подтвердил владение.
func (s *Service) UpdateNotificationSettings(ctx context.Context, userID string, settings domain.NotificationSettings) (domain.User, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return domain.User{}, err
	}

	if user.EmailVerifiedAt == nil {
		turnsOnApplicationState := settings.ApplicationState && !user.Notifications.ApplicationState
		turnsOnPoolSeated := settings.PoolSeated && !user.Notifications.PoolSeated
		if turnsOnApplicationState || turnsOnPoolSeated {
			return domain.User{}, domain.ErrEmailNotVerified
		}
	}

	updated, err := s.repo.SetNotificationSettings(ctx, userID, settings)
	if err != nil {
		return domain.User{}, fmt.Errorf("set notification settings: %w", err)
	}
	return updated, nil
}

// Recipients — межмодульная точка входа (аналог DisplayNames): по набору
// id и виду уведомления (kind — "application_state" | "pool_seated")
// возвращает map[userID]email только для тех, у кого этот вид включён
// **лично** и адрес **подтверждён**. Глобальный переключатель (принадлежит
// модулю tournament) здесь не проверяется — его читает адаптер-нотификатор
// в internal/platform до вызова этого метода (plan.md, «Межмодульные
// зависимости»).
func (s *Service) Recipients(ctx context.Context, kind string, userIDs []string) (map[string]string, error) {
	if len(userIDs) == 0 {
		return map[string]string{}, nil
	}
	users, err := s.repo.GetUsersByIDs(ctx, userIDs)
	if err != nil {
		return nil, fmt.Errorf("get users by ids: %w", err)
	}
	out := make(map[string]string, len(users))
	for _, u := range users {
		if u.EmailVerifiedAt == nil {
			continue
		}
		var enabled bool
		switch kind {
		case "application_state":
			enabled = u.Notifications.ApplicationState
		case "pool_seated":
			enabled = u.Notifications.PoolSeated
		}
		if enabled {
			out[u.ID] = u.Email
		}
	}
	return out, nil
}
