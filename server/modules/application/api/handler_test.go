package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/application/service"
	"github.com/hema/server/modules/application/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	applicantUserID = "00000000-0000-0000-0000-0000000000a1"
	otherUserID     = "00000000-0000-0000-0000-0000000000a2"
	adminUserID     = "00000000-0000-0000-0000-0000000000ad"
	nominationID    = "00000000-0000-0000-0000-00000000b001"
	tournamentID    = "00000000-0000-0000-0000-00000000c001"
)

type clients struct {
	app         hemav1connect.ApplicationServiceClient
	admin       hemav1connect.ApplicationAdminServiceClient
	public      hemav1connect.ApplicationPublicServiceClient
	nominations *testutil.FakeNominationProvider
	users       *testutil.FakeUserProvider
}

func setup(t *testing.T) clients {
	t.Helper()

	repo := testutil.NewFakeRepo()
	nominations := testutil.NewFakeNominationProvider()
	nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	users := testutil.NewFakeUserProvider()
	users.Set(applicantUserID, "Applicant Name")
	users.Set(adminUserID, "Admin Name")

	svc := service.New(repo, nominations, users)
	appHandler := NewHandler(svc)
	adminHandler := NewAdminHandler(svc)
	publicHandler := NewPublicHandler(svc)

	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	appPath, appH := hemav1connect.NewApplicationServiceHandler(appHandler, baseOpts...)
	adminPath, adminH := hemav1connect.NewApplicationAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)
	pubPath, pubH := hemav1connect.NewApplicationPublicServiceHandler(publicHandler, baseOpts...)

	mux := http.NewServeMux()
	mux.Handle(appPath, appH)
	mux.Handle(adminPath, adminH)
	mux.Handle(pubPath, pubH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return clients{
		app:         hemav1connect.NewApplicationServiceClient(client, server.URL),
		admin:       hemav1connect.NewApplicationAdminServiceClient(client, server.URL),
		public:      hemav1connect.NewApplicationPublicServiceClient(client, server.URL),
		nominations: nominations,
		users:       users,
	}
}

func bearer(t *testing.T, userID, role string) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(userID, role)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return "Bearer " + pair.Access
}

func authedReq[T any](t *testing.T, msg *T, userID, role string) *connect.Request[T] {
	t.Helper()
	req := connect.NewRequest(msg)
	req.Header().Set("Authorization", bearer(t, userID, role))
	return req
}

