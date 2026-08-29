// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/repo/sqlc"
)

// Repo — адаптер к PostgreSQL для модуля tournament.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// GetActive возвращает активный турнир с контактами и программой по дням.
func (r *Repo) GetActive(ctx context.Context) (domain.Tournament, error) {
	row, err := r.q.GetActiveTournament(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Tournament{}, domain.ErrNotFound
		}
		return domain.Tournament{}, err
	}
	contacts, err := r.q.ListContactsByTournament(ctx, row.ID)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list contacts: %w", err)
	}
	days, err := r.q.ListProgramDaysByTournament(ctx, row.ID)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list program days: %w", err)
	}
	items, err := r.q.ListProgramItemsByTournament(ctx, row.ID)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list program items: %w", err)
	}
	return toDomainFromGet(row, contacts, toDomainProgram(days, items)), nil
}

// UpdateActive атомарно обновляет поля активного турнира и заменяет наборы
// контактов и программы по дням. Замена (delete+insert) для обоих
// выполняется в одной транзакции с обновлением турнира.
func (r *Repo) UpdateActive(ctx context.Context, in domain.UpdateInput) (domain.Tournament, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	row, err := q.UpdateActiveTournament(ctx, sqlc.UpdateActiveTournamentParams{
		Title:                  in.Title,
		Description:            in.Description,
		EventStartAt:           toPgTimestamptz(in.EventStartAt, in.HasEventStartAt),
		EventEndAt:             toPgTimestamptz(in.EventEndAt, in.HasEventEndAt),
		EmblemUrl:              in.EmblemURL,
		ChiefJudge:             in.ChiefJudge,
		RegulationsUrl:         in.RegulationsURL,
		VenueName:              in.VenueName,
		VenueAddress:           in.VenueAddress,
		EntryFeeMinor:          in.EntryFeeMinor,
		EntryFeeCurrency:       in.EntryFeeCurrency,
		NotifyApplicationState: in.Notifications.ApplicationState,
		NotifyPoolSeated:       in.Notifications.PoolSeated,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Tournament{}, domain.ErrNotFound
		}
		return domain.Tournament{}, fmt.Errorf("update tournament: %w", err)
	}

	if err := q.DeleteContactsByTournament(ctx, row.ID); err != nil {
		return domain.Tournament{}, fmt.Errorf("delete contacts: %w", err)
	}

	contacts := make([]sqlc.TournamentContact, 0, len(in.Contacts))
	for i, c := range in.Contacts {
		inserted, err := q.InsertContact(ctx, sqlc.InsertContactParams{
			TournamentID: row.ID,
			Type:         string(c.Type),
			Value:        c.Value,
			Position:     int32(i),
		})
		if err != nil {
			return domain.Tournament{}, fmt.Errorf("insert contact %d: %w", i, err)
		}
		contacts = append(contacts, inserted)
	}

	if err := q.DeleteProgramDaysByTournament(ctx, row.ID); err != nil {
		return domain.Tournament{}, fmt.Errorf("delete program days: %w", err)
	}

	program := make([]domain.ProgramDay, 0, len(in.Program))
	for i, d := range in.Program {
		insertedDay, err := q.InsertProgramDay(ctx, sqlc.InsertProgramDayParams{
			TournamentID: row.ID,
			EventDate:    toPgDate(d.Date),
			Position:     int32(i),
		})
		if err != nil {
			return domain.Tournament{}, fmt.Errorf("insert program day %d: %w", i, err)
		}
		items := make([]domain.ProgramItem, 0, len(d.Items))
		for j, it := range d.Items {
			insertedItem, err := q.InsertProgramItem(ctx, sqlc.InsertProgramItemParams{
				DayID:     insertedDay.ID,
				Position:  int32(j),
				TimeLabel: it.TimeLabel,
				Text:      it.Text,
			})
			if err != nil {
				return domain.Tournament{}, fmt.Errorf("insert program item %d/%d: %w", i, j, err)
			}
			items = append(items, domain.ProgramItem{
				TimeLabel: insertedItem.TimeLabel,
				Text:      insertedItem.Text,
			})
		}
		program = append(program, domain.ProgramDay{
			Date:  insertedDay.EventDate.Time,
			Items: items,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Tournament{}, fmt.Errorf("commit: %w", err)
	}
	return toDomainFromUpdate(row, contacts, program), nil
}

// SetFile записывает новый файл для kind (id/имя/размер) и атомарно
// освобождает ссылку того же вида (FR-34, ADR 0019 п.5). Контакты и
// программу не трогает — только даёт актуальный агрегат в ответ.
func (r *Repo) SetFile(ctx context.Context, kind domain.FileKind, file domain.StoredFile) (domain.Tournament, error) {
	switch kind {
	case domain.FileKindRegulations:
		row, err := r.q.SetRegulationsFile(ctx, sqlc.SetRegulationsFileParams{
			RegulationsFileID:   file.ID,
			RegulationsFileName: file.Name,
			RegulationsFileSize: file.Size,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.Tournament{}, domain.ErrNotFound
			}
			return domain.Tournament{}, fmt.Errorf("set regulations file: %w", err)
		}
		return r.attachAggregate(ctx, row.ID, toDomainFromSetRegulationsFile(row))
	case domain.FileKindEmblem:
		row, err := r.q.SetEmblemFile(ctx, sqlc.SetEmblemFileParams{
			EmblemFileID:   file.ID,
			EmblemFileName: file.Name,
			EmblemFileSize: file.Size,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.Tournament{}, domain.ErrNotFound
			}
			return domain.Tournament{}, fmt.Errorf("set emblem file: %w", err)
		}
		return r.attachAggregate(ctx, row.ID, toDomainFromSetEmblemFile(row))
	default:
		return domain.Tournament{}, domain.ErrInvalidInput
	}
}

// ClearFile обнуляет файл для kind, не трогая ссылку/остальные поля.
func (r *Repo) ClearFile(ctx context.Context, kind domain.FileKind) (domain.Tournament, error) {
	switch kind {
	case domain.FileKindRegulations:
		row, err := r.q.ClearRegulationsFile(ctx)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.Tournament{}, domain.ErrNotFound
			}
			return domain.Tournament{}, fmt.Errorf("clear regulations file: %w", err)
		}
		return r.attachAggregate(ctx, row.ID, toDomainFromClearRegulationsFile(row))
	case domain.FileKindEmblem:
		row, err := r.q.ClearEmblemFile(ctx)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.Tournament{}, domain.ErrNotFound
			}
			return domain.Tournament{}, fmt.Errorf("clear emblem file: %w", err)
		}
		return r.attachAggregate(ctx, row.ID, toDomainFromClearEmblemFile(row))
	default:
		return domain.Tournament{}, domain.ErrInvalidInput
	}
}

