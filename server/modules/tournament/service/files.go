package service

import (
	"bytes"
	"context"

	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/pkg/filestore"
)

// sniffHeadLen — сколько байт начала файла передаётся filestore.Sniff.
// Все сигнатуры белого списка (PDF/PNG/JPEG/WebP) укладываются в 512 байт
// с большим запасом.
const sniffHeadLen = 512

// UploadFile загружает файл заданного вида для активного турнира (спека
// 0042, FR-30/FR-31/FR-32). Тип файла решает filestore.Sniff по содержимому
// (NFR-9), не заявленный вызывающим content_type — заявленное значение в
// сигнатуру метода намеренно не входит, чтобы им не подменили решение.
//
// Порядок операций — put→update→delete (ADR 0019 п.5): сначала новый объект
// кладётся в хранилище, затем запись в БД переключается на него (и
// одновременно освобождает ссылку того же вида), и только потом удаляется
// прежний объект — не наоборот, чтобы никогда не оставить в БД ссылку на
// уже удалённый файл.
func (s *Service) UploadFile(ctx context.Context, kind domain.FileKind, content []byte, fileName string) (domain.Tournament, error) {
	if s.files == nil {
		return domain.Tournament{}, domain.ErrStorageUnavailable
	}

	policy, ok := s.policies[kind]
	if !ok {
		return domain.Tournament{}, domain.ErrUnsupportedFileType
	}

	head := content
	if len(head) > sniffHeadLen {
		head = head[:sniffHeadLen]
	}
	mime, ok := filestore.Sniff(head)
	if !ok || !containsString(policy.AllowedTypes, mime) {
		return domain.Tournament{}, domain.ErrUnsupportedFileType
	}
	if int64(len(content)) > policy.MaxBytes {
		return domain.Tournament{}, domain.ErrFileTooLarge
	}

	current, err := s.repo.GetActive(ctx)
	if err != nil {
		return domain.Tournament{}, err
	}
	prev := fileForKind(current, kind)

	id, err := s.files.Put(ctx, bytes.NewReader(content), filestore.Meta{
		ContentType: mime,
		Size:        int64(len(content)),
	})
	if err != nil {
		return domain.Tournament{}, err
	}

	updated, err := s.repo.SetFile(ctx, kind, domain.StoredFile{
		ID:   id,
		Name: fileName,
		Size: int64(len(content)),
	})
	if err != nil {
		return domain.Tournament{}, err
	}

	if prev.ID != "" {
		_ = s.files.Delete(ctx, prev.ID)
	}
	return updated, nil
}

// DeleteFile удаляет загруженный файл заданного вида (FR-36). Не ошибка
// удалить вид, у которого файла и не было — репозиторий просто оставит поле
// пустым (идемпотентно).
func (s *Service) DeleteFile(ctx context.Context, kind domain.FileKind) (domain.Tournament, error) {
	if kind != domain.FileKindRegulations && kind != domain.FileKindEmblem {
		return domain.Tournament{}, domain.ErrUnsupportedFileType
	}

	current, err := s.repo.GetActive(ctx)
	if err != nil {
		return domain.Tournament{}, err
	}
	prev := fileForKind(current, kind)

	updated, err := s.repo.ClearFile(ctx, kind)
	if err != nil {
		return domain.Tournament{}, err
	}

	if prev.ID != "" && s.files != nil {
		_ = s.files.Delete(ctx, prev.ID)
	}
	return updated, nil
}

// fileForKind возвращает StoredFile турнира, соответствующий kind.
func fileForKind(t domain.Tournament, kind domain.FileKind) domain.StoredFile {
	switch kind {
	case domain.FileKindRegulations:
		return t.RegulationsFile
	case domain.FileKindEmblem:
		return t.EmblemFile
	default:
		return domain.StoredFile{}
	}
}

func containsString(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
