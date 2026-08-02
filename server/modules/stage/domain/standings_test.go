package domain_test

import (
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

func fighter(id string) domain.FighterRef {
	return domain.FighterRef{ID: id, Name: "Fighter " + id}
}

func finishedBout(a, b domain.FighterRef, scoreA, scoreB int) domain.BoutRef {
	return domain.BoutRef{
		ID:       a.ID + "-" + b.ID,
		FighterA: a,
		FighterB: b,
		State:    domain.BoutStateFinished,
		ScoreA:   scoreA,
		ScoreB:   scoreB,
	}
}

func TestComputeStandings_NoFinishedBouts(t *testing.T) {
	members := []domain.FighterRef{fighter("a"), fighter("b")}
	notStarted := domain.BoutRef{
		ID: "a-b", FighterA: members[0], FighterB: members[1],
		State: domain.BoutStateNotStarted,
	}
	inProgress := domain.BoutRef{
		ID: "a-b2", FighterA: members[0], FighterB: members[1],
		State: domain.BoutStateInProgress, ScoreA: 3, ScoreB: 1,
	}

	got := domain.ComputeStandings(members, []domain.BoutRef{notStarted, inProgress})

	if len(got) != 0 {
		t.Fatalf("expected empty standings (FR-7), got %+v", got)
	}
}

func TestComputeStandings_SingleFinishedBout_WinLoss(t *testing.T) {
	a, b := fighter("a"), fighter("b")
	members := []domain.FighterRef{a, b}
	bouts := []domain.BoutRef{finishedBout(a, b, 5, 2)}

	got := domain.ComputeStandings(members, bouts)

	byID := standingsByID(t, got)
	winner := byID["a"]
	if winner.Wins != 1 || winner.Losses != 0 || winner.Draws != 0 {
		t.Fatalf("winner stats: %+v", winner)
	}
	if winner.PointsScored != 5 || winner.PointsConceded != 2 {
		t.Fatalf("winner points: %+v", winner)
	}
	loser := byID["b"]
	if loser.Wins != 0 || loser.Losses != 1 || loser.Draws != 0 {
		t.Fatalf("loser stats: %+v", loser)
	}
	if loser.PointsScored != 2 || loser.PointsConceded != 5 {
		t.Fatalf("loser points: %+v", loser)
	}
	if winner.Place != 1 || loser.Place != 2 {
		t.Fatalf("places: winner=%d loser=%d", winner.Place, loser.Place)
	}
}

func TestComputeStandings_Draw_NoWinNoLoss(t *testing.T) {
	a, b := fighter("a"), fighter("b")
	members := []domain.FighterRef{a, b}
	bouts := []domain.BoutRef{finishedBout(a, b, 3, 3)}

	got := domain.ComputeStandings(members, bouts)

	byID := standingsByID(t, got)
	for _, id := range []string{"a", "b"} {
		s := byID[id]
		if s.Wins != 0 || s.Losses != 0 || s.Draws != 1 {
			t.Fatalf("fighter %s draw stats: %+v", id, s)
		}
	}
	if byID["a"].PointsScored != 3 || byID["a"].PointsConceded != 3 {
		t.Fatalf("fighter a points: %+v", byID["a"])
	}
	// Полная ничья по всем трём критериям (FR-3) — одно место.
	if byID["a"].Place != 1 || byID["b"].Place != 1 {
		t.Fatalf("draw places should tie at 1: a=%d b=%d", byID["a"].Place, byID["b"].Place)
	}
}

func TestComputeStandings_UnfinishedBoutsIgnored(t *testing.T) {
	a, b := fighter("a"), fighter("b")
	members := []domain.FighterRef{a, b}
	bouts := []domain.BoutRef{
		finishedBout(a, b, 5, 2),
		{ID: "rematch", FighterA: a, FighterB: b, State: domain.BoutStateInProgress, ScoreA: 10, ScoreB: 0},
	}

	got := domain.ComputeStandings(members, bouts)

	byID := standingsByID(t, got)
	if byID["a"].Wins != 1 || byID["a"].PointsScored != 5 {
		t.Fatalf("in-progress bout must not count: %+v", byID["a"])
	}
}

// TestComputeStandings_RoundRobinTieBreak — раунд-робин из 4 бойцов (AC-1):
// проверяет тай-брейк FR-2 (победы → набранные очки → пропущенные очки) на
// не полностью тривиальном наборе результатов.
func TestComputeStandings_RoundRobinTieBreak(t *testing.T) {
	a, b, c, d := fighter("a"), fighter("b"), fighter("c"), fighter("d")
	members := []domain.FighterRef{a, b, c, d}
	bouts := []domain.BoutRef{
		finishedBout(a, b, 5, 1), // a: +1W +5/-1; b: +1L +1/-5
		finishedBout(a, c, 5, 0), // a: +1W +5/-0; c: +1L +0/-5
		finishedBout(a, d, 5, 2), // a: +1W +5/-2; d: +1L +2/-5
		finishedBout(b, c, 5, 4), // b: +1W +5/-4; c: +1L +4/-5
		finishedBout(b, d, 1, 5), // b: +1L +1/-5; d: +1W +5/-1
		finishedBout(c, d, 5, 5), // c/d: draw +5/-5
	}
	// Итог: a 3W/0D/0L, 15 scored/3 conceded
	//       b 1W/0D/2L, 7 scored/11 conceded
	//       d 1W/1D/1L, 12 scored/11 conceded
	//       c 0W/1D/2L, 9 scored/15 conceded

	got := domain.ComputeStandings(members, bouts)

	wantOrder := []string{"a", "d", "b", "c"}
	if len(got) != len(wantOrder) {
		t.Fatalf("expected %d rows, got %d: %+v", len(wantOrder), len(got), got)
	}
	for i, id := range wantOrder {
		if got[i].Fighter.ID != id {
			t.Fatalf("position %d: want %s, got %s (%+v)", i, id, got[i].Fighter.ID, got[i])
		}
		if got[i].Place != i+1 {
			t.Fatalf("position %d (%s): want place %d, got %d", i, id, i+1, got[i].Place)
		}
	}
}

// TestComputeStandings_FullTieSharesPlace — AC-3: два бойца, полностью
// равные по wins/scored/conceded, делят место; следующий получает место со
// сдвигом на размер группы (1,2,2,4 — не 1,2,2,3).
func TestComputeStandings_FullTieSharesPlace(t *testing.T) {
	a, b, c, d := fighter("a"), fighter("b"), fighter("c"), fighter("d")
	members := []domain.FighterRef{a, b, c, d}
	bouts := []domain.BoutRef{
		finishedBout(a, d, 5, 0), // a: 1W 5/0
		finishedBout(b, d, 5, 0), // b: 1W 5/0 — a и b полностью равны
		finishedBout(c, d, 1, 0), // c: 1W 1/0
	}

	got := domain.ComputeStandings(members, bouts)

	byID := standingsByID(t, got)
	if byID["a"].Place != 1 || byID["b"].Place != 1 {
		t.Fatalf("a and b must tie at place 1: a=%d b=%d", byID["a"].Place, byID["b"].Place)
	}
	if byID["c"].Place != 3 {
		t.Fatalf("c must be place 3 (1,1,3 skip), got %d", byID["c"].Place)
	}
	if byID["d"].Place != 4 {
		t.Fatalf("d must be place 4, got %d", byID["d"].Place)
	}
}

func standingsByID(t *testing.T, standings []domain.Standing) map[string]domain.Standing {
	t.Helper()
	out := make(map[string]domain.Standing, len(standings))
	for _, s := range standings {
		out[s.Fighter.ID] = s
	}
	return out
}