// attachAggregate дополняет частично собранный domain.Tournament (из
// узкого file-запроса) контактами и программой по дням — теми же
// запросами, что и GetActive, по id турнира из RETURNING.
func (r *Repo) attachAggregate(ctx context.Context, id uuid.UUID, t domain.Tournament) (domain.Tournament, error) {
	contacts, err := r.q.ListContactsByTournament(ctx, id)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list contacts: %w", err)
	}
	days, err := r.q.ListProgramDaysByTournament(ctx, id)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list program days: %w", err)
	}
	items, err := r.q.ListProgramItemsByTournament(ctx, id)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list program items: %w", err)
	}
	t.Program = toDomainProgram(days, items)
	t.Contacts = make([]domain.Contact, 0, len(contacts))
	for _, c := range contacts {
		t.Contacts = append(t.Contacts, domain.Contact{
			ID:       c.ID.String(),
			Type:     domain.ContactType(c.Type),
			Value:    c.Value,
			Position: c.Position,
		})
	}
	return t, nil
}

// toDomainFromGet отображает sqlc Row (Get) в доменный турнир вместе с
// контактами и программой по дням.
func toDomainFromGet(row sqlc.GetActiveTournamentRow, contacts []sqlc.TournamentContact, program []domain.ProgramDay) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.ChiefJudge, row.RegulationsUrl, row.VenueName, row.VenueAddress,
		row.EntryFeeMinor, row.EntryFeeCurrency,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
		storedFile(row.RegulationsFileID, row.RegulationsFileName, row.RegulationsFileSize),
		storedFile(row.EmblemFileID, row.EmblemFileName, row.EmblemFileSize),
		notificationSettings(row.NotifyApplicationState, row.NotifyPoolSeated),
		contacts, program,
	)
}

// toDomainFromUpdate отображает sqlc Row (Update) в доменный турнир вместе с
// контактами и программой по дням.
func toDomainFromUpdate(row sqlc.UpdateActiveTournamentRow, contacts []sqlc.TournamentContact, program []domain.ProgramDay) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.ChiefJudge, row.RegulationsUrl, row.VenueName, row.VenueAddress,
		row.EntryFeeMinor, row.EntryFeeCurrency,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
		storedFile(row.RegulationsFileID, row.RegulationsFileName, row.RegulationsFileSize),
		storedFile(row.EmblemFileID, row.EmblemFileName, row.EmblemFileSize),
		notificationSettings(row.NotifyApplicationState, row.NotifyPoolSeated),
		contacts, program,
	)
}

// toDomainFromSetRegulationsFile/toDomainFromClearRegulationsFile/
// toDomainFromSetEmblemFile/toDomainFromClearEmblemFile отображают Row
// узких file-запросов. Contacts/Program заполняет attachAggregate после
// вызова — здесь передаётся nil.
func toDomainFromSetRegulationsFile(row sqlc.SetRegulationsFileRow) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.ChiefJudge, row.RegulationsUrl, row.VenueName, row.VenueAddress,
		row.EntryFeeMinor, row.EntryFeeCurrency,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
		storedFile(row.RegulationsFileID, row.RegulationsFileName, row.RegulationsFileSize),
		storedFile(row.EmblemFileID, row.EmblemFileName, row.EmblemFileSize),
		notificationSettings(row.NotifyApplicationState, row.NotifyPoolSeated),
		nil, nil,
	)
}

