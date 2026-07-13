package domain

import (
	"errors"
	"testing"
)

func TestValidateName(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want error
	}{
		{"non-empty accepted", "Ристалище 1", nil},
		{"trimmed non-empty accepted", "  Ристалище  ", nil},
		{"empty rejected", "", ErrInvalidInput},
		{"whitespace-only rejected", "   ", ErrInvalidInput},
		{"tabs/newlines-only rejected", "\t\n \r", ErrInvalidInput},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ValidateName(c.in)
			if !errors.Is(err, c.want) {
				t.Errorf("ValidateName(%q) = %v, want %v", c.in, err, c.want)
			}
		})
	}
}

func TestStatusConstants(t *testing.T) {
	if StatusActive != "active" {
		t.Errorf("StatusActive = %q, want \"active\"", StatusActive)
	}
	if StatusArchived != "archived" {
		t.Errorf("StatusArchived = %q, want \"archived\"", StatusArchived)
	}
	if StatusActive == StatusArchived {
		t.Errorf("active and archived must differ")
	}
}