// Package codegen держит инварианты конфигурации кодогенерации. Пакет
// тест-онли: собственного кода у него нет, он стережёт файлы рядом.
package codegen

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

// bufGenConfig — минимальная проекция proto/buf.gen.yaml. Нас интересует
// ровно одно: ЧЕМ исполняется плагин, а не что он генерирует.
type bufGenConfig struct {
	Plugins []struct {
		// Remote — исполнение на стороне buf.build (BSR). Ровно то, что
		// сломало деплой: см. docs/specs/0050-local-codegen-plugins.
		Remote string `yaml:"remote"`
		// Local — локальный бинарь (в образе кодгена он лежит в PATH).
		Local yaml.Node `yaml:"local"`
		Out   string    `yaml:"out"`
	} `yaml:"plugins"`
}

// TestBufGenConfig_NoRemotePlugins — страж ADR 0023.
//
// Удалённое исполнение плагинов делает генерацию зависимой от доступности
// buf.build, а с адреса препрод-ВМ он отдаёт 403 Forbidden на любой запрос —
// то есть `make deploy` там не проходит дальше первого шага. Плагины обязаны
// быть локальными; средой их исполнения служит образ deploy/codegen.Dockerfile.
func TestBufGenConfig_NoRemotePlugins(t *testing.T) {
	path := filepath.Join("..", "..", "..", "proto", "buf.gen.yaml")

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("читаю %s: %v", path, err)
	}

	var cfg bufGenConfig
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("разбираю %s: %v", path, err)
	}

	if len(cfg.Plugins) == 0 {
		t.Fatalf("%s: не нашёл ни одного плагина — конфигурация кодгена сломана", path)
	}

	for i, p := range cfg.Plugins {
		if p.Remote != "" {
			t.Errorf(
				"%s: плагин #%d объявлен как remote: %q.\n"+
					"Удалённое исполнение плагинов запрещено: buf.build отдаёт 403 Forbidden\n"+
					"с адреса препрод-ВМ, и генерация (а с ней и `make deploy`) там не проходит.\n"+
					"Используй local-плагин из образа кодгена — см. docs/adr/0023-local-codegen-plugins.md",
				path, i, p.Remote,
			)
			continue
		}
		if p.Local.IsZero() {
			t.Errorf(
				"%s: у плагина #%d (out: %q) не задан local — непонятно, чем он исполняется",
				path, i, p.Out,
			)
		}
	}
}
