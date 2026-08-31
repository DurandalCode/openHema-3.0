// Package service — спека 0047: заведение встроенного каталога пресетов
// формата (ADR 0014 §9). SeedBuiltinPresets — бутстрап при старте (FR-6..
// FR-9, по образцу auth.Bootstrap, ADR 0007); RestoreBuiltinPresets —
// явное admin-действие (FR-10). Оба сводятся к одному внутреннему проходу
// по domain.BuiltinPresets(), отличаясь только тем, консультируется ли
// журнал заведения как фильтр пропуска.
package service

import (
	"context"
	"errors"

	"github.com/hema/server/modules/stage/domain"
)

// SeedReport — итог одного прохода по каталогу (FR-6..FR-10): заведённые
// записи целиком (клиент кладёт их в кеш библиотеки без дополнительного
// запроса, план «Контракты») и число пропущенных по занятому имени (FR-9).
type SeedReport struct {
	Restored []domain.FormatPreset
	Skipped  int
}

// SeedBuiltinPresets — заведение каталога при старте (спека 0047, FR-6..
// FR-9): пропускает ключи, уже отмеченные в журнале заведения — однократно
// за жизнь инсталляции, не сверка (FR-7).
func (s *Service) SeedBuiltinPresets(ctx context.Context) (SeedReport, error) {
	seeded, err := s.repo.SeededPresetKeys(ctx)
	if err != nil {
		return SeedReport{}, err
	}
	already := make(map[string]bool, len(seeded))
	for _, k := range seeded {
		already[k] = true
	}
	return s.seedCatalogue(ctx, func(key string) bool { return already[key] })
}

// RestoreBuiltinPresets — явное admin-действие (спека 0047, FR-10):
// пропускает ключи, чей заведённый пресет ЕЩЁ ЖИВ (LiveSeededPresetKeys) —
// это единственно верный фильтр здесь: имя пресета конфликтом не годится,
// потому что переименованная встроенная запись освобождает своё исходное
// имя, и проверка по имени завела бы под ним содержательный дубликат
// (AC-10). Живая (в том числе переименованная) запись не трогается вовсе —
// не восстановлена и не пропущена, отчёт её не считает. Удалённая теряет
// ссылку в журнале и заводится заново, как и на самой первой установке.
func (s *Service) RestoreBuiltinPresets(ctx context.Context) (SeedReport, error) {
	live, err := s.repo.LiveSeededPresetKeys(ctx)
	if err != nil {
		return SeedReport{}, err
	}
	alive := make(map[string]bool, len(live))
	for _, k := range live {
		alive[k] = true
	}
	return s.seedCatalogue(ctx, func(key string) bool { return alive[key] })
}

// seedCatalogue — общий проход по domain.BuiltinPresets(): пропускает ключ
// по skip(key), проверяет исполнимость записи (защита от битой записи
// каталога, NFR-1/NFR-3), пытается завести пресет и отмечает ключ в
// журнале независимо от исхода заведения (заведено или пропущено по
// занятому имени, FR-9) — повторять попытку при каждом старте не нужно
// (FR-9). Любая иная ошибка репозитория прерывает проход и возвращается
// наверх (в бутстрапе — только в лог, NFR-2).
func (s *Service) seedCatalogue(ctx context.Context, skip func(key string) bool) (SeedReport, error) {
	var report SeedReport
	for _, p := range domain.BuiltinPresets() {
		if skip(p.Key) {
			continue
		}
		if err := domain.ValidateFormatSpec(p.Spec); err != nil {
			return SeedReport{}, err
		}
		preset, err := s.repo.InsertFormatPreset(ctx, p.Name, p.Spec)
		var presetID string
		switch {
		case errors.Is(err, domain.ErrPresetNameTaken):
			report.Skipped++
		case err != nil:
			return SeedReport{}, err
		default:
			report.Restored = append(report.Restored, preset)
			presetID = preset.ID
		}
		if err := s.repo.MarkPresetSeeded(ctx, p.Key, presetID); err != nil {
			return SeedReport{}, err
		}
	}
	return report, nil
}