func TestFullFlow_SubmitDeclareConfirmRegister_E2E(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	submitResp, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id
	if submitResp.Msg.Application.State != hemav1.ApplicationState_APPLICATION_STATE_SUBMITTED {
		t.Fatalf("expected SUBMITTED, got %s", submitResp.Msg.Application.State)
	}
	if submitResp.Msg.Application.ApplicantDisplayName != "Applicant Name" {
		t.Fatalf("expected display name enriched, got %q", submitResp.Msg.Application.ApplicantDisplayName)
	}

	declareResp, err := c.app.DeclarePayment(ctx, authedReq(t, &hemav1.DeclarePaymentRequest{
		ApplicationId: appID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	if declareResp.Msg.Application.State != hemav1.ApplicationState_APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION {
		t.Fatalf("expected AWAITING_PAYMENT_CONFIRMATION, got %s", declareResp.Msg.Application.State)
	}

	confirmResp, err := c.admin.ConfirmPayment(ctx, authedReq(t, &hemav1.ConfirmPaymentRequest{
		ApplicationId: appID,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ConfirmPayment: %v", err)
	}
	if confirmResp.Msg.Application.State != hemav1.ApplicationState_APPLICATION_STATE_PAID {
		t.Fatalf("expected PAID, got %s", confirmResp.Msg.Application.State)
	}

	registerResp, err := c.admin.RegisterFighter(ctx, authedReq(t, &hemav1.RegisterFighterRequest{
		ApplicationId: appID,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("RegisterFighter: %v", err)
	}
	if registerResp.Msg.Application.State != hemav1.ApplicationState_APPLICATION_STATE_REGISTERED {
		t.Fatalf("expected REGISTERED, got %s", registerResp.Msg.Application.State)
	}
	if registerResp.Msg.CapacityExceeded {
		t.Fatalf("expected no capacity warning (no capacity set)")
	}

	getResp, err := c.app.GetApplication(ctx, authedReq(t, &hemav1.GetApplicationRequest{
		ApplicationId: appID,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("GetApplication: %v", err)
	}
	if len(getResp.Msg.History) != 4 {
		t.Fatalf("expected 4 history events, got %d", len(getResp.Msg.History))
	}
	wantTypes := []hemav1.ApplicationEventType{
		hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_SUBMITTED,
		hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_PAYMENT_DECLARED,
		hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED,
		hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED,
	}
	for i, ev := range getResp.Msg.History {
		if ev.Type != wantTypes[i] {
			t.Fatalf("history[%d]: expected %s, got %s", i, wantTypes[i], ev.Type)
		}
	}
}

func TestSecretaryRights_RegularUserForbidden(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	submitResp, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id

	_, err = c.admin.ConfirmPayment(ctx, authedReq(t, &hemav1.ConfirmPaymentRequest{
		ApplicationId: appID,
	}, applicantUserID, "user"))
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("expected CodePermissionDenied, got %v (%v)", connect.CodeOf(err), err)
	}
}

func TestOwnerRights_OtherUserForbidden(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	submitResp, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id

	_, err = c.app.DeclarePayment(ctx, authedReq(t, &hemav1.DeclarePaymentRequest{
		ApplicationId: appID,
	}, otherUserID, "user"))
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("expected CodePermissionDenied, got %v (%v)", connect.CodeOf(err), err)
	}
}

func TestErrorMapping_InvalidTransitionAndDuplicate(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	submitResp, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id

	_, err = c.admin.ConfirmPayment(ctx, authedReq(t, &hemav1.ConfirmPaymentRequest{
		ApplicationId: appID,
	}, adminUserID, "admin"))
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected CodeFailedPrecondition, got %v (%v)", connect.CodeOf(err), err)
	}

	_, err = c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Fatalf("expected CodeAlreadyExists, got %v (%v)", connect.CodeOf(err), err)
	}
}

func TestErrorMapping_NominationNotFound(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: "missing-nomination",
	}, applicantUserID, "user"))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("expected CodeNotFound, got %v (%v)", connect.CodeOf(err), err)
	}
}

func TestListApplications_AdminOverviewWithFilters(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	const otherNomination = "00000000-0000-0000-0000-00000000b002"
	c.nominations.Set(otherNomination, domain.NominationInfo{TournamentID: tournamentID})
	c.users.Set(otherUserID, "Other Name")

	submitResp, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("SubmitApplication 1: %v", err)
	}
	if _, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: otherNomination,
	}, otherUserID, "user")); err != nil {
		t.Fatalf("SubmitApplication 2: %v", err)
	}

	filterNominationID := nominationID
	listResp, err := c.admin.ListApplications(ctx, authedReq(t, &hemav1.ListApplicationsRequest{
		TournamentId: tournamentID,
		NominationId: &filterNominationID,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ListApplications: %v", err)
	}
	if len(listResp.Msg.Applications) != 1 || listResp.Msg.Applications[0].Id != submitResp.Msg.Application.Id {
		t.Fatalf("expected filtered result to contain only app1, got %+v", listResp.Msg.Applications)
	}
}

func TestListNominationParticipants_Public(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	capacity := int32(1)
	c.nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID, FighterCapacity: &capacity})

	submitResp, err := c.app.SubmitApplication(ctx, authedReq(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, applicantUserID, "user"))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id
	if _, err := c.app.DeclarePayment(ctx, authedReq(t, &hemav1.DeclarePaymentRequest{ApplicationId: appID}, applicantUserID, "user")); err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	if _, err := c.admin.ConfirmPayment(ctx, authedReq(t, &hemav1.ConfirmPaymentRequest{ApplicationId: appID}, adminUserID, "admin")); err != nil {
		t.Fatalf("ConfirmPayment: %v", err)
	}

	// Public read — no auth token at all.
	resp, err := c.public.ListNominationParticipants(ctx, connect.NewRequest(&hemav1.ListNominationParticipantsRequest{
		NominationId: nominationID,
	}))
	if err != nil {
		t.Fatalf("ListNominationParticipants (public, no token): %v", err)
	}
	if resp.Msg.AppliedCount != 1 {
		t.Fatalf("expected applied_count=1, got %d", resp.Msg.AppliedCount)
	}
	if resp.Msg.ConfirmedCount != 1 {
		t.Fatalf("expected confirmed_count=1, got %d", resp.Msg.ConfirmedCount)
	}
	if resp.Msg.FighterCapacity == nil || *resp.Msg.FighterCapacity != 1 {
		t.Fatalf("expected fighter_capacity=1, got %v", resp.Msg.FighterCapacity)
	}
	if len(resp.Msg.Participants) != 1 || resp.Msg.Participants[0].DisplayName != "Applicant Name" {
		t.Fatalf("expected participant with display name, got %+v", resp.Msg.Participants)
	}
}
