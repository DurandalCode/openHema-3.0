package domain_test

import (
	"testing"

	"github.com/hema/server/modules/fighter/domain"
)

func TestNormalizeKey(t *testing.T) {
	cases := []struct {
		name string
		in   [2]string
		want string
	}{
		{
			name: "регистр не важен",
			in:   [2]string{"Иванов Иван", "Сталь"},
			want: domain.NormalizeKey("иванов иван", "сталь"),
		},
		{
			name: "окружающие пробелы срезаются",
			in:   [2]string{"  Иванов Иван  ", "  Сталь "},
			want: domain.NormalizeKey("Иванов Иван", "Сталь"),
		},
		{
			name: "внутренние пробелы схлопываются",
			in:   [2]string{"Иванов    Иван", "Клуб  Стали"},
			want: domain.NormalizeKey("Иванов Иван", "Клуб Стали"),
		},
		{
			name: "табы и переводы строк — тоже пробелы",
			in:   [2]string{"Иванов\tИван", "Клуб\nСтали"},
			want: domain.NormalizeKey("Иванов Иван", "Клуб Стали"),
		},
		{
			name: "пустой клуб — законный ключ",
			in:   [2]string{"Сидоров Сидор", "   "},
			want: domain.NormalizeKey("сидоров сидор", ""),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := domain.NormalizeKey(tc.in[0], tc.in[1]); got != tc.want {
				t.Errorf("NormalizeKey(%q, %q) = %q, want %q", tc.in[0], tc.in[1], got, tc.want)
			}
		})
	}
}

func TestNormalizeKeyDistinguishesNameAndClub(t *testing.T) {
	// Полные тёзки из разных клубов — разные люди (FR-8).
	if domain.NormalizeKey("Иванов Иван", "Сталь") == domain.NormalizeKey("Иванов Иван", "Меч") {
		t.Fatal("бойцы из разных клубов не должны иметь общий ключ")
	}
	// Ключ не должен схлопываться при переносе пробела между полями.
	if domain.NormalizeKey("Иванов", "Иван Сталь") == domain.NormalizeKey("Иванов Иван", "Сталь") {
		t.Fatal("границу между именем и клубом ключ обязан сохранять")
	}
}
