package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/testutil"
)

// TestNotifications_DefaultIsFalse — дефолт нового турнира: оба
// переключателя выключены (спека 0042, FR-19; migrations/00005 задаёт
// NOT NULL DEFAULT FALSE на обеих колонках). На уровне domain/repo-фейка
// это просто нулевое значение NotificationSettings{}.
func TestNotifications_DefaultIsFalse(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.GetActive(context.Background())
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if got.Notifications.ApplicationState || got.Notifications.PoolSeated {
		t.Errorf("Notifications = %+v, want both false", got.Notifications)
	}
}

func TestNotifications_DefaultViaNotificationsFor(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.NotificationsFor(context.Background())
	if err != nil {
		t.Fatalf("NotificationsFor: %v", err)
	}
	if got != (domain.NotificationSettings{}) {
		t.Errorf("NotificationsFor = %+v, want zero value", got)
	}
}

func TestUpdateActive_PersistsNotifications(t *testing.T) {
	svc, _ := testServiceWithActive()

	updated, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "Seeded Cup",
		Notifications: domain.NotificationSettings{
			ApplicationState: true,
			PoolSeated:       true,
		},
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if !updated.Notifications.ApplicationState || !updated.Notifications.PoolSeated {
		t.Errorf("Notifications = %+v, want both true", updated.Notifications)
	}
}

func TestNotificationsFor_ReflectsLatestUpdate(t *testing.T) {
	svc, _ := testServiceWithActive()

	if _, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "Seeded Cup",
		Notifications: domain.NotificationSettings{
			ApplicationState: true,
			PoolSeated:       false,
		},
	}); err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}

	got, err := svc.NotificationsFor(context.Background())
	if err != nil {
		t.Fatalf("NotificationsFor: %v", err)
	}
	if !got.ApplicationState || got.PoolSeated {
		t.Errorf("NotificationsFor = %+v, want {true,false}", got)
	}
}

func TestNotificationsFor_NotFound(t *testing.T) {
	svc := New(testutil.NewFakeRepo(), nil, nil)

	_, err := svc.NotificationsFor(context.Background())
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("err = %v, want domain.ErrNotFound", err)
	}
}