func toDomainFromClearRegulationsFile(row sqlc.ClearRegulationsFileRow) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.ChiefJudge, row.RegulationsUrl, row.VenueName, row.VenueAddress,
		row.EntryFeeMinor, row.EntryFeeCurrency,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
		storedFile(row.RegulationsFileID, row.RegulationsFileName, row.RegulationsFileSize),
		storedFile(row.EmblemFileID, row.EmblemFileName, row.EmblemFileSize),
		notificationSettings(row.NotifyApplicationState, row.NotifyPoolSeated),
		nil, nil,
	)
}

func toDomainFromSetEmblemFile(row sqlc.SetEmblemFileRow) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.ChiefJudge, row.RegulationsUrl, row.VenueName, row.VenueAddress,
		row.EntryFeeMinor, row.EntryFeeCurrency,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
		storedFile(row.RegulationsFileID, row.RegulationsFileName, row.RegulationsFileSize),
		storedFile(row.EmblemFileID, row.EmblemFileName, row.EmblemFileSize),
		notificationSettings(row.NotifyApplicationState, row.NotifyPoolSeated),
		nil, nil,
	)
}

func toDomainFromClearEmblemFile(row sqlc.ClearEmblemFileRow) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.ChiefJudge, row.RegulationsUrl, row.VenueName, row.VenueAddress,
		row.EntryFeeMinor, row.EntryFeeCurrency,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
		storedFile(row.RegulationsFileID, row.RegulationsFileName, row.RegulationsFileSize),
		storedFile(row.EmblemFileID, row.EmblemFileName, row.EmblemFileSize),
		notificationSettings(row.NotifyApplicationState, row.NotifyPoolSeated),
		nil, nil,
	)
}

// storedFile собирает domain.StoredFile из трёх плоских колонок; пустой id
// означает «файла нет» (domain.StoredFile{}).
func storedFile(id, name string, size int64) domain.StoredFile {
	if id == "" {
		return domain.StoredFile{}
	}
	return domain.StoredFile{ID: id, Name: name, Size: size}
}

func notificationSettings(applicationState, poolSeated bool) domain.NotificationSettings {
	return domain.NotificationSettings{ApplicationState: applicationState, PoolSeated: poolSeated}
}

// toDomainProgram группирует плоские списки дней/пунктов (уже упорядоченные
// SQL-запросом по position) в доменную структуру день→пункты.
func toDomainProgram(days []sqlc.TournamentProgramDay, items []sqlc.TournamentProgramItem) []domain.ProgramDay {
	byDay := make(map[uuid.UUID][]domain.ProgramItem, len(days))
	for _, it := range items {
		byDay[it.DayID] = append(byDay[it.DayID], domain.ProgramItem{
			TimeLabel: it.TimeLabel,
			Text:      it.Text,
		})
	}
	out := make([]domain.ProgramDay, 0, len(days))
	for _, d := range days {
		out = append(out, domain.ProgramDay{
			Date:  d.EventDate.Time,
			Items: byDay[d.ID],
		})
	}
	return out
}

func buildTournament(
	id, title, description string,
	eventStartAt, eventEndAt pgtype.Timestamptz, emblemUrl string,
	chiefJudge, regulationsURL, venueName, venueAddress string,
	entryFeeMinor *int64, entryFeeCurrency string,
	isActive bool, createdAt, updatedAt time.Time,
	regulationsFile, emblemFile domain.StoredFile,
	notifications domain.NotificationSettings,
	contacts []sqlc.TournamentContact,
	program []domain.ProgramDay,
) domain.Tournament {
	out := domain.Tournament{
		ID:               id,
		Title:            title,
		Description:      description,
		EventStartAt:     eventStartAt.Time,
		HasEventStartAt:  eventStartAt.Valid,
		EventEndAt:       eventEndAt.Time,
		HasEventEndAt:    eventEndAt.Valid,
		EmblemURL:        emblemUrl,
		ChiefJudge:       chiefJudge,
		RegulationsURL:   regulationsURL,
		VenueName:        venueName,
		VenueAddress:     venueAddress,
		EntryFeeMinor:    entryFeeMinor,
		EntryFeeCurrency: entryFeeCurrency,
		IsActive:         isActive,
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
		RegulationsFile:  regulationsFile,
		EmblemFile:       emblemFile,
		Notifications:    notifications,
		Contacts:         make([]domain.Contact, 0, len(contacts)),
		Program:          program,
	}
	for _, c := range contacts {
		out.Contacts = append(out.Contacts, domain.Contact{
			ID:       c.ID.String(),
			Type:     domain.ContactType(c.Type),
			Value:    c.Value,
			Position: c.Position,
		})
	}
	return out
}

func toPgTimestamptz(t time.Time, ok bool) pgtype.Timestamptz {
	if !ok {
		return pgtype.Timestamptz{Valid: false}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// toPgDate конвертирует день программы (без временной зоны) в pgtype.Date.
// Дни программы всегда заданы явно (нет "не задан" состояния на уровне
// одного дня — пустая программа выражается пустым срезом UpdateInput.Program).
func toPgDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: t, Valid: true}
}
