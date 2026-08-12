package domain

import "testing"

// --- Спека 0021: исполнительная ось номинации (PublicStatus) ---

func TestPublicStatus_ExecutionNone_ReturnsStatusOpen(t *testing.T) {
	n := Nomination{Status: StatusOpen, Execution: ExecutionNone}
	if got := n.PublicStatus(); got != StatusOpen {
		t.Errorf("PublicStatus() = %q, want %q", got, StatusOpen)
	}
}

func TestPublicStatus_ExecutionNone_ReturnsStatusClosed(t *testing.T) {
	n := Nomination{Status: StatusClosed, Execution: ExecutionNone}
	if got := n.PublicStatus(); got != StatusClosed {
		t.Errorf("PublicStatus() = %q, want %q", got, StatusClosed)
	}
}

func TestPublicStatus_ExecutionActive_OverridesStatusOpen(t *testing.T) {
	n := Nomination{Status: StatusOpen, Execution: ExecutionActive}
	if got := n.PublicStatus(); got != StatusActive {
		t.Errorf("PublicStatus() = %q, want %q (active wins over open)", got, StatusActive)
	}
}

func TestPublicStatus_ExecutionActive_OverridesStatusClosed(t *testing.T) {
	n := Nomination{Status: StatusClosed, ClosedReason: ClosedReasonManual, Execution: ExecutionActive}
	if got := n.PublicStatus(); got != StatusActive {
		t.Errorf("PublicStatus() = %q, want %q (active wins over closed)", got, StatusActive)
	}
}

func TestPublicStatus_ExecutionFinished_OverridesStatusOpen(t *testing.T) {
	n := Nomination{Status: StatusOpen, Execution: ExecutionFinished}
	if got := n.PublicStatus(); got != StatusFinished {
		t.Errorf("PublicStatus() = %q, want %q (finished wins over open)", got, StatusFinished)
	}
}

func TestPublicStatus_ExecutionFinished_OverridesStatusClosed(t *testing.T) {
	n := Nomination{Status: StatusClosed, ClosedReason: ClosedReasonDrawing, Execution: ExecutionFinished}
	if got := n.PublicStatus(); got != StatusFinished {
		t.Errorf("PublicStatus() = %q, want %q (finished wins over closed)", got, StatusFinished)
	}
}
